/**
 * Data-access layer over the kuota_ai table (per-tenant per-period AI budget).
 * Pure repository functions — no authz logic, no validation, no audit. Composed
 * by the action layer (T6).
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#5 BUDGET ENFORCEMENT (split across layers): this repo exposes the
 * primitives — read (`getKuotaAi`), find-or-create (`getAtauBuatKuotaAi`),
 * increment (`tambahPemakaianKuota`). It does NOT reject requests when
 * `terpakai >= batas`. That gate lives in the ACTION layer: the action reads
 * `tersisa` and rejects BEFORE calling `tambahPemakaianKuota`. Keeping the
 * enforcement out of the repo keeps it a pure data-access surface (no business
 * rule leaks) and lets the action layer compose quota with authz + audit.
 *
 * `InfoKuotaAi` is the derived read shape: `tersisa = batas - terpakai`,
 * computed here so callers never have to re-derive it.
 */
import { and, eq, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { kuotaAi } from "../schema";

/** Semester mirrors the schema CHECK constraint: ganjil (odd) / genap (even). */
export type Semester = "ganjil" | "genap";

/**
 * Derived quota info returned to callers. `tersisa` is computed here
 * (`batas - terpakai`) so the action layer can read it without re-deriving.
 */
export interface InfoKuotaAi {
  readonly terpakai: number;
  readonly batas: number;
  readonly tersisa: number;
}

/**
 * Read the kuota_ai row for (tahunAjaranId, semester) within the current
 * tenant (RLS-scoped) and return the derived info. Returns null when no row
 * exists — the action layer decides whether that means "unlimited" or
 * "batas=0"; the repo treats absence as absence.
 */
export async function getKuotaAi(
  db: Db | Tx,
  tahunAjaranId: string,
  semester: Semester
): Promise<InfoKuotaAi | null> {
  const rows = await db
    .select()
    .from(kuotaAi)
    .where(
      and(
        eq(kuotaAi.tahunAjaranId, tahunAjaranId),
        eq(kuotaAi.semester, semester)
      )
    );
  const row = rows[0];
  if (!row) return null;
  return {
    terpakai: row.terpakai,
    batas: row.batas,
    tersisa: row.batas - row.terpakai,
  };
}

/**
 * AC#5 find-or-create. If a kuota_ai row exists for (tahunAjaranId, semester)
 * under the current tenant, return its info. Otherwise INSERT a fresh row with
 * `terpakai=0` (schema default) and `batas=batasDefault ?? 100` (schema
 * default is 100). Returns the info either way. The action layer typically
 * calls this at request time to guarantee a quota row exists before reading
 * `tersisa`.
 */
export async function getAtauBuatKuotaAi(
  db: Db | Tx,
  tahunAjaranId: string,
  semester: Semester,
  batasDefault?: number
): Promise<InfoKuotaAi> {
  const existing = await getKuotaAi(db, tahunAjaranId, semester);
  if (existing) return existing;

  const batas = batasDefault ?? 100;
  const [row] = await db
    .insert(kuotaAi)
    .values({ tahunAjaranId, semester, batas })
    .returning();
  return {
    terpakai: row.terpakai,
    batas: row.batas,
    tersisa: row.batas - row.terpakai,
  };
}

/**
 * AC#5 increment primitive. Atomically bumps `terpakai` by 1 (DB-side
 * `terpakai = terpakai + 1`) and returns the updated info. Throws when no row
 * exists for (tahunAjaranId, semester) — the action layer MUST have called
 * `getAtauBuatKuotaAi` first. The budget gate (`tersisa > 0`) is the action
 * layer's responsibility; this function does NOT enforce it and will happily
 * increment past `batas` if invoked.
 */
export async function tambahPemakaianKuota(
  db: Db | Tx,
  tahunAjaranId: string,
  semester: Semester
): Promise<InfoKuotaAi> {
  const rows = await db
    .update(kuotaAi)
    .set({ terpakai: sql`${kuotaAi.terpakai} + 1` })
    .where(
      and(
        eq(kuotaAi.tahunAjaranId, tahunAjaranId),
        eq(kuotaAi.semester, semester)
      )
    )
    .returning();

  if (rows.length === 0) {
    throw new Error("Kuota AI tidak ditemukan");
  }
  const row = rows[0];
  return {
    terpakai: row.terpakai,
    batas: row.batas,
    tersisa: row.batas - row.terpakai,
  };
}
