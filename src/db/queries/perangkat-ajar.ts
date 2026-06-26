/**
 * Data-access layer over the perangkat_ajar table (teaching documents #17).
 * Pure repository functions — no authz logic, no validation, no audit. Composed
 * by the action layer (T6).
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#1 (per jenis): `jenis` is a CHECK discriminator; buat/listByJenis keep
 * the type vocabulary typed end-to-end.
 * AC#3 (verification gate): `statusDokumenAi` flows menunggu -> disetujui |
 * ditolak. `buatPerangkatAjar` sets 'menunggu' when a `drafAiId` is supplied
 * (AI-assisted — NOT resmi until verified). NULL status = not AI-assisted.
 * `verifikasiDokumenAi` is idempotent: once a terminal verdict is reached, a
 * second call throws rather than silently rewriting the verdict. Verifying a
 * non-AI-assisted row (NULL status) also throws — it has nothing to verify.
 */
import { and, asc, eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { perangkatAjar } from "../schema";
import type { PerangkatAjar } from "../schema";

/** Mirrors the schema CHECK constraint on `perangkat_ajar.jenis`. */
export type JenisPerangkatAjar =
  | "modul_ajar"
  | "rpp"
  | "silabus"
  | "prota"
  | "promes";

/** Mirrors the schema CHECK constraint on `perangkat_ajar.status_dokumen_ai`. */
export type StatusDokumenAi = "menunggu" | "disetujui" | "ditolak";

/** Semester union (mirrors the schema CHECK — allows NULL). */
export type Semester = "ganjil" | "genap";

/** Verdict for the AC#3 verification gate (terminal states only). */
export type KeputusanVerifikasi = "disetujui" | "ditolak";

/**
 * Input for {@linkcode buatPerangkatAjar}. `mataPelajaranId` (AC#2) references
 * the GLOBAL mata_pelajaran. `tingkatId` is optional. `drafAiId` (AC#3) marks
 * the doc AI-assisted — when present, the repo sets `statusDokumenAi='menunggu'`
 * (must be verified before official use).
 */
export interface InputBuatPerangkatAjar {
  readonly jenis: JenisPerangkatAjar;
  readonly mataPelajaranId: string;
  readonly tingkatId?: string | null;
  readonly tahunAjaranId: string;
  readonly semester: Semester;
  readonly judul: string;
  readonly konten: Record<string, unknown>;
  readonly drafAiId?: string | null;
  readonly dibuatOleh: string;
}

/**
 * Partial update for {@linkcode ubahPerangkatAjar}. Only mutable display/
 * konten fields are exposed — `jenis`, `statusDokumenAi`, `drafAiId`, and the
 * period (tahun_ajaran/semester) are NOT editable here (jenis is fixed at
 * creation per AC#1; the verification gate owns statusDokumenAi).
 */
export interface InputUbahPerangkatAjar {
  readonly judul?: string;
  readonly konten?: Record<string, unknown>;
  readonly mataPelajaranId?: string;
  readonly tingkatId?: string | null;
}

/**
 * Create a perangkat_ajar. Runs inside `withTenant` so `tenant_id` defaults
 * from the GUC. AC#3: when `drafAiId` is supplied the doc is AI-assisted and
 * starts at `statusDokumenAi='menunggu'` (NOT resmi until verified); otherwise
 * status is NULL (not AI-assisted — already resmi).
 */
export async function buatPerangkatAjar(
  db: Db | Tx,
  input: InputBuatPerangkatAjar
): Promise<PerangkatAjar> {
  const [row] = await db
    .insert(perangkatAjar)
    .values({
      jenis: input.jenis,
      mataPelajaranId: input.mataPelajaranId,
      tingkatId: input.tingkatId ?? null,
      tahunAjaranId: input.tahunAjaranId,
      semester: input.semester,
      judul: input.judul,
      konten: input.konten,
      drafAiId: input.drafAiId ?? null,
      statusDokumenAi: input.drafAiId ? "menunggu" : null,
      dibuatOleh: input.dibuatOleh,
    })
    .returning();
  return row;
}

/**
 * Update a perangkat_ajar by id within the current tenant (RLS-scoped). Only
 * the fields supplied in `perubahan` are written. Returns the updated row;
 * throws when the id is absent (RLS cross-tenant or missing) — `.returning()`
 * yields 0 rows.
 */
export async function ubahPerangkatAjar(
  db: Db | Tx,
  id: string,
  perubahan: InputUbahPerangkatAjar
): Promise<PerangkatAjar> {
  const rows = await db
    .update(perangkatAjar)
    .set({
      ...(perubahan.judul !== undefined ? { judul: perubahan.judul } : {}),
      ...(perubahan.konten !== undefined ? { konten: perubahan.konten } : {}),
      ...(perubahan.mataPelajaranId !== undefined
        ? { mataPelajaranId: perubahan.mataPelajaranId }
        : {}),
      ...(perubahan.tingkatId !== undefined
        ? { tingkatId: perubahan.tingkatId }
        : {}),
    })
    .where(eq(perangkatAjar.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Perangkat Ajar tidak ditemukan");
  }
  return rows[0];
}

/**
 * Find a perangkat_ajar by id within the current tenant (RLS-scoped). Returns
 * null when absent — including when the id exists only in another tenant.
 */
export async function cariPerangkatAjarById(
  db: Db | Tx,
  id: string
): Promise<PerangkatAjar | null> {
  const rows = await db
    .select()
    .from(perangkatAjar)
    .where(eq(perangkatAjar.id, id));
  return rows[0] ?? null;
}

/**
 * List perangkat_ajar visible under the current tenant (RLS-scoped), ordered
 * by `judul` for stable display. AC#4: optional filters keep types separate —
 * `jenis` returns one type, `mataPelajaranId` narrows to a subject. Use
 * {@linkcode listByJenis} for the canonical type-specific slice.
 */
export async function listPerangkatAjar(
  db: Db | Tx,
  opts?: { readonly jenis?: JenisPerangkatAjar; readonly mataPelajaranId?: string }
): Promise<PerangkatAjar[]> {
  const filters = [];
  if (opts?.jenis) filters.push(eq(perangkatAjar.jenis, opts.jenis));
  if (opts?.mataPelajaranId)
    filters.push(eq(perangkatAjar.mataPelajaranId, opts.mataPelajaranId));
  return db
    .select()
    .from(perangkatAjar)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(perangkatAjar.judul));
}

/**
 * AC#4 type-specific query: list every perangkat_ajar of exactly `jenis` under
 * the current tenant (RLS-scoped). The per-jenis discriminator keeps each
 * teaching-document type a distinct slice (not one monolithic format).
 */
export async function listByJenis(
  db: Db | Tx,
  jenis: JenisPerangkatAjar
): Promise<PerangkatAjar[]> {
  return db
    .select()
    .from(perangkatAjar)
    .where(eq(perangkatAjar.jenis, jenis))
    .orderBy(asc(perangkatAjar.judul));
}

/**
 * AC#3 verification gate. Transitions `statusDokumenAi` out of 'menunggu' to
 * 'disetujui' | 'ditolak'. Idempotent: once a terminal verdict is reached a
 * second call throws (cannot re-verify). Also throws when the row is absent
 * (RLS cross-tenant or missing id) AND when the row is not AI-assisted
 * (`statusDokumenAi` is NULL — nothing to verify) — a silent no-op would mask
 * the fact that only AI-assisted docs go through this gate.
 */
export async function verifikasiDokumenAi(
  db: Db | Tx,
  id: string,
  keputusan: KeputusanVerifikasi
): Promise<PerangkatAjar> {
  const existing = await db
    .select()
    .from(perangkatAjar)
    .where(eq(perangkatAjar.id, id));
  if (existing.length === 0) {
    throw new Error("Perangkat Ajar tidak ditemukan");
  }
  if (existing[0].statusDokumenAi !== "menunggu") {
    throw new Error("Dokumen AI sudah diverifikasi");
  }

  const [row] = await db
    .update(perangkatAjar)
    .set({ statusDokumenAi: keputusan })
    .where(eq(perangkatAjar.id, id))
    .returning();
  return row;
}
