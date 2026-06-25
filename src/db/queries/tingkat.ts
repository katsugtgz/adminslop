/**
 * Data-access layer over the `tingkat` table (grade levels). Pure repository
 * functions — no authz logic, no validation, no audit. Composed by T4/T5/T6
 * layers.
 *
 * §13 isolation invariant: every query runs inside `withTenant(db, tenantId, tx => fn(tx, ...))`.
 * RLS scopes all rows to the tenant set in the session GUC `app.tenant_id`.
 * `tenant_id` is NEVER passed as a function argument — it always defaults
 * from the GUC.
 */
import { asc, eq, gt } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { tingkat } from "../schema";
import type { Tingkat } from "../schema";

export interface InputTingkat {
  readonly nama: string;
  readonly urutan: number;
}

/**
 * Create a tingkat. Runs inside `withTenant` so `tenant_id` defaults from the
 * GUC.
 */
export async function buatTingkat(
  db: Db | Tx,
  input: InputTingkat
): Promise<Tingkat> {
  const [row] = await db
    .insert(tingkat)
    .values({ nama: input.nama, urutan: input.urutan })
    .returning();
  return row;
}

/**
 * List all tingkat visible under the current tenant (RLS-scoped), ordered by
 * `urutan` ascending — the progression order.
 */
export async function listTingkat(db: Db | Tx): Promise<Tingkat[]> {
  return db.select().from(tingkat).orderBy(asc(tingkat.urutan));
}

/**
 * Find a tingkat by id within the current tenant (RLS-scoped). Returns null if
 * absent (including when the id exists only in another tenant).
 */
export async function cariTingkatById(
  db: Db | Tx,
  id: string
): Promise<Tingkat | null> {
  const rows = await db.select().from(tingkat).where(eq(tingkat.id, id));
  return rows[0] ?? null;
}

/**
 * The PROGRESSION primitive: find the next grade level strictly above
 * `urutanSaatIni` (smallest `urutan` greater than the current one). Returns
 * null if the student is in the top grade (no higher tingkat) or if
 * `urutanSaatIni` is above the maximum. Drives the `kenaikanTingkat` action
 * (Wave 3).
 */
export async function cariTingkatBerikutnya(
  db: Db | Tx,
  urutanSaatIni: number
): Promise<Tingkat | null> {
  const rows = await db
    .select()
    .from(tingkat)
    .where(gt(tingkat.urutan, urutanSaatIni))
    .orderBy(asc(tingkat.urutan))
    .limit(1);
  return rows[0] ?? null;
}
