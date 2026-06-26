/**
 * Data-access layer over the permintaan_ai table (AI request lifecycle state
 * machine). Pure repository functions — no authz logic, no validation, no
 * audit. Composed by the action layer (T6).
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * STATE MACHINE (AC#4): `status` flows dibuat -> diproses -> selesai | gagal |
 * dibatalkan. `ubahStatusPermintaanAi` is the single transition primitive: it
 * stamps `diprosesPada` on entry to 'diproses' and `selesaiPada` on entry to a
 * terminal state ('selesai' | 'gagal' | 'dibatalkan'). `pesanError` is set
 * only when transitioning to 'gagal'. The repo does NOT enforce legal
 * transitions — that is the action layer's job; this primitive just writes the
 * new state + its timestamp side-effects. A retry is a NEW row carrying
 * `permintaanTerkaitId` pointing at the prior attempt (schema ON DELETE SET
 * NULL). `batalkanPermintaanAi` is a convenience over the primitive.
 */
import { and, desc, eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { permintaanAi } from "../schema";
import type { PermintaanAi } from "../schema";

/** Mirrors the schema CHECK constraint on `permintaan_ai.status`. */
export type StatusPermintaanAi =
  | "dibuat"
  | "diproses"
  | "selesai"
  | "gagal"
  | "dibatalkan";

/** Mirrors the schema CHECK constraint on `permintaan_ai.jenis`. */
export type JenisPermintaanAi =
  | "deskripsi_cp"
  | "deskripsi_tp"
  | "deskripsi_atp"
  | "narasi_raport";

/**
 * Input for `buatPermintaanAi`. `konteks` is the JSONB context blob for the AI
 * request (mapel, fase, elemen, ...). `permintaanTerkaitId` is the optional
 * retry linkage to a prior attempt (self-FK, ON DELETE SET NULL).
 */
export interface InputBuatPermintaanAi {
  readonly jenis: JenisPermintaanAi;
  readonly konteks: Record<string, unknown>;
  readonly dibuatOleh: string;
  readonly permintaanTerkaitId?: string | null;
}

/**
 * Optional filters for `listPermintaanAi`. Every field is independently
 * optional; only the supplied fields constrain the result. All omitted ->
 * return every permintaan_ai row visible under the current tenant, newest
 * first.
 */
export interface OpsiListPermintaanAi {
  readonly status?: StatusPermintaanAi;
  readonly dibuatOleh?: string;
}

/**
 * Optional side-effects for `ubahStatusPermintaanAi`. `pesanError` is written
 * only when transitioning to 'gagal'; on every other transition it is ignored
 * (the existing value, if any, is preserved).
 */
export interface OpsiUbahStatus {
  readonly pesanError?: string;
}

// CRUD + state machine ------------------------------------------------------

/**
 * Create a permintaan_ai with `status='dibuat'` (schema default). Runs inside
 * `withTenant` so `tenant_id` defaults from the GUC. Returns the inserted row
 * with all fields populated (id, timestamps, default status).
 */
export async function buatPermintaanAi(
  db: Db | Tx,
  input: InputBuatPermintaanAi
): Promise<PermintaanAi> {
  const [row] = await db
    .insert(permintaanAi)
    .values({
      jenis: input.jenis,
      konteks: input.konteks,
      dibuatOleh: input.dibuatOleh,
      permintaanTerkaitId: input.permintaanTerkaitId ?? null,
    })
    .returning();
  return row;
}

/**
 * Find a permintaan_ai by id within the current tenant (RLS-scoped). Returns
 * null when absent (including when the id exists only in another tenant).
 */
export async function cariPermintaanAiById(
  db: Db | Tx,
  id: string
): Promise<PermintaanAi | null> {
  const rows = await db
    .select()
    .from(permintaanAi)
    .where(eq(permintaanAi.id, id));
  return rows[0] ?? null;
}

/**
 * List permintaan_ai rows under the current tenant (RLS-scoped), newest first
 * (`dibuatPada` DESC). Optional filters narrow the result independently; only
 * the supplied fields constrain the query. A cross-tenant status / dibuatOleh
 * filter yields `[]` only when no matching rows exist in this tenant — RLS
 * hides foreign rows regardless.
 */
export async function listPermintaanAi(
  db: Db | Tx,
  opts?: OpsiListPermintaanAi
): Promise<PermintaanAi[]> {
  const filters = [];
  if (opts?.status) filters.push(eq(permintaanAi.status, opts.status));
  if (opts?.dibuatOleh)
    filters.push(eq(permintaanAi.dibuatOleh, opts.dibuatOleh));

  return db
    .select()
    .from(permintaanAi)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(permintaanAi.dibuatPada));
}

/**
 * AC#4 state-machine transition primitive. Updates `status` and stamps the
 * matching lifecycle timestamp:
 *   - 'diproses'                               -> diprosesPada = now()
 *   - 'selesai' | 'gagal' | 'dibatalkan'      -> selesaiPada  = now()
 *   - 'dibuat' (re-init not expected)         -> neither timestamp touched
 * `pesanError` (opts) is written ONLY when status='gagal'; on every other
 * transition the existing pesanError is preserved untouched. Returns the
 * updated row. Throws when the row is absent (RLS cross-tenant or missing id)
 * — a silent no-op would mask failure for the action layer.
 */
export async function ubahStatusPermintaanAi(
  db: Db | Tx,
  id: string,
  status: StatusPermintaanAi,
  opts?: OpsiUbahStatus
): Promise<PermintaanAi> {
  const set: Partial<PermintaanAi> = { status };
  if (status === "diproses") {
    set.diprosesPada = new Date();
  } else if (status === "selesai" || status === "gagal" || status === "dibatalkan") {
    set.selesaiPada = new Date();
  }
  if (status === "gagal" && opts?.pesanError !== undefined) {
    set.pesanError = opts.pesanError;
  }

  const rows = await db
    .update(permintaanAi)
    .set(set)
    .where(eq(permintaanAi.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Permintaan AI tidak ditemukan");
  }
  return rows[0];
}

/**
 * AC#4 convenience: user-initiated cancel. Delegates to
 * `ubahStatusPermintaanAi(id, 'dibatalkan')` which stamps `selesaiPada`. A
 * retry is a separate `buatPermintaanAi` call carrying `permintaanTerkaitId`.
 */
export async function batalkanPermintaanAi(
  db: Db | Tx,
  id: string
): Promise<PermintaanAi> {
  return ubahStatusPermintaanAi(db, id, "dibatalkan");
}
