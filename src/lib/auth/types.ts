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
 * `kurikulum:baca` governs read-only browsing of Kurikulum (curriculum)
 * reference data — universal: every authenticated member may browse it (no
 * write slugs; curriculum is seeded via migration, not user-edited).
 * `beban_mengajar:*` govern Beban Mengajar (teaching load) records;
 * `wali_kelas:*` govern Wali Kelas (homeroom teacher) assignments. Read
 * (`:baca`) is universal across teaching roles — a guru must see their own
 * teaching load and homeroom context (AC#4); writes (`:buat`/`:ubah`) remain
 * admin-scoped. `penilaian:*` govern Penilaian (assessment/grading) records.
 * Guru gets all three (AC#1: guru creates penilaian for their own
 * beban_mengajar — role-level grant; OWNERSHIP is the second gate enforced at
 * the action layer per AC#4). `baca` is universal across teaching roles;
 * `buat`/`ubah` are admin + guru scoped.
 * `permintaan_ai:*` govern Permintaan AI (AI-generation requests) submitted
 * by teaching staff; `draf_ai:*` govern Draf AI (AI-generated drafts) derived
 * from those requests. Verification (`draf_ai:verifikasi`) is the approval
 * gate (AC#3): guru may request + read drafts but NOT self-verify;
 * kepala_sekolah verifies. Admin manages everything.
 * `arsip:*` govern the Arsip Data (archive/recovery/retention) surface (#19).
 * `arsip:baca` reads archived records + retention policy + change history;
 * `arsip:kelola` writes (archive, recover, set retention). Defaults: admin/dev
 * hold both; kepala_sekolah reads (oversight); guru/wali_kelas get NEITHER
 * (no archive access — archive is an admin accountability surface, not teaching).
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
  | "rombongan_belajar:kelola_penempatan"
  | "kurikulum:baca"
  | "beban_mengajar:baca"
  | "beban_mengajar:buat"
  | "beban_mengajar:ubah"
  | "wali_kelas:baca"
  | "wali_kelas:buat"
  | "wali_kelas:ubah"
  | "penilaian:baca"
  | "penilaian:buat"
  | "penilaian:ubah"
  | "permintaan_ai:baca"
  | "permintaan_ai:buat"
  | "draf_ai:baca"
  | "draf_ai:verifikasi"
  | "arsip:baca"
  | "arsip:kelola";

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
