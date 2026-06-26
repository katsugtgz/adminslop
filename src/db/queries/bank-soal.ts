/**
 * Data-access layer over the Bank Soal tables (#16, Wave 2 / T4):
 * butir_soal (question items), paket_soal (assembled packages), and the
 * paket_soal_butir junction (ordered, weighted membership). Pure repository
 * functions — no authz logic, no audit. Composed by the T6 action layer.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#2 verification gate: `buatButirSoal` rejects a non-null `drafAiId` whose
 * `status_verifikasi` is not 'disetujui'. Unverified AI content cannot become
 * canonical — the action layer never sees this check pass for a menunggu /
 * ditolak draft. The draf_ai lookup is inlined here (the draf-ai repo is not
 * extended) using the GLOBAL schema import.
 *
 * SOFT DELETE: `arsipkanButirSoal` flips status aktif -> arsip. Butir are
 * never hard-deleted (per CONTEXT.md, no hard-delete of domain data); an
 * archived butir stays referenceable from existing paket via the junction.
 */
import { and, asc, eq, ilike } from "drizzle-orm";

import type { Db, Tx } from "../client";
import {
  butirSoal,
  drafAi,
  paketSoal,
  paketSoalButir,
} from "../schema";
import type { ButirSoal, PaketSoal, PaketSoalButir } from "../schema";

// ---------------------------------------------------------------------------
// Butir Soal
// ---------------------------------------------------------------------------

/** Mirrors the schema CHECK constraint on `butir_soal.jenis`. */
export type JenisButirSoal =
  | "pg"
  | "essay"
  | "isian"
  | "jodohkan"
  | "benar_salah";

/**
 * Input for `buatButirSoal`. `drafAiId` (AC#2) is optional — when set, the
 * referenced draf_ai MUST be 'disetujui' or the call throws. `pilihan` is the
 * PG options JSON (null for non-PG types).
 */
export interface InputBuatButirSoal {
  readonly mataPelajaranId: string;
  readonly tingkatId?: string | null;
  readonly jenis: JenisButirSoal;
  readonly pertanyaan: string;
  readonly pilihan?: unknown;
  readonly kunciJawaban: string;
  readonly pembahasan?: string | null;
  readonly drafAiId?: string | null;
  readonly dibuatOleh?: string | null;
}

/** Update patch for `ubahButirSoal`. Only provided fields are written. */
export interface PerubahanButirSoal {
  readonly mataPelajaranId?: string;
  readonly tingkatId?: string | null;
  readonly jenis?: JenisButirSoal;
  readonly pertanyaan?: string;
  readonly pilihan?: unknown;
  readonly kunciJawaban?: string;
  readonly pembahasan?: string | null;
  readonly status?: "aktif" | "arsip";
}

/**
 * AC#2 verification gate (inlined). Loads the draf_ai row by id within the
 * current tenant (RLS-scoped via the surrounding withTenant) and throws when
 * the row is missing OR its `statusVerifikasi` is not 'disetujui'. A missing
 * row throws (not a silent pass) so a cross-tenant or stale draf_ai_id cannot
 * slip through as "no draft attached".
 */
async function assertDrafAiDisetujui(
  db: Db | Tx,
  drafAiId: string
): Promise<void> {
  const rows = await db.select().from(drafAi).where(eq(drafAi.id, drafAiId));
  if (rows.length === 0) {
    throw new Error("Draf AI tidak ditemukan.");
  }
  if (rows[0].statusVerifikasi !== "disetujui") {
    throw new Error("Konten AI belum diverifikasi tidak dapat digunakan.");
  }
}

/**
 * Create a butir_soal. Runs inside `withTenant` so `tenant_id` defaults from
 * the GUC. When `input.drafAiId` is set, AC#2 verifies the draft is
 * 'disetujui' BEFORE the insert (unverified AI cannot be canonical).
 */
