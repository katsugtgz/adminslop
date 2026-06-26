/**
 * App-side tenant_role slugs for a Keanggotaan Satuan Pendidikan. Mirrors the
 * WorkOS OrganizationMembership `role.slug`. Never `superuser` (per
 * docs/architecture/identity-and-access.md §13 — no global superuser). `dev`
 * is a local-only admin-equivalent shim enabled by DEV_MEMBERSHIP_ALL.
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
 * `absensi:*` govern Absensi Harian (daily attendance) records. Guru gets all
 * three (marks attendance for their classes); admin/dev manage school-wide;
 * `baca` is universal across teaching roles (oversight), `buat`/`ubah` are
 * admin + guru scoped. `impor_peserta_didik:*` / `ekspor_peserta_didik:baca`
 * govern CSV bulk import/export of Peserta Didik: `baca` reads the tool
 * surface, `kelola` performs the import write; export is read-only. Admin/dev
 * get all three; kepala_sekolah gets `impor:baca` + `ekspor:baca` (oversight);
 * guru/wali_kelas get none (bulk import/export is admin-scoped).
 * `notifikasi:*` govern in-app Notifikasi: `baca` reads/manages one's own;
 * `kelola` (admin/dev) creates system-wide notifications. `eraport:*` govern
 * E-Raport: `baca` reads, `buat` drafts (guru), `terbit` publishes
 * (kepala_sekolah/admin), `revisi` re-opens (admin/dev). `bank_soal:*` /
 * `paket_soal:*` govern the question bank + assembled packages: guru
 * authors items + packages (AC#1), admin/dev manage school-wide, others read.
 * `perangkat_ajar:*` govern teaching documents (Silabus/RPP/ModulAjar/...):
 * guru creates + edits + verifies AI-assisted content (AC#3), admin/dev manage,
 * others read.
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
  | "absensi:baca"
  | "absensi:buat"
  | "absensi:ubah"
  | "impor_peserta_didik:baca"
  | "impor_peserta_didik:kelola"
  | "ekspor_peserta_didik:baca"
  | "notifikasi:baca"
  | "notifikasi:kelola"
  | "eraport:baca"
  | "eraport:buat"
  | "eraport:terbit"
  | "eraport:revisi"
  | "bank_soal:baca"
  | "bank_soal:buat"
  | "bank_soal:ubah"
  | "paket_soal:baca"
  | "paket_soal:buat"
  | "paket_soal:ubah"
  | "perangkat_ajar:baca"
  | "perangkat_ajar:buat"
  | "perangkat_ajar:ubah";

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
