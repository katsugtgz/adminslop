/**
 * Data-access layer over the rombongan_belajar table (class / homeroom). Pure
 * repository functions — no authz logic, no validation, no audit. Composed by
 * the T6 action layer (notably the Wave 3 kenaikanTingkat action, which uses
 * `cariAtauBuatRombonganBelajar` as its progression primitive: find-or-create
 * the next-grade rombel for the new Tahun Ajaran).
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * IDENTITY SPANS BOTH SEMESTERS: there is no semester column on this table.
 * A rombel identity persists across both ganjil and genap of its Tahun Ajaran;
 * semester context lives in `penempatan_rombongan_belajar`.
 */
import { and, asc, eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { rombonganBelajar } from "../schema";
import type { RombonganBelajar } from "../schema";

export interface InputRombonganBelajar {
  readonly nama: string;
  readonly tingkatId: string;
  readonly tahunAjaranId: string;
}

/**
 * Create a rombongan_belajar. Runs inside `withTenant` so `tenant_id` defaults
 * from the GUC. Unique per (tenant, tahun_ajaran, nama) — a duplicate insert
 * under the same tenant+TA raises on the schema unique constraint.
 */
export async function buatRombonganBelajar(
  db: Db | Tx,
  input: InputRombonganBelajar
): Promise<RombonganBelajar> {
  const [row] = await db
    .insert(rombonganBelajar)
    .values({
      nama: input.nama,
      tingkatId: input.tingkatId,
      tahunAjaranId: input.tahunAjaranId,
    })
    .returning();
  return row;
}

/**
 * List rombongan_belajar visible under the current tenant (RLS-scoped),
 * ordered by `nama` ascending for stable display. When `tahunAjaranId` is
 * provided, results are restricted to that Tahun Ajaran; otherwise all
 * rombels in the tenant are returned.
 */
export async function listRombonganBelajar(
  db: Db | Tx,
  tahunAjaranId?: string,
  limit: number = 500
): Promise<RombonganBelajar[]> {
  return db
    .select()
    .from(rombonganBelajar)
    .where(
      tahunAjaranId !== undefined
        ? eq(rombonganBelajar.tahunAjaranId, tahunAjaranId)
        : undefined
    )
    .orderBy(asc(rombonganBelajar.nama))
    .limit(limit);
}

/**
 * Find a rombongan_belajar by id within the current tenant (RLS-scoped).
 * Returns null when absent (including when the id exists only in another
 * tenant).
 */
export async function cariRombonganBelajarById(
  db: Db | Tx,
  id: string
): Promise<RombonganBelajar | null> {
  const rows = await db
    .select()
    .from(rombonganBelajar)
    .where(eq(rombonganBelajar.id, id));
  return rows[0] ?? null;
}

/**
 * Find-or-create a rombongan_belajar by (tenant, nama, tingkatId,
 * tahunAjaranId). Used by the kenaikanTingkat action (Wave 3) to obtain the
 * next-grade rombel for the new Tahun Ajaran — creating it if absent.
 *
 * Implemented as a two-step SELECT-then-INSERT (NOT a DB upsert /
 * onConflict): this guarantees the EXISTING row is returned unchanged when
 * found — no fields are rewritten, no `dibuat_pada` is advanced. Both steps
 * run inside the caller's `withTenant` so tenant isolation holds and any
 * concurrent writer racing on the same key surfaces as the schema's unique
 * constraint violation (acceptable — callers retry or pre-resolve).
 */
export async function cariAtauBuatRombonganBelajar(
  db: Db | Tx,
  input: InputRombonganBelajar
): Promise<RombonganBelajar> {
  const existing = await db
    .select()
    .from(rombonganBelajar)
    .where(
      and(
        eq(rombonganBelajar.nama, input.nama),
        eq(rombonganBelajar.tingkatId, input.tingkatId),
        eq(rombonganBelajar.tahunAjaranId, input.tahunAjaranId)
      )
    );
  if (existing.length > 0) {
    return existing[0];
  }
  return buatRombonganBelajar(db, input);
}
