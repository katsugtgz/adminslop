import type { IzinSlug, RoleSlug } from "./types";

// ─── #5: Profil/Pengaturan Satuan Pendidikan predicates ──────────────────────

const ADMIN_WRITE_ROLES: ReadonlySet<string> = new Set([
  "admin_satuan_pendidikan",
  "dev",
]);

const MEMBER_ROLES: ReadonlySet<string> = new Set([
  "admin_satuan_pendidikan",
  "dev",
  "guru",
  "kepala_sekolah",
]);

/**
 * Write predicate for Profil/Pengaturan Satuan Pendidikan. Type guard so
 * callers narrow to `RoleSlug` when guarding an admin action.
 */
export function canAdminSatuanPendidikan(
  roleSlug: string | undefined,
): roleSlug is RoleSlug {
  return !!roleSlug && ADMIN_WRITE_ROLES.has(roleSlug);
}

/** Read predicate — any active member may view their Satuan Pendidikan profil/pengaturan. */
export function canViewPengaturanSatuanPendidikan(
  roleSlug: string | undefined,
): boolean {
  return !!roleSlug && MEMBER_ROLES.has(roleSlug);
}

// ─── #6: Akses (Peran/Izin/Pembatasan) evaluator ─────────────────────────────

/**
 * Baked-in peran (role) → default Izin map. Read-only constant. The starting
 * izin a role grants before any explicit `izin_akses` / `pembatasan_akses`
 * rows are applied. `dev` mirrors admin for the local DEV_MEMBERSHIP_ALL flow
 * ONLY — it is NOT a global superuser (scoped to seeded tenants; §13 of the
 * identity doc).
 */
export const PERAN_KE_IZIN_DEFAULT: Record<RoleSlug, readonly IzinSlug[]> = {
  // peserta_didik:baca + rombongan_belajar:baca granted to every teaching role
  // (students and classes are core teaching data); buat/ubah remain
  // admin-scoped. No :hapus this slice (archive, not hard-delete per
  // CONTEXT.md). Tahun Ajaran management is admin-only, but kepala_sekolah
  // reads it. kurikulum:baca is universal — curriculum reference data is
  // read-only for all roles.
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
    // Permintaan AI + Draf AI: admin manages the full AI request/draft/verify
    // lifecycle school-wide.
    "permintaan_ai:baca",
    "permintaan_ai:buat",
    "draf_ai:baca",
    "draf_ai:verifikasi",
    "absensi:baca",
    "absensi:buat",
    "absensi:ubah",
    // Impor/Ekspor Peserta Didik: admin manages bulk CSV import/export.
    "impor_peserta_didik:baca",
    "impor_peserta_didik:kelola",
    "ekspor_peserta_didik:baca",
    // Notifikasi (#20): everyone reads/manages their own; admin manages
    // system-wide notification creation (kelola).
    "notifikasi:baca",
    "notifikasi:kelola",
    // E-Raport: admin manages the full document lifecycle school-wide.
    "eraport:baca",
    "eraport:buat",
    "eraport:terbit",
    "eraport:revisi",
  ],
  kepala_sekolah: [
    "akses:baca",
    "peserta_didik:baca",
    "tahun_ajaran:baca",
    "rombongan_belajar:baca",
    "kurikulum:baca",
    "beban_mengajar:baca",
    "wali_kelas:baca",
    "penilaian:baca",
    // Permintaan AI + Draf AI: kepala_sekolah reads requests + drafts and
    // VERIFIES drafts (AC#3 approval gate).
    "permintaan_ai:baca",
    "draf_ai:baca",
    "draf_ai:verifikasi",
    // Absensi: read oversight of school-wide daily attendance.
    "absensi:baca",
    // Impor/Ekspor Peserta Didik: read oversight of bulk data movement.
    "impor_peserta_didik:baca",
    "ekspor_peserta_didik:baca",
    // Notifikasi (#20): everyone reads/manages their own in-app notifications.
    "notifikasi:baca",
    // E-Raport: kepala_sekolah reads + publishes (terbit) reports.
    "eraport:baca",
    "eraport:terbit",
  ],
  guru: [
    "peserta_didik:baca",
    "rombongan_belajar:baca",
    "kurikulum:baca",
    "beban_mengajar:baca",
    "wali_kelas:baca",
    "penilaian:baca",
    "penilaian:buat",
    "penilaian:ubah",
    // Permintaan AI: guru may REQUEST AI generation + read drafts (AC#3), but
    // NOT verify — draf_ai:verifikasi is kepala_sekolah/admin only.
    "permintaan_ai:baca",
    "permintaan_ai:buat",
    "draf_ai:baca",
    // Absensi: guru marks daily attendance for their classes.
    "absensi:baca",
    "absensi:buat",
    "absensi:ubah",
    // Notifikasi (#20): everyone reads/manages their own in-app notifications.
    "notifikasi:baca",
    // E-Raport: guru creates report drafts from Nilai Akhir (AC#1); reads
    // others' drafts. Terbit/revisi remain kepala_sekolah/admin.
    "eraport:baca",
    "eraport:buat",
  ],
  wali_kelas: [
    "peserta_didik:baca",
    "rombongan_belajar:baca",
    "kurikulum:baca",
    "beban_mengajar:baca",
    "wali_kelas:baca",
    "penilaian:baca",
    // Permintaan AI + Draf AI: wali_kelas reads requests + drafts only
    // (no request, no verify — homeroom oversight, not AI workflow).
    "permintaan_ai:baca",
    "draf_ai:baca",
    // Absensi: wali_kelas reads (homeroom oversight); writes are admin/guru.
    "absensi:baca",
    // Notifikasi (#20): everyone reads/manages their own in-app notifications.
    "notifikasi:baca",
    // E-Raport: wali_kelas reads homeroom reports (oversight only).
    "eraport:baca",
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
    "absensi:baca",
    "absensi:buat",
    "absensi:ubah",
    // Impor/Ekspor Peserta Didik: admin manages bulk CSV import/export.
    "impor_peserta_didik:baca",
    "impor_peserta_didik:kelola",
    "ekspor_peserta_didik:baca",
    // Notifikasi (#20): dev mirrors admin (system-wide notification management).
    "notifikasi:baca",
    "notifikasi:kelola",
    // E-Raport: dev mirrors admin (full lifecycle).
    "eraport:baca",
    "eraport:buat",
    "eraport:terbit",
    "eraport:revisi",
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