export async function buatButirSoal(
  db: Db | Tx,
  input: InputBuatButirSoal
): Promise<ButirSoal> {
  if (input.drafAiId) {
    await assertDrafAiDisetujui(db, input.drafAiId);
  }
  const [row] = await db
    .insert(butirSoal)
    .values({
      mataPelajaranId: input.mataPelajaranId,
      tingkatId: input.tingkatId ?? null,
      jenis: input.jenis,
      pertanyaan: input.pertanyaan,
      pilihan: input.pilihan ?? null,
      kunciJawaban: input.kunciJawaban,
      pembahasan: input.pembahasan ?? null,
      drafAiId: input.drafAiId ?? null,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .returning();
  return row;
}

/**
 * Update a butir_soal. Only provided fields are written. Throws when the row
 * is absent (RLS cross-tenant or missing id) — a silent no-op would mask
 * failure.
 */
export async function ubahButirSoal(
  db: Db | Tx,
  id: string,
  perubahan: PerubahanButirSoal
): Promise<ButirSoal> {
  const set: Partial<ButirSoal> = {};
  if (perubahan.mataPelajaranId !== undefined)
    set.mataPelajaranId = perubahan.mataPelajaranId;
  if (perubahan.tingkatId !== undefined)
    set.tingkatId = perubahan.tingkatId ?? null;
  if (perubahan.jenis !== undefined) set.jenis = perubahan.jenis;
  if (perubahan.pertanyaan !== undefined) set.pertanyaan = perubahan.pertanyaan;
  if (perubahan.pilihan !== undefined)
    set.pilihan = perubahan.pilihan as Record<string, unknown> | null;
  if (perubahan.kunciJawaban !== undefined)
    set.kunciJawaban = perubahan.kunciJawaban;
  if (perubahan.pembahasan !== undefined)
    set.pembahasan = perubahan.pembahasan ?? null;
  if (perubahan.status !== undefined) set.status = perubahan.status;

  const rows = await db
    .update(butirSoal)
    .set(set)
    .where(eq(butirSoal.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Butir Soal tidak ditemukan");
  }
  return rows[0];
}

/**
 * Soft-delete: flip status aktif -> arsip. The row is preserved (per
 * CONTEXT.md, no hard-delete of domain data). Throws when absent.
 */
export async function arsipkanButirSoal(
  db: Db | Tx,
  id: string
): Promise<ButirSoal> {
  const rows = await db
    .update(butirSoal)
    .set({ status: "arsip" })
    .where(eq(butirSoal.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Butir Soal tidak ditemukan");
  }
  return rows[0];
}

/** Lookup by id (RLS-scoped — cross-tenant returns null). */
export async function cariButirSoalById(
  db: Db | Tx,
  id: string
): Promise<ButirSoal | null> {
  const rows = await db.select().from(butirSoal).where(eq(butirSoal.id, id));
  return rows[0] ?? null;
}

/**
 * List butir visible under the current tenant (RLS-scoped). Optional filters:
 * `mataPelajaranId` (eq), `tingkatId` (eq), `search` (pertanyaan ILIKE).
 * Ordered by `dibuatPada` ascending for stable chronological display.
 */
export async function listButirSoal(
  db: Db | Tx,
  opts?: {
    readonly mataPelajaranId?: string;
    readonly tingkatId?: string;
    readonly search?: string;
  }
): Promise<ButirSoal[]> {
  const filters = [];
  if (opts?.mataPelajaranId) {
    filters.push(eq(butirSoal.mataPelajaranId, opts.mataPelajaranId));
  }
  if (opts?.tingkatId) {
    filters.push(eq(butirSoal.tingkatId, opts.tingkatId));
  }
  if (opts?.search) {
    filters.push(ilike(butirSoal.pertanyaan, `%${opts.search}%`));
  }
  return db
    .select()
    .from(butirSoal)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(butirSoal.dibuatPada));
}

// ---------------------------------------------------------------------------
// Paket Soal
// ---------------------------------------------------------------------------

/** Input for `buatPaketSoal`. */
export interface InputBuatPaketSoal {
  readonly nama: string;
  readonly mataPelajaranId: string;
  readonly tingkatId?: string | null;
  readonly tahunAjaranId: string;
  readonly semester?: string | null;
  readonly dibuatOleh?: string | null;
}

/** Optional filters for `listPaketSoal`. */
export interface OptsListPaketSoal {
  readonly mataPelajaranId?: string;
  readonly tahunAjaranId?: string;
  readonly semester?: string;
}

/**
 * Create a paket_soal. Runs inside `withTenant` so `tenant_id` defaults from
 * the GUC.
 */
export async function buatPaketSoal(
  db: Db | Tx,
  input: InputBuatPaketSoal
): Promise<PaketSoal> {
  const [row] = await db
    .insert(paketSoal)
    .values({
      nama: input.nama,
      mataPelajaranId: input.mataPelajaranId,
      tingkatId: input.tingkatId ?? null,
      tahunAjaranId: input.tahunAjaranId,
      semester: input.semester ?? null,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .returning();
  return row;
}

/** Lookup by id (RLS-scoped — cross-tenant returns null). */
export async function cariPaketSoalById(
  db: Db | Tx,
  id: string
): Promise<PaketSoal | null> {
  const rows = await db
    .select()
    .from(paketSoal)
    .where(eq(paketSoal.id, id));
  return rows[0] ?? null;
}

/**
 * List paket visible under the current tenant (RLS-scoped). Ordered by
 * `dibuatPada` ascending for stable chronological display.
 */
export async function listPaketSoal(
  db: Db | Tx,
  opts?: OptsListPaketSoal
): Promise<PaketSoal[]> {
  const filters = [];
  if (opts?.mataPelajaranId) {
    filters.push(eq(paketSoal.mataPelajaranId, opts.mataPelajaranId));
  }
  if (opts?.tahunAjaranId) {
    filters.push(eq(paketSoal.tahunAjaranId, opts.tahunAjaranId));
  }
  if (opts?.semester) {
    filters.push(eq(paketSoal.semester, opts.semester));
  }
  return db
    .select()
    .from(paketSoal)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(paketSoal.dibuatPada));
}

// ---------------------------------------------------------------------------
// Paket Soal Butir (junction)
// ---------------------------------------------------------------------------

/** Input for `tambahButirKePaket`. `bobot` is a numeric string (defaults to "1"). */
export interface InputTambahButirKePaket {
  readonly paketSoalId: string;
  readonly butirSoalId: string;
  readonly urutan: number;
  readonly bobot?: string;
}

/**
 * Add a butir to a paket at `urutan` with optional `bobot` (default 1).
 * UNIQUE (tenant, paket, butir) is enforced by the schema — a duplicate insert
 * for the same pair is rejected at the DB level.
 */
export async function tambahButirKePaket(
  db: Db | Tx,
  input: InputTambahButirKePaket
): Promise<PaketSoalButir> {
  const [row] = await db
    .insert(paketSoalButir)
    .values({
      paketSoalId: input.paketSoalId,
      butirSoalId: input.butirSoalId,
      urutan: input.urutan,
      bobot: input.bobot ?? "1",
    })
    .returning();
  return row;
}

/**
 * Remove a butir from a paket (the (paket, butir) pair). RLS scopes the
 * delete to the current tenant — a cross-tenant pair is a silent no-op.
 */
export async function hapusButirDariPaket(
  db: Db | Tx,
  paketSoalId: string,
  butirSoalId: string
): Promise<void> {
  await db
    .delete(paketSoalButir)
    .where(
      and(
        eq(paketSoalButir.paketSoalId, paketSoalId),
        eq(paketSoalButir.butirSoalId, butirSoalId)
      )
    );
}

/**
 * List the butir members of a paket (ordered by `urutan` ascending for stable
 * display). RLS-scoped — a cross-tenant paket id returns an empty list.
 */
export async function listButirInPaket(
  db: Db | Tx,
  paketSoalId: string
): Promise<PaketSoalButir[]> {
  return db
    .select()
    .from(paketSoalButir)
    .where(eq(paketSoalButir.paketSoalId, paketSoalId))
    .orderBy(asc(paketSoalButir.urutan));
}
