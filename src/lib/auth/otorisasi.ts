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
  // reads it.
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
  ],
  kepala_sekolah: [
    "akses:baca",
    "peserta_didik:baca",
    "tahun_ajaran:baca",
    "rombongan_belajar:baca",
  ],
  guru: ["peserta_didik:baca", "rombongan_belajar:baca"],
  wali_kelas: ["peserta_didik:baca", "rombongan_belajar:baca"],
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
