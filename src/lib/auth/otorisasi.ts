import type { IzinSlug, RoleSlug } from "./types";

/**
 * Baked-in peran (role) → default Izin map. Read-only constant. The starting
 * izin a role grants before any explicit `izin_akses` / `pembatasan_akses`
 * rows are applied. `dev` mirrors admin for the local DEV_MEMBERSHIP_ALL flow
 * ONLY — it is NOT a global superuser (scoped to seeded tenants; §13 of the
 * identity doc).
 */
export const PERAN_KE_IZIN_DEFAULT: Record<RoleSlug, readonly IzinSlug[]> = {
  admin_satuan_pendidikan: [
    "ptk:baca",
    "ptk:buat",
    "ptk:hapus",
    "akses:kelola",
    "akses:baca",
    "peserta_didik:baca",
    "peserta_didik:buat",
    "peserta_didik:ubah",
    "tahun_ajaran:baca",
    "tahun_ajaran:kelola",
    "rombongan_belajar:baca",
    "rombongan_belajar:buat",
    "rombongan_belajar:ubah",
    "rombongan_belajar:kelola_penempatan",
    // kurikulum:baca — curriculum reference data is universal (read-only).
    "kurikulum:baca",
    // Beban Mengajar + Wali Kelas: admin manages teaching load + homeroom
    // assignments school-wide.
    "beban_mengajar:baca",
    "beban_mengajar:buat",
    "beban_mengajar:ubah",
    "wali_kelas:baca",
    "wali_kelas:buat",
    "wali_kelas:ubah",
    // Penilaian (assessment/grading): admin manages all school-wide.
    "penilaian:baca",
    "penilaian:buat",
    "penilaian:ubah",
    // Permintaan AI + Draf AI: admin manages the full AI request/draft/verify
    // lifecycle school-wide.
    "permintaan_ai:baca",
    "permintaan_ai:buat",
    "draf_ai:baca",
    "draf_ai:verifikasi",
    // E-Raport: admin manages the full document lifecycle school-wide.
    "eraport:baca",
    "eraport:buat",
    "eraport:terbit",
    "eraport:revisi",
    // Cetak: admin manages the full print/export surface (#14) — templates,
    // preview, dokumen generation.
    "cetak:baca",
    "cetak:buat",
    "cetak:ubah",
  ],
  // kepala_sekolah/guru/wali_kelas get peserta_didik:baca only — students are
  // core teaching data, so every teaching role reads by default. Writes
  // (buat/ubah) remain admin-scoped. No :hapus this slice (archive, not
  // hard-delete per CONTEXT.md). Rombongan Belajar (class) data is likewise
  // core teaching data -> baca for every teaching role; Tahun Ajaran
  // management is admin-only, but kepala_sekolah reads it. Beban Mengajar +
  // Wali Kelas reads are universal across teaching roles — a guru must see
  // their own teaching load and homeroom context (AC#4); writes remain
  // admin-scoped.
  kepala_sekolah: [
    "akses:baca",
    "peserta_didik:baca",
    "tahun_ajaran:baca",
    "rombongan_belajar:baca",
    "kurikulum:baca",
    "beban_mengajar:baca",
    "wali_kelas:baca",
    // Penilaian: read oversight of school-wide assessment data.
    "penilaian:baca",
    // Permintaan AI + Draf AI: kepala_sekolah reads requests + drafts and
    // VERIFIES drafts (AC#3 approval gate).
    "permintaan_ai:baca",
    "draf_ai:baca",
    "draf_ai:verifikasi",
    // E-Raport: kepala_sekolah reads + publishes (terbit) reports.
    "eraport:baca",
    "eraport:terbit",
    // Cetak: kepala_sekolah reads + generates dokumen_cetak (cetak:buat).
    "cetak:baca",
    "cetak:buat",
  ],
  guru: [
    "peserta_didik:baca",
    "rombongan_belajar:baca",
    "kurikulum:baca",
    "beban_mengajar:baca",
    "wali_kelas:baca",
    // Penilaian: guru creates/edits assessments for their own beban_mengajar
    // (AC#1). Ownership is the second gate, enforced at the action layer
    // (AC#4) — boleh() is the first (role-level) gate only.
    "penilaian:baca",
    "penilaian:buat",
    "penilaian:ubah",
    // Permintaan AI: guru may REQUEST AI generation + read drafts (AC#3), but
    // NOT verify — draf_ai:verifikasi is kepala_sekolah/admin only.
    "permintaan_ai:baca",
    "permintaan_ai:buat",
    "draf_ai:baca",
    // E-Raport: guru creates report drafts from Nilai Akhir (AC#1); reads
    // others' drafts. Terbit/revisi remain kepala_sekolah/admin.
    "eraport:baca",
    "eraport:buat",
    // Cetak: guru previews reports (homeroom/teaching oversight).
    "cetak:baca",
  ],
  wali_kelas: [
    "peserta_didik:baca",
    "rombongan_belajar:baca",
    "kurikulum:baca",
    "beban_mengajar:baca",
    "wali_kelas:baca",
    // Penilaian: wali_kelas reads (homeroom oversight); writes are admin/guru.
    "penilaian:baca",
    // Permintaan AI + Draf AI: wali_kelas reads requests + drafts only
    // (no request, no verify — homeroom oversight, not AI workflow).
    "permintaan_ai:baca",
    "draf_ai:baca",
    // E-Raport: wali_kelas reads homeroom reports (oversight only).
    "eraport:baca",
    // Cetak: wali_kelas previews homeroom reports (read-only oversight).
    "cetak:baca",
  ],
  dev: [
    "ptk:baca",
    "ptk:buat",
    "ptk:hapus",
    "akses:kelola",
    "akses:baca",
    "peserta_didik:baca",
    "peserta_didik:buat",
    "peserta_didik:ubah",
    "tahun_ajaran:baca",
    "tahun_ajaran:kelola",
    "rombongan_belajar:baca",
    "rombongan_belajar:buat",
    "rombongan_belajar:ubah",
    "rombongan_belajar:kelola_penempatan",
    "kurikulum:baca",
    "beban_mengajar:baca",
    "beban_mengajar:buat",
    "beban_mengajar:ubah",
    "wali_kelas:baca",
    "wali_kelas:buat",
    "wali_kelas:ubah",
    "penilaian:baca",
    "penilaian:buat",
    "penilaian:ubah",
    // Permintaan AI + Draf AI: dev mirrors admin (full lifecycle).
    "permintaan_ai:baca",
    "permintaan_ai:buat",
    "draf_ai:baca",
    "draf_ai:verifikasi",
    // E-Raport: dev mirrors admin (full lifecycle).
    "eraport:baca",
    "eraport:buat",
    "eraport:terbit",
    "eraport:revisi",
    // Cetak: dev mirrors admin (full print/export surface).
    "cetak:baca",
    "cetak:buat",
    "cetak:ubah",
  ],
};

