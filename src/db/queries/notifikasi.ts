/**
 * Data-access layer over the notifikasi + preferensi_notifikasi tables (#20,
 * MVP). Pure repository functions — no authz logic, no validation, no audit.
 * Composed by the action layer (T5) and page (T6).
 *
 * MVP SCOPE (AC#5): in-app ONLY. This module MUST NOT import or invoke any
 * email / WhatsApp / SMS / push library. The proof lives in
 * `actions.test.ts` describe block "AC#5: no external delivery". Creating a
 * notifikasi row is the ONLY side effect of `buatNotifikasi` — there is no
 * outbound send.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * SELF-OWNERSHIP (AC#3/#5): every `listByPengguna` / `hitung` / `tandai*`
 * query is scoped by `pengguna_id` so a Pengguna sees/manages ONLY their own
 * rows. The action layer additionally enforces that the requested
 * `pengguna_id` equals `akses.pengguna.id` (cannot target another user).
 */
import { and, count, desc, eq, notInArray, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { notifikasi, preferensiNotifikasi } from "../schema";
import type { Notifikasi, PreferensiNotifikasi } from "../schema";

/** Closed vocabulary of Notifikasi `tipe` values (MVP). */
export const TIPE_NOTIFIKASI = [
  "tugas_nilai",
  "tugas_absensi",
  "tugas_eraport",
  "umum",
] as const;

/** A Notifikasi `tipe` literal. */
export type TipeNotifikasi = (typeof TIPE_NOTIFIKASI)[number];

/** Input to {@linkcode buatNotifikasi}. `konteks` is optional deep-link JSON. */
export interface InputNotifikasi {
  readonly penggunaId: string;
  readonly tipe: string;
  readonly judul: string;
  readonly pesan: string;
  readonly konteks?: Record<string, unknown>;
}

/** Input to {@linkcode aturPreferensiNotifikasi} (upsert on UNIQUE). */
export interface InputPreferensiNotifikasi {
  readonly penggunaId: string;
  readonly tipe: string;
  readonly aktif: boolean;
}

/** Default row cap for list queries — prevents unbounded recipient scans. */
const DEFAULT_LIMIT = 200;

/** Options for {@linkcode listNotifikasiByPengguna}. */
export interface OpsiListNotifikasi {
  /** When true, return only unread (dibaca = false) rows. */
  readonly hanyaBelumDibaca?: boolean;
}

/**
 * Find a notifikasi by id (tenant-scoped via the surrounding withTenant — RLS
 * hides cross-tenant rows). Used by the action layer for the AC#3/#5 ownership
 * check (resolve row, then verify `row.penggunaId === akses.pengguna.id`).
 */
export async function cariNotifikasiById(
  db: Db | Tx,
  id: string
): Promise<Notifikasi | null> {
  const rows = await db
    .select()
    .from(notifikasi)
    .where(eq(notifikasi.id, id));
  return rows[0] ?? null;
}

/**
 * Create a notifikasi addressed to one Pengguna. Runs inside `withTenant` so
 * `tenant_id` defaults from the GUC. MVP: the ONLY effect is the row insert —
 * there is NO external delivery (no email/WhatsApp/SMS).
 */
export async function buatNotifikasi(
  db: Db | Tx,
  input: InputNotifikasi
): Promise<Notifikasi> {
  const [row] = await db
    .insert(notifikasi)
    .values({
      penggunaId: input.penggunaId,
      tipe: input.tipe,
      judul: input.judul,
      pesan: input.pesan,
      konteks: input.konteks ?? null,
    })
    .returning();
  return row;
}

/**
 * List notifikasi addressed to `penggunaId` under the current tenant (RLS +
 * recipient-scoped). Ordered `dibuatPada DESC` (newest first — the inbox view).
 * Pass `{ hanyaBelumDibaca: true }` for the unread-only view.
 */
export async function listNotifikasiByPengguna(
  db: Db | Tx,
  penggunaId: string,
  opts?: OpsiListNotifikasi
): Promise<Notifikasi[]> {
  return db
    .select()
    .from(notifikasi)
    .where(
      and(
        eq(notifikasi.penggunaId, penggunaId),
        opts?.hanyaBelumDibaca ? eq(notifikasi.dibaca, false) : undefined
      )
    )
    .orderBy(desc(notifikasi.dibuatPada))
    .limit(DEFAULT_LIMIT);
}

/**
 * Count unread notifikasi for `penggunaId` under the current tenant. Powers the
 * header badge. Returns `0` when there are none.
 */
export async function hitungBelumDibaca(
  db: Db | Tx,
  penggunaId: string
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifikasi)
    .where(
      and(
        eq(notifikasi.penggunaId, penggunaId),
        eq(notifikasi.dibaca, false)
      )
    );
  return Number(row?.n ?? 0);
}

