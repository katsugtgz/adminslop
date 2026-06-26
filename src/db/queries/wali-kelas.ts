/**
 * Data-access layer over the wali_kelas table (class guardian assignment).
 * Pure repository functions — no authz logic, no validation, no audit. Composed
 * by the action layer (T6).
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#3 CURRENT-STATE ASSIGNMENT (load-bearing): wali_kelas is a CURRENT-STATE
 * assignment, NOT append-only history. Exactly one wali per
 * (tenant, rombongan_belajar, tahun_ajaran, semester). Changing the wali for a
 * period is an UPDATE via `upsertWaliKelas` (ON CONFLICT DO UPDATE), never a
 * second insert. Past-period rows persist for historical context — they are
 * never rewritten because the conflict key includes tahun_ajaran + semester.
 *
 * AC#4 GURU CONTEXT: `getWaliKelasSaya` resolves the rombels a PTK is the wali
 * of for the active (tahun_ajaran, semester) period.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { waliKelas } from "../schema";
import type { WaliKelas } from "../schema";

/** Semester mirrors the schema CHECK constraint: ganjil (odd) / genap (even). */
export type Semester = "ganjil" | "genap";

/**
 * Input for `upsertWaliKelas`. The (rombonganBelajarId, tahunAjaranId,
 * semester) tuple is unique per tenant (schema constraint) — one wali per
 * rombel per period. `dibuatOleh` is the aktor userId (WorkOS User.id),
 * optional; defaults to `null` when omitted.
 */
export interface InputUpsertWaliKelas {
  readonly ptkId: string;
  readonly rombonganBelajarId: string;
  readonly tahunAjaranId: string;
  readonly semester: Semester;
  readonly dibuatOleh?: string;
}

/**
 * Optional filters for `listWaliKelas`. Every field is independently optional;
 * only the supplied fields constrain the result. All omitted → return every
 * wali_kelas row visible under the current tenant.
 */
export interface OpsiListWaliKelas {
  readonly ptkId?: string;
  readonly rombonganBelajarId?: string;
  readonly tahunAjaranId?: string;
  readonly semester?: Semester;
}

/**
 * List wali_kelas rows under the current tenant (RLS-scoped), ordered
 * chronologically by `dibuat_pada` ASC. Optional filters narrow the result;
 * only the supplied fields constrain the query. A cross-tenant ptkId /
 * rombonganBelajarId / tahunAjaranId yields `[]` (RLS hides foreign rows).
 */
export async function listWaliKelas(
  db: Db | Tx,
  opts?: OpsiListWaliKelas
): Promise<WaliKelas[]> {
  const filters = [];
  if (opts?.ptkId) filters.push(eq(waliKelas.ptkId, opts.ptkId));
  if (opts?.rombonganBelajarId)
    filters.push(eq(waliKelas.rombonganBelajarId, opts.rombonganBelajarId));
  if (opts?.tahunAjaranId)
    filters.push(eq(waliKelas.tahunAjaranId, opts.tahunAjaranId));
  if (opts?.semester) filters.push(eq(waliKelas.semester, opts.semester));

  return db
    .select()
    .from(waliKelas)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(waliKelas.dibuatPada));
}

/**
 * AC#3: insert or update the wali for a (rombongan_belajar, tahun_ajaran,
 * semester) period. The schema UNIQUE constraint
 * `(tenant_id, rombongan_belajar_id, tahun_ajaran_id, semester)` makes this an
 * upsert — re-assigning the wali for the CURRENT period is an UPDATE
 * (`ptk_id`, `dibuat_oleh` overwritten), not a second insert. Past-period rows
 * (different TA or semester) are untouched because they fall outside the
 * conflict key. Runs inside `withTenant` so `tenant_id` defaults from the GUC.
 * Returns the inserted/updated row with all fields populated.
 */
export async function upsertWaliKelas(
  db: Db | Tx,
  input: InputUpsertWaliKelas
): Promise<WaliKelas> {
  const [row] = await db
    .insert(waliKelas)
    .values({
      ptkId: input.ptkId,
      rombonganBelajarId: input.rombonganBelajarId,
      tahunAjaranId: input.tahunAjaranId,
      semester: input.semester,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .onConflictDoUpdate({
      target: [
        waliKelas.tenantId,
        waliKelas.rombonganBelajarId,
        waliKelas.tahunAjaranId,
        waliKelas.semester,
      ],
      set: {
        ptkId: sql`excluded.ptk_id`,
        dibuatOleh: sql`excluded.dibuat_oleh`,
      },
    })
    .returning();
  return row;
}

/**
 * Delete a wali_kelas row by id. RLS scopes the delete to the current tenant —
 * a cross-tenant id is a silent no-op (zero rows affected, no error).
 */
export async function hapusWaliKelas(
  db: Db | Tx,
  id: string
): Promise<void> {
  await db.delete(waliKelas).where(eq(waliKelas.id, id));
}

/**
 * AC#4 guru context: resolve every rombel this PTK is the wali of for the
 * given (tahun_ajaran, semester) period. This is the teacher's "my classes
 * right now" lens — the active-period filter is load-bearing (without it the
 * result would mingle current and historical assignments). RLS scopes to the
 * current tenant; a cross-tenant ptkId yields `[]`. Order is chronological by
 * `dibuat_pada` ASC.
 */
export async function getWaliKelasSaya(
  db: Db | Tx,
  ptkId: string,
  tahunAjaranId: string,
  semester: Semester
): Promise<WaliKelas[]> {
  return db
    .select()
    .from(waliKelas)
    .where(
      and(
        eq(waliKelas.ptkId, ptkId),
        eq(waliKelas.tahunAjaranId, tahunAjaranId),
        eq(waliKelas.semester, semester)
      )
    )
    .orderBy(asc(waliKelas.dibuatPada));
}