/** Input to `evaluasiAkses`. The caller has already confirmed membership. */
export interface InputEvaluasiAkses {
  readonly roleSlug: RoleSlug;
  /** Explicit grants from the `izin_akses` table for this Pengguna+tenant. */
  readonly izinGrants: readonly IzinSlug[];
  /** Restrictions from the `pembatasan_akses` table (slug strings). */
  readonly pembatasan: readonly IzinSlug[];
  /** The action slug being requested. */
  readonly diminta: IzinSlug;
}

/**
 * Explainable access decision (discriminated union). `sumber` enables
 * user-facing Pembatasan messaging and audit logging.
 */
export type KeputusanAkses =
  | { readonly diizinkan: true; readonly sumber: "peran" | "izin" }
  | { readonly diizinkan: false; readonly sumber: "bukan_anggota" | "pembatasan" | "tidak_ada_izin" };

/**
 * Pure authorization evaluator. No side effects, no I/O, no async.
 *
 * NOTE: this function never returns `sumber: "bukan_anggota"`. That source is
 * for callers (the server resolver) that detect a missing membership BEFORE
 * invoking this evaluator — they construct the decision themselves. This pure
 * function only sees a confirmed membership's role/grants/restrictions.
 */
export function evaluasiAkses(input: InputEvaluasiAkses): KeputusanAkses {
  // SECURITY INVARIANT (§13, no global superuser): pembatasan ALWAYS wins,
  // evaluated before any grant or role default. Even admin/dev cannot bypass a
  // restriction. This is the single guarantee that no role is omnipotent.
  if (input.pembatasan.includes(input.diminta)) {
    return { diizinkan: false, sumber: "pembatasan" };
  }
  if (input.izinGrants.includes(input.diminta)) {
    return { diizinkan: true, sumber: "izin" };
  }
  if (PERAN_KE_IZIN_DEFAULT[input.roleSlug].includes(input.diminta)) {
    return { diizinkan: true, sumber: "peran" };
  }
  return { diizinkan: false, sumber: "tidak_ada_izin" };
}

/** True if `roleSlug`'s defaults include `akses:kelola` (can administer Akses). */
export function dapatMengelolaAkses(roleSlug: RoleSlug): boolean {
  return PERAN_KE_IZIN_DEFAULT[roleSlug].includes("akses:kelola");
}

/** True if `roleSlug`'s defaults include `akses:baca` (can view the Akses page). */
export function dapatMelihatAkses(roleSlug: RoleSlug): boolean {
  return PERAN_KE_IZIN_DEFAULT[roleSlug].includes("akses:baca");
}
