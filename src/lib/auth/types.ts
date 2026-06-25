/**
 * tenant_role slugs for a Keanggotaan Satuan Pendidikan. Mirrors WorkOS
 * OrganizationMembership `role.slug`. Never `superuser` (§13 of the identity
 * doc — no global superuser).
 */
export type RoleSlug =
  | "admin_satuan_pendidikan"
  | "guru"
  | "wali_kelas"
  | "kepala_sekolah"
  | "dev";

/**
 * Izin (permission) slugs. The closed vocabulary evaluated by `evaluasiAkses`.
 * `ptk:*` govern PTK (Tenaga Kependidikan) data; `akses:*` govern the Akses
 * (role/permission administration) surface; `peserta_didik:*` govern Peserta
 * Didik (student) data. No `peserta_didik:hapus` — archive, not hard-delete
 * (per CONTEXT.md). `tahun_ajaran:*` govern Tahun Ajaran (academic year)
 * records; `rombongan_belajar:*` govern Rombongan Belajar (class/homeroom)
 * records including `kelola_penempatan` (placement/progression management).
 */
export type IzinSlug =
  | "ptk:baca"
  | "ptk:buat"
  | "ptk:hapus"
  | "akses:baca"
  | "akses:kelola"
  | "peserta_didik:baca"
  | "peserta_didik:buat"
  | "peserta_didik:ubah"
  | "tahun_ajaran:baca"
  | "tahun_ajaran:kelola"
  | "rombongan_belajar:baca"
  | "rombongan_belajar:buat"
  | "rombongan_belajar:ubah"
  | "rombongan_belajar:kelola_penempatan";

/** A Keanggotaan Satuan Pendidikan (mirrors a WorkOS OrganizationMembership). */
export interface Membership {
  /** WorkOS Organization.id — the tenant boundary (= Satuan Pendidikan). */
  orgId: string;
  orgName: string;
  /** tenant_role slug (never superuser). */
  roleSlug: RoleSlug;
}

/**
 * Outcome of resolving the active Satuan Pendidikan for an authenticated
 * Pengguna.
 */
export type TenantResolution =
  | { status: "denied" }
  | { status: "choose"; memberships: Membership[] }
  | { status: "active"; membership: Membership };
