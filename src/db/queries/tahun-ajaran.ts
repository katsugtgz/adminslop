/**
 * Data-access layer over tahun_ajaran + the semester_aktif column on
 * satuan_pendidikan. Pure repository functions — no authz logic, no validation,
 * no audit. Composed by T4/T5/T6 layers.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes tahun_ajaran rows
 * to the tenant set in the session GUC `app.tenant_id`; `tenant_id` is NEVER
 * passed as a function argument — it always defaults from the GUC.
 *
 * satuan_pendidikan is NOT RLS'd (it IS the tenant boundary). getSemesterAktif
 * and ubahSemesterAktif scope to the active tenant by filtering on
 * `id = current_setting('app.tenant_id', true)` directly.
 *
 * ACCEPTANCE CRITERION (load-bearing): at most one tahun_ajaran may be aktif
 * per tenant (schema partial unique index). `aktifkanTahunAjaran` enforces the
 * atomic flip — unset all aktif rows in the tenant, then set the target —
 * inside the caller's transaction.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { satuanPendidikan, tahunAjaran } from "../schema";
import type { TahunAjaran } from "../schema";

/** Default row cap for list queries — prevents unbounded tenant scans. */
const DEFAULT_LIMIT = 200;

// Semester union mirrors the schema CHECK constraint on satuan_pendidikan.
export type Semester = "ganjil" | "genap";

// Input shapes (camelCase; mirrors input conventions in akses.ts) ----------

export interface InputTahunAjaran {
  readonly nama: string;
}

export interface InputUbahSemester {
  readonly semester: Semester;
}

// Tahun Ajaran CRUD -------------------------------------------------------

/**
 * Create a tahun_ajaran. Runs inside `withTenant` so `tenant_id` defaults from
 * the GUC. New rows are inactive by default (schema default `aktif=false`); use
 * `aktifkanTahunAjaran` to mark one active.
 */
export async function buatTahunAjaran(
  db: Db | Tx,
  input: InputTahunAjaran
): Promise<TahunAjaran> {
  const [row] = await db
    .insert(tahunAjaran)
    .values({ nama: input.nama })
    .returning();
  return row;
}

/**
 * List all tahun_ajaran visible under the current tenant (RLS-scoped), newest
 * first. `limit` caps the result set (default 200 — tenants rarely have many
 * academic years).
 */
export async function listTahunAjaran(
  db: Db | Tx,
  limit: number = DEFAULT_LIMIT
): Promise<TahunAjaran[]> {
  return db
    .select()
    .from(tahunAjaran)
    .orderBy(desc(tahunAjaran.dibuatPada))
    .limit(limit);
}

/**
 * Find a tahun_ajaran by id within the current tenant (RLS-scoped). Returns
 * null when absent (including when the id exists only in another tenant).
 */
export async function cariTahunAjaranById(
  db: Db | Tx,
  id: string
): Promise<TahunAjaran | null> {
  const rows = await db
    .select()
    .from(tahunAjaran)
    .where(eq(tahunAjaran.id, id));
  return rows[0] ?? null;
}

/**
 * Return the active tahun_ajaran for the current tenant (RLS-scoped), or null
 * when none is active. At most one aktif row may exist per tenant (schema
 * partial unique index).
 */
export async function getTahunAjaranAktif(
  db: Db | Tx
): Promise<TahunAjaran | null> {
  const rows = await db
    .select()
    .from(tahunAjaran)
    .where(eq(tahunAjaran.aktif, true));
  return rows[0] ?? null;
}

/**
 * Atomically activate a tahun_ajaran (AC load-bearing — at most one aktif per
 * tenant). Two steps run in the caller's transaction:
 *   1. Unset `aktif` on every currently-active row in the tenant.
 *   2. Set `aktif=true` on the target row.
 * Returns the activated row. Throws when the target id is absent (RLS cross-
 * tenant or missing id) — step 2's `.returning()` yields 0 rows.
 *
 * The explicit `tenant_id = current_setting('app.tenant_id', true)` filter is
 * defense in depth: the table is also RLS-scoped to the same tenant, so a
 * cross-tenant flip is impossible even if a future caller forgets withTenant.
 */
export async function aktifkanTahunAjaran(
  db: Db | Tx,
  id: string
): Promise<TahunAjaran> {
  const tenantGuc = sql`current_setting('app.tenant_id', true)`;

  // 1. Unset all aktif rows in the tenant.
  await db
    .update(tahunAjaran)
    .set({ aktif: false })
    .where(
      and(
        eq(tahunAjaran.aktif, true),
        sql`${tahunAjaran.tenantId} = ${tenantGuc}`
      )
    );

  // 2. Set the target row aktif. `.returning()` yields 0 rows under RLS
  //    cross-tenant or for a missing id — throw before returning.
  const rows = await db
    .update(tahunAjaran)
    .set({ aktif: true })
    .where(
      and(eq(tahunAjaran.id, id), sql`${tahunAjaran.tenantId} = ${tenantGuc}`)
    )
    .returning();

  if (rows.length === 0) {
    throw new Error("Tahun Ajaran tidak ditemukan");
  }
  return rows[0];
}

// Semester Aktif (on satuan_pendidikan — the tenant boundary) -------------

/**
 * Read the active semester (`ganjil`/`genap`) for the current tenant, or null
 * when unset. satuan_pendidikan is NOT RLS'd — the row is scoped directly via
 * `id = current_setting('app.tenant_id', true)` (the tenant id IS its row id).
 */
export async function getSemesterAktif(
  db: Db | Tx
): Promise<Semester | null> {
  const rows = await db
    .select({ semesterAktif: satuanPendidikan.semesterAktif })
    .from(satuanPendidikan)
    .where(sql`${satuanPendidikan.id} = current_setting('app.tenant_id', true)`);
  const value = rows[0]?.semesterAktif;
  // The CHECK constraint restricts the column to 'ganjil' | 'genap' | NULL,
  // so the cast is total — no runtime fallback is needed.
  return (value as Semester | null) ?? null;
}

/**
 * Set the active semester for the current tenant. satuan_pendidikan is NOT
 * RLS'd — the row is scoped directly via
 * `id = current_setting('app.tenant_id', true)`.
 */
export async function ubahSemesterAktif(
  db: Db | Tx,
  input: InputUbahSemester
): Promise<void> {
  await db
    .update(satuanPendidikan)
    .set({ semesterAktif: input.semester })
    .where(sql`${satuanPendidikan.id} = current_setting('app.tenant_id', true)`);
}
