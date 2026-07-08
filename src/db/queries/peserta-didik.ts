/**
 * Data-access layer over the peserta_didik tables (peserta_didik +
 * riwayat_status_peserta_didik). Pure repository functions — no authz logic,
 * no validation, no audit. Composed by the T6 action layer.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * ACCEPTANCE CRITERION #2 (load-bearing): status changes are atomic. The
 * `peserta_didik.status` column is a DENORMALIZED CACHE of the latest
 * `riwayat_status_peserta_didik` row. `ubahStatus` appends a new riwayat row
 * AND updates the cache inside the caller's transaction — history is
 * append-only, never rewritten or deleted.
 */
import { desc, eq, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { pesertaDidik, riwayatStatusPesertaDidik } from "../schema";
import type { PesertaDidik, RiwayatStatusPesertaDidik } from "../schema";

/** Default row cap for list queries — prevents unbounded tenant scans. */
const DEFAULT_LIMIT = 500;

// Status + jenis-kelamin unions mirror the schema CHECK constraints.
export type StatusPesertaDidik = "aktif" | "pindah" | "lulus" | "keluar";
export type JenisKelamin = "L" | "P";

// Input shapes (camelCase; mirrors input conventions in akses.ts) ----------

export interface InputBuatPesertaDidik {
  readonly nama: string;
  readonly nisn?: string | null;
  readonly nis?: string | null;
  /** ISO date `YYYY-MM-DD`. */
  readonly tanggalLahir: string;
  readonly jenisKelamin: JenisKelamin;
}

export interface InputUbahBiodata {
  readonly nama?: string;
  readonly nisn?: string | null;
  readonly nis?: string | null;
  readonly tanggalLahir?: string;
  readonly jenisKelamin?: JenisKelamin;
}

export interface InputUbahStatus {
  readonly status: StatusPesertaDidik;
  readonly catatan?: string;
  /** Aktor userId (WorkOS User.id). */
  readonly dibuatOleh?: string;
}

// Peserta Didik CRUD -------------------------------------------------------

/**
 * List all peserta_didik visible under the current tenant (RLS-scoped), newest
 * first. `limit` caps the result set to prevent unbounded tenant scans (default
 * 500). Pass a higher limit when a caller legitimately needs more rows (e.g.
 * CSV-import duplicate detection).
 */
export async function listPesertaDidik(
  db: Db | Tx,
  limit: number = DEFAULT_LIMIT
): Promise<PesertaDidik[]> {
  return db
    .select()
    .from(pesertaDidik)
    .orderBy(desc(pesertaDidik.dibuatPada))
    .limit(limit);
}

/**
 * Find a peserta_didik by id within the current tenant (RLS-scoped). Returns
 * null when absent (including when the id exists only in another tenant).
 */
export async function cariPesertaDidikById(
  db: Db | Tx,
  id: string
): Promise<PesertaDidik | null> {
  const rows = await db
    .select()
    .from(pesertaDidik)
    .where(eq(pesertaDidik.id, id));
  return rows[0] ?? null;
}

/**
 * Create a peserta_didik. The row's `status` defaults to `'aktif'` (schema
 * default). To keep the status cache consistent with the append-only history
 * from the very first row, an INITIAL `riwayat_status_peserta_didik` row with
 * `status='aktif'` is inserted in the same transaction. Both inserts run inside
 * the caller's `withTenant` so `tenant_id` defaults from the GUC.
 */
export async function buatPesertaDidik(
  db: Db | Tx,
  input: InputBuatPesertaDidik
): Promise<PesertaDidik> {
  const [row] = await db
    .insert(pesertaDidik)
    .values({
      nama: input.nama,
      nisn: input.nisn ?? null,
      nis: input.nis ?? null,
      tanggalLahir: input.tanggalLahir,
      jenisKelamin: input.jenisKelamin,
    })
    .returning();

  // Seed the append-only history so the cache and the history agree from row
  // one. Without this, listRiwayatStatus would return [] right after create.
  await db.insert(riwayatStatusPesertaDidik).values({
    pesertaDidikId: row.id,
    status: "aktif",
    catatan: null,
    dibuatOleh: null,
  });

  return row;
}

/**
 * Update biodata ONLY (nama / nisn / nis / tanggalLahir / jenisKelamin). The
 * `status` cache is deliberately untouched — status changes flow through
 * `ubahStatus` so the append-only history stays consistent. Partial update:
 * only provided fields are written. Throws when the row is absent (RLS
 * cross-tenant or missing id) — a silent no-op would mask failure.
 */
export async function ubahPesertaDidik(
  db: Db | Tx,
  id: string,
  input: InputUbahBiodata
): Promise<PesertaDidik> {
  const set: Record<string, unknown> = { diperbaruiPada: sql`now()` };
  if (input.nama !== undefined) set.nama = input.nama;
  if (input.nisn !== undefined) set.nisn = input.nisn;
  if (input.nis !== undefined) set.nis = input.nis;
  if (input.tanggalLahir !== undefined) set.tanggalLahir = input.tanggalLahir;
  if (input.jenisKelamin !== undefined) set.jenisKelamin = input.jenisKelamin;

  const rows = await db
    .update(pesertaDidik)
    .set(set)
    .where(eq(pesertaDidik.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Peserta Didik tidak ditemukan");
  }
  return rows[0];
}

/**
 * Atomically transition the peserta_didik status (AC#2 — load-bearing).
 *
 * Two steps run in the caller's transaction so the denormalized cache and the
 * append-only history can never disagree:
 *   1. Append a new `riwayat_status_peserta_didik` row (history is append-only;
 *      existing rows are NEVER deleted or rewritten).
 *   2. Update `peserta_didik.status` (the cache) to mirror the new history row.
 *
 * Throws when the row is absent (RLS cross-tenant or missing id).
 */
export async function ubahStatus(
  db: Db | Tx,
  id: string,
  input: InputUbahStatus
): Promise<PesertaDidik> {
  // 1. Update the cache first. This is also the not-found detection point:
  //    `.returning()` yields 0 rows under RLS cross-tenant or for a missing id,
  //    and we throw BEFORE appending any history (avoids writing a riwayat row
  //    for a peserta_didik that doesn't exist, which would also violate the
  //    `riwayat_status_peserta_didik.peserta_didik_id` FK constraint).
  const rows = await db
    .update(pesertaDidik)
    .set({ status: input.status, diperbaruiPada: sql`now()` })
    .where(eq(pesertaDidik.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Peserta Didik tidak ditemukan");
  }

  // 2. Append the history row. Cache + history stay consistent because both
  //    mutations run in the caller's transaction (AC#2 — history is append-only,
  //    never rewritten or deleted).
  await db.insert(riwayatStatusPesertaDidik).values({
    pesertaDidikId: id,
    status: input.status,
    catatan: input.catatan ?? null,
    dibuatOleh: input.dibuatOleh ?? null,
  });

  return rows[0];
}

/**
 * List the append-only status history for a peserta_didik, oldest first
 * (chronological). RLS scopes to the current tenant.
 */
export async function listRiwayatStatus(
  db: Db | Tx,
  pesertaDidikId: string
): Promise<RiwayatStatusPesertaDidik[]> {
  return db
    .select()
    .from(riwayatStatusPesertaDidik)
    .where(eq(riwayatStatusPesertaDidik.pesertaDidikId, pesertaDidikId))
    .orderBy(riwayatStatusPesertaDidik.dibuatPada);
}
