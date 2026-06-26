/**
 * Data-access layer over the absensi_harian table (daily attendance). Pure
 * repository functions — no authz logic, no validation, no audit. Composed by
 * the T5 action layer (notably the Wave 3 catat/ubah actions, which wrap a
 * single INSERT/UPDATE + audit row).
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#3 (correctable — load-bearing): a QR-captured row
 * (`metode_input='qr'`, `sumber_qr=<token>`) is still CORRECTABLE via
 * `ubahAbsensi` — `sumber_qr` presence does NOT lock the record. The schema
 * enforces no immutability on QR rows; the repo makes this explicit by always
 * applying the UPDATE unconditionally.
 *
 * AC#4 (recap for E-Raport): `getRekapAbsensi` aggregates the four
 * `status_kehadiran` buckets (Hadir/Izin/Sakit/Alpa) for a single student,
 * optionally bounded by a (dari, sampai) date range. `getRekapByRombonganBelajar`
 * applies the same aggregation per student across a whole rombel.
 */
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { absensiHarian } from "../schema";
import type { AbsensiHarian } from "../schema";

// Unions mirror the schema CHECK constraints.
export type StatusKehadiran = "hadir" | "izin" | "sakit" | "alpa";
export type MetodeInput = "manual" | "qr";

// Input shapes (camelCase; mirrors input conventions in akses.ts) ----------

export interface InputAbsensi {
  readonly pesertaDidikId: string;
  readonly rombonganBelajarId: string;
  /** ISO date `YYYY-MM-DD`. */
  readonly tanggal: string;
  readonly statusKehadiran: StatusKehadiran;
  /** Defaults to `'manual'` when omitted. */
  readonly metodeInput?: MetodeInput;
  readonly catatan?: string;
  /** QR session token; only meaningful when `metodeInput === 'qr'`. */
  readonly sumberQr?: string;
  /** Aktor userId (WorkOS User.id). */
  readonly dibuatOleh: string;
}

/**
 * Recap row: per-bucket counts over a (possibly bounded) date range. `total`
 * is the sum of all four buckets — number of attendance records the student
 * has in range. Empty recap (no records) returns `{0,0,0,0,0}`.
 */
export interface RekapAbsensi {
  readonly hadir: number;
  readonly izin: number;
  readonly sakit: number;
  readonly alpa: number;
  readonly total: number;
}

/**
 * Create an absensi_harian row. AC#3: even when `metodeInput === 'qr'`, this
 * is a plain INSERT — QR ASSISTS but never locks the record (a later
 * `ubahAbsensi` call can still correct the row). The schema
 * `absensi_harian_tenant_pd_tanggal_unique` constraint makes a second insert
 * for the same (peserta_didik, tanggal) an error; the action layer uses
 * `ubahAbsensi` for corrections. Runs inside `withTenant` so `tenant_id`
 * defaults from the GUC.
 */
export async function catatAbsensi(
  db: Db | Tx,
  input: InputAbsensi
): Promise<AbsensiHarian> {
  const [row] = await db
    .insert(absensiHarian)
    .values({
      pesertaDidikId: input.pesertaDidikId,
      rombonganBelajarId: input.rombonganBelajarId,
      tanggal: input.tanggal,
      statusKehadiran: input.statusKehadiran,
      metodeInput: input.metodeInput ?? "manual",
      catatan: input.catatan ?? null,
      sumberQr: input.sumberQr ?? null,
      dibuatOleh: input.dibuatOleh,
    })
    .returning();
  return row;
}

/**
 * Update `statusKehadiran` and/or `catatan` on an existing row. AC#3
 * (load-bearing): correctable EVEN IF the row was originally QR-captured —
 * `metode_input` / `sumber_qr` are deliberately UNCHANGED by this call so the
 * audit trail of "scanned, then corrected" is preserved, while the row stays
 * editable. `diperbarui_pada` is advanced server-side via `now()`. Throws
 * when the row is absent (RLS cross-tenant or missing id) — a silent no-op
 * would mask failure.
 */
export async function ubahAbsensi(
  db: Db | Tx,
  id: string,
  perubahan: Partial<
    Pick<InputAbsensi, "statusKehadiran" | "catatan">
  >
): Promise<AbsensiHarian> {
  const set: Record<string, unknown> = { diperbaruiPada: sql`now()` };
  if (perubahan.statusKehadiran !== undefined) {
    set.statusKehadiran = perubahan.statusKehadiran;
  }
  if (perubahan.catatan !== undefined) {
    set.catatan = perubahan.catatan;
  }

  const rows = await db
    .update(absensiHarian)
    .set(set)
    .where(eq(absensiHarian.id, id))
    .returning();

  if (rows.length === 0) {
    throw new Error("Absensi tidak ditemukan");
  }
  return rows[0];
}

