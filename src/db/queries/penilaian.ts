/**
 * Data-access layer over the penilaian table (individual assessment within a
 * komponen_nilai — e.g. "Tugas 1", "Ujian Tengah Semester"). Pure repository
 * functions — no authz logic, no validation, no audit. Composed by the
 * T4/T5/T6 layers.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * Domain: `tanggal` is the assessment date (ISO `YYYY-MM-DD`); `dibuatOleh` is
 * the aktor userId. UNIQUE (tenant, komponen_nilai, nama) is enforced by the
 * schema — the repo passes input through and lets the DB reject duplicates.
 */
import { asc, eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { penilaian } from "../schema";
import type { Penilaian } from "../schema";

export interface InputPenilaian {
  readonly komponenNilaiId: string;
  readonly nama: string;
  /** Assessment date as ISO `YYYY-MM-DD`. */
  readonly tanggal: string;
  readonly dibuatOleh?: string;
}

/**
 * List penilaian visible under the current tenant (RLS-scoped), ordered by
 * `dibuatPada` ascending for stable chronological display. When
 * `komponenNilaiId` is provided, narrows to assessments within that component.
 */
export async function listPenilaian(
  db: Db | Tx,
  komponenNilaiId?: string
): Promise<Penilaian[]> {
  return db
    .select()
    .from(penilaian)
    .where(
      komponenNilaiId !== undefined
        ? eq(penilaian.komponenNilaiId, komponenNilaiId)
        : undefined
    )
    .orderBy(asc(penilaian.dibuatPada));
}

/**
 * Create a penilaian. Runs inside `withTenant` so `tenant_id` defaults from
 * the GUC.
 */
export async function buatPenilaian(
  db: Db | Tx,
  input: InputPenilaian
): Promise<Penilaian> {
  const [row] = await db
    .insert(penilaian)
    .values({
      komponenNilaiId: input.komponenNilaiId,
      nama: input.nama,
      tanggal: input.tanggal,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .returning();
  return row;
}

/**
 * Update a penilaian. Only provided fields are written. Throws when the row
 * is absent (RLS cross-tenant or missing id) — a silent no-op would mask
 * failure.
 */
export async function ubahPenilaian(
  db: Db | Tx,
  id: string,
  input: Partial<InputPenilaian>
): Promise<Penilaian> {
  const set: Partial<Penilaian> = {};
  if (input.komponenNilaiId !== undefined)
    set.komponenNilaiId = input.komponenNilaiId;
  if (input.nama !== undefined) set.nama = input.nama;
  if (input.tanggal !== undefined) set.tanggal = input.tanggal;
  if (input.dibuatOleh !== undefined) set.dibuatOleh = input.dibuatOleh;

  const rows = await db
    .update(penilaian)
    .set(set)
    .where(eq(penilaian.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Penilaian tidak ditemukan");
  }
  return rows[0];
}

/**
 * Delete a penilaian by id. RLS scopes to the current tenant — a cross-tenant
 * delete is a silent no-op (zero rows affected).
 */
export async function hapusPenilaian(db: Db | Tx, id: string): Promise<void> {
  await db.delete(penilaian).where(eq(penilaian.id, id));
}
