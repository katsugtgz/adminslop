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
 * AC#5 BUDGET ENFORCEMENT (atomic gate): the authoritative gate lives in
 * `tambahPemakaianKuota` — its UPDATE carries a `terpakai < batas` predicate so
 * the check-and-increment is one atomic statement and concurrent calls can
 * never overdraw. The action layer still does a `tersisa <= 0` pre-read, but
 * that is now only a fast-path early-reject hint, NOT the gate. The atomic
 * UPDATE keeps enforcement at the data boundary where the row lock serializes
 * contention, while still letting the action layer compose quota with authz +
 * audit.
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
 * AC#5 atomic check-and-increment primitive. Bumps `terpakai` by 1 (DB-side
 * `terpakai = terpakai + 1`) AND enforces the budget gate in ONE statement:
 * the `WHERE terpakai < batas` predicate makes the check-and-increment atomic,
 * eliminating the TOCTOU race that existed when the gate lived only in the
 * action layer's pre-read. Under Postgres READ COMMITTED the UPDATE row lock
 * serializes two concurrent calls on the same row: the second waits for the
 * first to commit, then re-evaluates the predicate against the bumped row and
 * matches zero rows.
 *
 * Throws when no row exists for (tahunAjaranId, semester) — the action layer
 * MUST have called `getAtauBuatKuotaAi` first — and when the budget is
 * exhausted (`terpakai >= batas`). The action layer's pre-read
 * (`tersisa <= 0`) is kept only as a fast-path early reject; THIS function is
 * the authoritative gate.
 */
export async function tambahPemakaianKuota(
  db: Db | Tx,
  tahunAjaranId: string,
  semester: Semester
): Promise<InfoKuotaAi> {
  // Atomic gate: the `terpakai < batas` predicate is evaluated at UPDATE time
  // under the row lock, so two concurrent calls can never both pass it.
  const rows = await db
    .update(kuotaAi)
    .set({ terpakai: sql`${kuotaAi.terpakai} + 1` })
    .where(
      and(
        eq(kuotaAi.tahunAjaranId, tahunAjaranId),
        eq(kuotaAi.semester, semester),
        sql`${kuotaAi.terpakai} < ${kuotaAi.batas}`
      )
    )
    .returning();

  if (rows.length === 0) {
    // Zero updated rows means EITHER the row is absent/RLS-hidden OR the
    // budget gate (`terpakai < batas`) failed. Distinguish them so callers get
    // an accurate message. This SELECT is NOT a gate — the atomic UPDATE above
    // is the gate; this read only selects the error message (a failed UPDATE
    // cannot overdraw regardless of what this read observes).
    const existing = await db
      .select()
      .from(kuotaAi)
      .where(
        and(
          eq(kuotaAi.tahunAjaranId, tahunAjaranId),
          eq(kuotaAi.semester, semester)
        )
      );
    if (existing.length === 0) {
      throw new Error("Kuota AI tidak ditemukan");
    }
    throw new Error("Kuota AI untuk semester ini habis.");
  }
  const row = rows[0];
  return {
    terpakai: row.terpakai,
    batas: row.batas,
    tersisa: row.batas - row.terpakai,
  };
}