/**
 * Mark ONE notifikasi as read by id. RLS scopes the update to the current
 * tenant — a cross-tenant id is a silent no-op (throws "tidak ditemukan").
 *
 * RECIPIENT OWNERSHIP is NOT checked here — repos are pure (matching the
 * penilaian pattern). The action layer resolves the row and verifies
 * `row.penggunaId === akses.pengguna.id` BEFORE calling this (AC#3/#5 of #20).
 */
export async function tandaiDibaca(
  db: Db | Tx,
  id: string
): Promise<Notifikasi> {
  const rows = await db
    .update(notifikasi)
    .set({ dibaca: true })
    .where(eq(notifikasi.id, id))
    .returning();
  if (rows.length === 0) {
    throw new Error("Notifikasi tidak ditemukan");
  }
  return rows[0];
}

/**
 * Mark ALL notifikasi for `penggunaId` under the current tenant as read.
 * Returns the number of rows updated (0 when none were unread).
 */
export async function tandaiSemuaDibaca(
  db: Db | Tx,
  penggunaId: string
): Promise<number> {
  const rows = await db
    .update(notifikasi)
    .set({ dibaca: true })
    .where(
      and(
        eq(notifikasi.penggunaId, penggunaId),
        eq(notifikasi.dibaca, false)
      )
    )
    .returning();
  return rows.length;
}

/**
 * Get all preferensi_notifikasi rows for `penggunaId` under the current tenant.
 * Convention: a MISSING row for a `tipe` means the tipe is ON (`aktif`). Only
 * explicit rows are returned — callers treat absence as aktif.
 */
export async function getPreferensiNotifikasi(
  db: Db | Tx,
  penggunaId: string
): Promise<PreferensiNotifikasi[]> {
  return db
    .select()
    .from(preferensiNotifikasi)
    .where(eq(preferensiNotifikasi.penggunaId, penggunaId));
}

/**
 * Upsert a preferensi_notifikasi row for `(penggunaId, tipe)` on the UNIQUE
 * constraint. Runs inside `withTenant` so `tenant_id` defaults from the GUC.
 */
export async function aturPreferensiNotifikasi(
  db: Db | Tx,
  input: InputPreferensiNotifikasi
): Promise<PreferensiNotifikasi> {
  const [row] = await db
    .insert(preferensiNotifikasi)
    .values({
      penggunaId: input.penggunaId,
      tipe: input.tipe,
      aktif: input.aktif,
    })
    .onConflictDoUpdate({
      target: [
        preferensiNotifikasi.tenantId,
        preferensiNotifikasi.penggunaId,
        preferensiNotifikasi.tipe,
      ],
      set: { aktif: input.aktif },
    })
    .returning();
  return row;
}

/**
 * List notifikasi for `penggunaId` filtered by their preferensi: a notification
 * is included UNLESS its `tipe` has an explicit `aktif = false` preference.
 * (Convention: missing preference = aktif.) Ordered `dibuatPada DESC`.
 *
 * Single SQL query: the inactive-tipe set is resolved as a correlated subquery
 * (`NOT IN (SELECT tipe FROM preferensi_notifikasi WHERE pengguna_id=? AND
 * aktif=false)`) so the database filters — no JS-side `.filter()` over the full
 * candidate set. When no preference is inactive, the subquery yields no rows
 * and `NOT IN (empty)` is TRUE for all tipe, so every notification is returned.
 */
export async function listNotifikasiAktif(
  db: Db | Tx,
  penggunaId: string
): Promise<Notifikasi[]> {
  const tipeNonaktifSubquery = sql<{
    tipe: string;
  }[]>`(SELECT ${preferensiNotifikasi.tipe} FROM ${preferensiNotifikasi} WHERE ${preferensiNotifikasi.penggunaId} = ${penggunaId} AND ${preferensiNotifikasi.aktif} = false)`;

  return db
    .select()
    .from(notifikasi)
    .where(
      and(
        eq(notifikasi.penggunaId, penggunaId),
        notInArray(notifikasi.tipe, tipeNonaktifSubquery)
      )
    )
    .orderBy(desc(notifikasi.dibuatPada))
    .limit(DEFAULT_LIMIT);
}

/** Re-exported for action-layer ownership helpers. */
export { notifikasi as notifikasiTable, preferensiNotifikasi as preferensiNotifikasiTable };
