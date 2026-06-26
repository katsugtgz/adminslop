/**
 * Data-access layer over the penempatan_rombongan_belajar table (append-only
 * student placement history). Pure repository functions — no authz logic, no
 * validation, no audit. Composed by the action layer (T6).
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * APPEND-ONLY INVARIANT (AC#5 — load-bearing): this repo deliberately exposes
 * NO update or delete functions. A placement is an immutable historical record
 * — once written it is preserved forever. This mirrors the
 * `riwayat_status_peserta_didik` pattern. Correcting a placement means
 * appending a new row, never rewriting an old one.
 *
 * AC#4 DERIVED-CONTEXT INVARIANT (load-bearing): a peserta_didik has NO
 * `current class` column. The "current class" of a student is DERIVED by
 * looking up their placement for the active Tahun Ajaran + semester via
 * `getPenempatanByKonteks`. Caching the current class on peserta_didik would
 * duplicate the truth already recorded here and risk divergence. See
 * `getPenempatanByKonteks` below.
 */
import { and, asc, eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { penempatanRombonganBelajar } from "../schema";
import type { PenempatanRombonganBelajar } from "../schema";

/** Semester mirrors the schema CHECK constraint: ganjil (odd) / genap (even). */
export type Semester = "ganjil" | "genap";
/**
 * Status of a placement: `aktif` (enrolled), `naik` (promoted to next tingkat),
 * `tinggal` (held back — repeated), `pindah` (transferred out).
 */
export type StatusPenempatan = "aktif" | "naik" | "tinggal" | "pindah";

/**
 * Input for `tambahPenempatan`. The (pesertaDidikId, tahunAjaranId, semester)
 * tuple is unique per tenant (schema constraint) — one placement per student
 * per TA+semester. `catatan` and `dibuatOleh` default to `null` when omitted.
 */
export interface InputPenempatan {
  readonly pesertaDidikId: string;
  readonly rombonganBelajarId: string;
  readonly tahunAjaranId: string;
  readonly semester: Semester;
  readonly status: StatusPenempatan;
  readonly catatan?: string;
  /** Aktor userId (WorkOS User.id). */
  readonly dibuatOleh?: string;
}

/**
 * APPEND a new placement record. This is the ONLY mutator exposed by this
 * repo — there is NO update and NO delete (AC#5: history is append-only, like
 * `riwayat_status_peserta_didik`). Old placement records are preserved for
 * historical access. Runs inside `withTenant` so `tenant_id` defaults from the
 * GUC. Returns the inserted row with all fields populated.
 */
export async function tambahPenempatan(
  db: Db | Tx,
  input: InputPenempatan
): Promise<PenempatanRombonganBelajar> {
  const [row] = await db
    .insert(penempatanRombonganBelajar)
    .values({
      pesertaDidikId: input.pesertaDidikId,
      rombonganBelajarId: input.rombonganBelajarId,
      tahunAjaranId: input.tahunAjaranId,
      semester: input.semester,
      status: input.status,
      catatan: input.catatan ?? null,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .returning();
  return row;
}

/**
 * List ALL placement history for a student, oldest first (chronological by
 * `dibuat_pada`). RLS scopes to the current tenant — a cross-tenant
 * pesertaDidikId yields `[]`. This is the full append-only audit trail of
 * where a student has been placed across every TA + semester.
 */
export async function listPenempatanByPesertaDidik(
  db: Db | Tx,
  pesertaDidikId: string
): Promise<PenempatanRombonganBelajar[]> {
  return db
    .select()
    .from(penempatanRombonganBelajar)
    .where(eq(penempatanRombonganBelajar.pesertaDidikId, pesertaDidikId))
    .orderBy(asc(penempatanRombonganBelajar.dibuatPada));
}

/**
 * AC#4 DERIVED-CONTEXT query: resolve the placement of a student for a given
 * Tahun Ajaran + semester. The "current class" of a student is NOT a column on
 * `peserta_didik` — it is DERIVED by looking up the placement that matches the
 * active (TA, semester) context. This is the core design constraint: the
 * source of truth for "which class is this student in right now" lives here,
 * computed on demand, never cached on the student row. Pure query, NO cache.
 * Returns the matching placement, or `null` when no placement exists for this
 * context (RLS cross-tenant or genuinely absent). Relies on the schema unique
 * constraint `(tenant, peserta_didik, tahun_ajaran, semester)` so at most one
 * row matches.
 */
export async function getPenempatanByKonteks(
  db: Db | Tx,
  pesertaDidikId: string,
  tahunAjaranId: string,
  semester: Semester
): Promise<PenempatanRombonganBelajar | null> {
  const rows = await db
    .select()
    .from(penempatanRombonganBelajar)
    .where(
      and(
        eq(penempatanRombonganBelajar.pesertaDidikId, pesertaDidikId),
        eq(penempatanRombonganBelajar.tahunAjaranId, tahunAjaranId),
        eq(penempatanRombonganBelajar.semester, semester)
      )
    );
  return rows[0] ?? null;
}

/**
 * Class roster: every student placed into `rombonganBelajarId` for the given
 * Tahun Ajaran + semester context. This is how a teacher sees "who is in my
 * class right now" — the active roster is filtered by the active TA+semester
 * context (the same AC#4 derived-context lens, applied to a rombel instead of
 * a single student). RLS scopes to the current tenant. Order is unspecified
 * (callers sort as needed).
 */
export async function listAnggotaRombonganBelajar(
  db: Db | Tx,
  rombonganBelajarId: string,
  tahunAjaranId: string,
  semester: Semester
): Promise<PenempatanRombonganBelajar[]> {
  return db
    .select()
    .from(penempatanRombonganBelajar)
    .where(
      and(
        eq(penempatanRombonganBelajar.rombonganBelajarId, rombonganBelajarId),
        eq(penempatanRombonganBelajar.tahunAjaranId, tahunAjaranId),
        eq(penempatanRombonganBelajar.semester, semester)
      )
    );
}
