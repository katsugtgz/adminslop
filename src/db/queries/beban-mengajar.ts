/**
 * Data-access layer over the beban_mengajar table (teaching load). Pure
 * repository functions — no authz logic, no validation, no audit. Composed by
 * the T4/T5/T6 layers.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#2 (XOR): exactly one of `rombonganBelajarId` / `tingkatId` must be set.
 * The `beban_mengajar_target_check` schema constraint enforces this — the repo
 * passes the input through and lets the DB reject invalid combinations.
 *
 * AC#4 (guru context): `getBebanMengajarSaya` returns only the current guru's
 * teaching load for an active period (ptkId + tahunAjaranId + semester).
 */
import { and, asc, eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { bebanMengajar } from "../schema";
import type { BebanMengajar } from "../schema";

// Semester union mirrors the schema CHECK constraint on beban_mengajar.
export type Semester = "ganjil" | "genap";

// Input shapes (camelCase; mirrors input conventions in akses.ts) ----------

export interface InputBuatBebanMengajar {
  readonly ptkId: string;
  readonly mataPelajaranId: string;
  readonly rombonganBelajarId?: string | null;
  readonly tingkatId?: string | null;
  readonly tahunAjaranId: string;
  readonly semester: Semester;
}

export interface InputUbahBebanMengajar {
  readonly ptkId?: string;
  readonly mataPelajaranId?: string;
  readonly rombonganBelajarId?: string | null;
  readonly tingkatId?: string | null;
  readonly tahunAjaranId?: string;
  readonly semester?: Semester;
}

export interface OpsiListBebanMengajar {
  readonly ptkId?: string;
  readonly tahunAjaranId?: string;
  readonly semester?: Semester;
  readonly limit?: number;
}

// CRUD ---------------------------------------------------------------------

/**
 * List beban_mengajar visible under the current tenant (RLS-scoped), ordered
 * by `dibuatPada` ascending for stable chronological display. Optional filters
 * (`ptkId`, `tahunAjaranId`, `semester`) are AND-combined when provided.
 */
export async function listBebanMengajar(
  db: Db | Tx,
  opts?: OpsiListBebanMengajar
): Promise<BebanMengajar[]> {
  const filters = [];
  if (opts?.ptkId !== undefined) filters.push(eq(bebanMengajar.ptkId, opts.ptkId));
  if (opts?.tahunAjaranId !== undefined)
    filters.push(eq(bebanMengajar.tahunAjaranId, opts.tahunAjaranId));
  if (opts?.semester !== undefined)
    filters.push(eq(bebanMengajar.semester, opts.semester));

  return db
    .select()
    .from(bebanMengajar)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(bebanMengajar.dibuatPada))
    .limit(opts?.limit ?? 500);
}

/**
 * Create a beban_mengajar. Runs inside `withTenant` so `tenant_id` defaults
 * from the GUC. The XOR (rombonganBelajarId vs tingkatId) is enforced by the
 * schema CHECK constraint — the repo passes the input through.
 */
export async function buatBebanMengajar(
  db: Db | Tx,
  input: InputBuatBebanMengajar
): Promise<BebanMengajar> {
  const [row] = await db
    .insert(bebanMengajar)
    .values({
      ptkId: input.ptkId,
      mataPelajaranId: input.mataPelajaranId,
      rombonganBelajarId: input.rombonganBelajarId ?? null,
      tingkatId: input.tingkatId ?? null,
      tahunAjaranId: input.tahunAjaranId,
      semester: input.semester,
    })
    .returning();
  return row;
}

/**
 * Update a beban_mengajar. Only provided fields are written. Throws when the
 * row is absent (RLS cross-tenant or missing id) — a silent no-op would mask
 * failure.
 */
export async function ubahBebanMengajar(
  db: Db | Tx,
  id: string,
  input: InputUbahBebanMengajar
): Promise<BebanMengajar> {
  const set: Partial<BebanMengajar> = {};
  if (input.ptkId !== undefined) set.ptkId = input.ptkId;
  if (input.mataPelajaranId !== undefined)
    set.mataPelajaranId = input.mataPelajaranId;
  if (input.rombonganBelajarId !== undefined)
    set.rombonganBelajarId = input.rombonganBelajarId;
  if (input.tingkatId !== undefined) set.tingkatId = input.tingkatId;
  if (input.tahunAjaranId !== undefined)
    set.tahunAjaranId = input.tahunAjaranId;
  if (input.semester !== undefined) set.semester = input.semester;

  const rows = await db
    .update(bebanMengajar)
    .set(set)
    .where(eq(bebanMengajar.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Beban Mengajar tidak ditemukan");
  }
  return rows[0];
}

/**
 * Delete a beban_mengajar by id. RLS scopes to the current tenant — a cross-
 * tenant delete is a silent no-op (zero rows affected).
 */
export async function hapusBebanMengajar(
  db: Db | Tx,
  id: string
): Promise<void> {
  await db.delete(bebanMengajar).where(eq(bebanMengajar.id, id));
}

/**
 * AC#4 guru context: return only the current guru's teaching load for the
 * active period (ptkId + tahunAjaranId + semester). RLS scopes to the current
 * tenant.
 */
export async function getBebanMengajarSaya(
  db: Db | Tx,
  ptkId: string,
  tahunAjaranId: string,
  semester: Semester
): Promise<BebanMengajar[]> {
  return db
    .select()
    .from(bebanMengajar)
    .where(
      and(
        eq(bebanMengajar.ptkId, ptkId),
        eq(bebanMengajar.tahunAjaranId, tahunAjaranId),
        eq(bebanMengajar.semester, semester)
      )
    )
    .orderBy(asc(bebanMengajar.dibuatPada));
}