/**
 * All attendance rows for a rombongan belajar on a single tanggal. RLS scopes
 * to the current tenant — a cross-tenant rombonganBelajarId yields `[]`.
 * Order is unspecified (callers map by id).
 */
export async function getAbsensiByTanggal(
  db: Db | Tx,
  rombonganBelajarId: string,
  tanggal: string
): Promise<AbsensiHarian[]> {
  return db
    .select()
    .from(absensiHarian)
    .where(
      and(
        eq(absensiHarian.rombonganBelajarId, rombonganBelajarId),
        eq(absensiHarian.tanggal, tanggal)
      )
    )
    .orderBy(asc(absensiHarian.dibuatPada));
}

/**
 * AC#4 — per-student recap for E-Raport. Aggregates the four
 * `status_kehadiran` buckets for a single peserta_didik, optionally bounded
 * by `(dari, sampai)` inclusive ISO date range. RLS scopes to the current
 * tenant. Returns `{0,0,0,0,0}` when no rows match (no error).
 *
 * Implemented as a single GROUP BY query (one round-trip) rather than four
 * count queries — the per-student row count over a school year is bounded
 * but non-trivial.
 */
export async function getRekapAbsensi(
  db: Db | Tx,
  pesertaDidikId: string,
  opts?: { readonly dari?: string; readonly sampai?: string }
): Promise<RekapAbsensi> {
  const filters = [eq(absensiHarian.pesertaDidikId, pesertaDidikId)];
  if (opts?.dari !== undefined) {
    filters.push(gte(absensiHarian.tanggal, opts.dari));
  }
  if (opts?.sampai !== undefined) {
    filters.push(lte(absensiHarian.tanggal, opts.sampai));
  }

  const rows = await db
    .select({
      statusKehadiran: absensiHarian.statusKehadiran,
      jumlah: sql<number>`count(*)::int`,
    })
    .from(absensiHarian)
    .where(and(...filters))
    .groupBy(absensiHarian.statusKehadiran);

  // Mutable accumulator (RekapAbsensi's fields are readonly — we accumulate
  // here, then build the frozen result at the boundary).
  const acc = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  for (const r of rows) {
    if (r.statusKehadiran === "hadir") acc.hadir = r.jumlah;
    else if (r.statusKehadiran === "izin") acc.izin = r.jumlah;
    else if (r.statusKehadiran === "sakit") acc.sakit = r.jumlah;
    else if (r.statusKehadiran === "alpa") acc.alpa = r.jumlah;
  }
  return {
    hadir: acc.hadir,
    izin: acc.izin,
    sakit: acc.sakit,
    alpa: acc.alpa,
    total: acc.hadir + acc.izin + acc.sakit + acc.alpa,
  };
}

/**
 * AC#4 — recap per student for a whole rombongan belajar. Returns a
 * `Map<pesertaDidikId, RekapAbsensi>` keyed by every student who has ANY
 * attendance row under the rombel (within the optional date range). Students
 * with no attendance rows in range are ABSENT from the Map (callers decide
 * how to render the gap). RLS scopes to the current tenant.
 */
export async function getRekapByRombonganBelajar(
  db: Db | Tx,
  rombonganBelajarId: string,
  opts?: { readonly dari?: string; readonly sampai?: string }
): Promise<Map<string, RekapAbsensi>> {
  const filters = [eq(absensiHarian.rombonganBelajarId, rombonganBelajarId)];
  if (opts?.dari !== undefined) {
    filters.push(gte(absensiHarian.tanggal, opts.dari));
  }
  if (opts?.sampai !== undefined) {
    filters.push(lte(absensiHarian.tanggal, opts.sampai));
  }

  const rows = await db
    .select({
      pesertaDidikId: absensiHarian.pesertaDidikId,
      statusKehadiran: absensiHarian.statusKehadiran,
      jumlah: sql<number>`count(*)::int`,
    })
    .from(absensiHarian)
    .where(and(...filters))
    .groupBy(absensiHarian.pesertaDidikId, absensiHarian.statusKehadiran);

  const hasil = new Map<string, RekapAbsensi>();
  for (const r of rows) {
    const prev =
      hasil.get(r.pesertaDidikId) ??
      ({ hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 } as RekapAbsensi);
    const next = {
      hadir: prev.hadir,
      izin: prev.izin,
      sakit: prev.sakit,
      alpa: prev.alpa,
      total: 0,
    };
    if (r.statusKehadiran === "hadir") next.hadir = r.jumlah;
    else if (r.statusKehadiran === "izin") next.izin = r.jumlah;
    else if (r.statusKehadiran === "sakit") next.sakit = r.jumlah;
    else if (r.statusKehadiran === "alpa") next.alpa = r.jumlah;
    next.total = next.hadir + next.izin + next.sakit + next.alpa;
    hasil.set(r.pesertaDidikId, next);
  }
  return hasil;
}
