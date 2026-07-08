/**
 * Data-access layer over the komponen_nilai table (grading component tied to a
 * Beban Mengajar — UTS / UAS / Tugas Harian / ...). Pure repository functions
 * — no authz logic, no validation, no audit. Composed by the T4/T5/T6 layers.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#3 (visible & auditable bobot): `bobot` is the positive weight used for
 * Nilai Akhir derivation. The `komponen_nilai_bobot_check` schema constraint
 * enforces positivity — the repo passes the input through. The schema column
 * is `numeric`, so the JS `number` input is stringified on write; the
 * returned `KomponenNilai.bobot` is therefore a string (drizzle numeric
 * mapping).
 */
import { asc, eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { komponenNilai } from "../schema";
import type { KomponenNilai } from "../schema";
import { assertReturnedRow } from "@/lib/validation";

export interface InputKomponenNilai {
  readonly bebanMengajarId: string;
  readonly nama: string;
  readonly bobot: number;
}

// CRUD ---------------------------------------------------------------------

/**
 * List komponen_nilai visible under the current tenant (RLS-scoped), ordered
 * by `dibuatPada` ascending for stable chronological display. When
 * `bebanMengajarId` is provided, results narrow to that teaching load.
 */
export async function listKomponenNilai(
  db: Db | Tx,
  bebanMengajarId?: string
): Promise<KomponenNilai[]> {
  return db
    .select()
    .from(komponenNilai)
    .where(
      bebanMengajarId !== undefined
        ? eq(komponenNilai.bebanMengajarId, bebanMengajarId)
        : undefined
    )
    .orderBy(asc(komponenNilai.dibuatPada));
}

/**
 * Create a komponen_nilai. Runs inside `withTenant` so `tenant_id` defaults
 * from the GUC. The bobot positivity + (tenant, beban, nama) uniqueness are
 * enforced by schema constraints — the repo passes the input through.
 */
export async function buatKomponenNilai(
  db: Db | Tx,
  input: InputKomponenNilai
): Promise<KomponenNilai> {
  const [row] = await db
    .insert(komponenNilai)
    .values({
      bebanMengajarId: input.bebanMengajarId,
      nama: input.nama,
      bobot: input.bobot.toString(),
    })
    .returning();
  return assertReturnedRow(row, "Komponen Nilai gagal dibuat");
}

/**
 * Update a komponen_nilai. Only provided fields are written. Throws when the
 * row is absent (RLS cross-tenant or missing id) — a silent no-op would mask
 * failure.
 */
export async function ubahKomponenNilai(
  db: Db | Tx,
  id: string,
  input: Partial<InputKomponenNilai>
): Promise<KomponenNilai> {
  const set: Partial<KomponenNilai> = {};
  if (input.bebanMengajarId !== undefined)
    set.bebanMengajarId = input.bebanMengajarId;
  if (input.nama !== undefined) set.nama = input.nama;
  if (input.bobot !== undefined) set.bobot = input.bobot.toString();

  const rows = await db
    .update(komponenNilai)
    .set(set)
    .where(eq(komponenNilai.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Komponen Nilai tidak ditemukan");
  }
  return rows[0];
}

/**
 * Delete a komponen_nilai by id. Throws on missing/RLS-hidden rows so callers
 * do not audit a write that never happened.
 */
export async function hapusKomponenNilai(
  db: Db | Tx,
  id: string
): Promise<void> {
  const [row] = await db
    .delete(komponenNilai)
    .where(eq(komponenNilai.id, id))
    .returning({ id: komponenNilai.id });
  assertReturnedRow(row, "Komponen Nilai tidak ditemukan");
}
