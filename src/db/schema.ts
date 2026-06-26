import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Tenant registry. `id` mirrors the WorkOS `Organization.id` (the Satuan
 * Pendidikan). Owned here for FK integrity only — lifecycle stays in WorkOS.
 * NOT tenant-scoped (it IS the tenant boundary), so it carries no RLS.
 */
export const satuanPendidikan = pgTable(
  "satuan_pendidikan",
  {
    id: text("id").primaryKey(),
    nama: text("nama").notNull(),
    // Active semester on the tenant boundary (nullable until chosen).
    // Spelling: 'ganjil' (odd) / 'genap' (even) — 'genap' has ONE 'p'.
    semesterAktif: text("semester_aktif"),
    // School identity (used by the Cetak/Pratinjau surface #14). Nullable until
    // a Satuan Pendidikan fills its profile (#5 preferensi cetak).
    npsn: text("npsn"),
    alamat: text("alamat"),
    logoUrl: text("logo_url"),
    // Preferensi cetak defaults (#5/#14): paper size + header/logo visibility.
    cetakPaperSize: text("cetak_paper_size").notNull().default("a4"),
    cetakTampilkanLogo: boolean("cetak_tampilkan_logo").notNull().default(true),
    cetakTampilkanHeader: boolean("cetak_tampilkan_header")
      .notNull()
      .default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "satuan_pendidikan_semester_aktif_check",
      sql`${t.semesterAktif} in ('ganjil', 'genap')`
    ),
    check(
      "satuan_pendidikan_cetak_paper_size_check",
      sql`${t.cetakPaperSize} in ('a4', 'f4')`
    ),
  ]
);

/**
 * Smoke tenant-scoped record (#3). Throwaway artifact that proves the RLS
 * pattern; not domain data. `tenant_id` is sourced from the session GUC
 * `app.tenant_id`, never from a client-supplied value (see migration default).
 */
export const contohCatatan = pgTable("contoh_catatan", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id")
    .notNull()
    .default(sql`current_setting('app.tenant_id', true)`)
    .references(() => satuanPendidikan.id),
  judul: text("judul").notNull(),
  isi: text("isi"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Catatan Audit — tenant-scoped audit log. `tenant_id` defaults to the session
 * GUC so writes are attributable to the active Satuan Pendidikan.
 */
export const catatanAudit = pgTable("catatan_audit", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .default(sql`current_setting('app.tenant_id', true)`)
    .references(() => satuanPendidikan.id),
  aktor: text("aktor").notNull(),
  aksi: text("aksi").notNull(),
  target: text("target"),
  beban: jsonb("beban"),
  dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type ContohCatatan = typeof contohCatatan.$inferSelect;
export type CatatanAudit = typeof catatanAudit.$inferSelect;
export type CatatanAuditInsert = typeof catatanAudit.$inferInsert;

/**
 * PTK — catatan personel (pendidik / tenaga kependidikan).
 *
 * DOMAIN DISTINCTION (#6 acceptance criterion #1): a PTK is a personnel record
 * that exists independently of any login. Creating a PTK never creates a
 * Pengguna; access is granted only by linking a Pengguna to it via
 * `pengguna.ptkId`. `tenant_id` is sourced from the session GUC `app.tenant_id`,
 * never from a client-supplied value (see migration default + RLS WITH CHECK).
 */
export const ptk = pgTable(
  "ptk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    nip: text("nip"),
    jenis: text("jenis").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "ptk_jenis_check",
      sql`${t.jenis} in ('pendidik', 'tenaga_kependidikan')`
    ),
  ]
);

/**
 * Pengguna — identitas login aplikasi (WorkOS User).
 *
 * DOMAIN DISTINCTION: a Pengguna is a login identity, optionally linked to a PTK
 * via `ptkId` (nullable). `userId` is the stable WorkOS User.id; `peranAkses` is
 * a RoleSlug snapshot. Unique per (tenant, user). At most one pengguna per ptk
 * within a tenant — enforced by a partial unique index that allows multiple
 * unlinked (NULL `ptkId`) rows.
 */
export const pengguna = pgTable(
  "pengguna",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    peranAkses: text("peran_akses").notNull(),
    ptkId: uuid("ptk_id").references(() => ptk.id, { onDelete: "set null" }),
    nama: text("nama"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("pengguna_tenant_user_id_unique").on(t.tenantId, t.userId),
    uniqueIndex("pengguna_tenant_ptk_idx")
      .on(t.tenantId, t.ptkId)
      .where(sql`ptk_id is not null`),
  ]
);

/**
 * Izin Akses — pemberian izin eksplisit per pengguna (`slug` = IzinSlug, e.g.
 * `ptk:baca`). Unique per (tenant, pengguna, slug). Cascades on pengguna delete.
 */
export const izinAkses = pgTable(
  "izin_akses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    penggunaId: uuid("pengguna_id")
      .notNull()
      .references(() => pengguna.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("izin_akses_tenant_pengguna_slug_unique").on(
      t.tenantId,
      t.penggunaId,
      t.slug
    ),
  ]
);

/**
 * Pembatasan Akses — penolakan keras (hard-deny) per pengguna (`slug` =
 * IzinSlug). `alasan` optional, untuk penolakan yang dapat dijelaskan. Unique
 * per (tenant, pengguna, slug). Cascades on pengguna delete.
 */
export const pembatasanAkses = pgTable(
  "pembatasan_akses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    penggunaId: uuid("pengguna_id")
      .notNull()
      .references(() => pengguna.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    alasan: text("alasan"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("pembatasan_akses_tenant_pengguna_slug_unique").on(
      t.tenantId,
      t.penggunaId,
      t.slug
    ),
  ]
);

export type Ptk = typeof ptk.$inferSelect;
export type PtkInsert = typeof ptk.$inferInsert;
export type Pengguna = typeof pengguna.$inferSelect;
export type PenggunaInsert = typeof pengguna.$inferInsert;
export type IzinAkses = typeof izinAkses.$inferSelect;
export type IzinAksesInsert = typeof izinAkses.$inferInsert;
export type PembatasanAkses = typeof pembatasanAkses.$inferSelect;
export type PembatasanAksesInsert = typeof pembatasanAkses.$inferInsert;

/**
 * Peserta Didik — student core record.
 *
 * `status` is a DENORMALIZED CACHE of the latest riwayat_status_peserta_didik
 * row (aktif|pindah|lulus|keluar), updated atomically alongside an append-only
 * history insert (acceptance criterion #2). Status changes append history, they
 * never rewrite or delete it. `tenant_id` is sourced from the session GUC
 * `app.tenant_id`, never client-supplied (see migration default + RLS WITH
 * CHECK). NISN/NIS are optional; a partial unique index allows multiple NULL
 * NISN rows but forbids two students sharing one within a tenant.
 */
export const pesertaDidik = pgTable(
  "peserta_didik",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    nisn: text("nisn"),
    nis: text("nis"),
    tanggalLahir: date("tanggal_lahir").notNull(),
    jenisKelamin: text("jenis_kelamin").notNull(),
    status: text("status").notNull().default("aktif"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
    diperbaruiPada: timestamp("diperbarui_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "peserta_didik_jenis_kelamin_check",
      sql`${t.jenisKelamin} in ('L', 'P')`
    ),
    check(
      "peserta_didik_status_check",
      sql`${t.status} in ('aktif', 'pindah', 'lulus', 'keluar')`
    ),
    uniqueIndex("peserta_didik_tenant_nisn_idx")
      .on(t.tenantId, t.nisn)
      .where(sql`nisn is not null`),
  ]
);

/**
 * Riwayat Status Peserta Didik — append-only status history (audit trail).
 * NEVER DELETE or UPDATE rows. Each status change appends a new row; the
 * `peserta_didik.status` cache is updated to mirror the latest. `dibuatOleh`
 * is the aktor userId. Cascades on peserta_didik delete.
 */
export const riwayatStatusPesertaDidik = pgTable(
  "riwayat_status_peserta_didik",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    pesertaDidikId: uuid("peserta_didik_id")
      .notNull()
      .references(() => pesertaDidik.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    catatan: text("catatan"),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "riwayat_status_peserta_didik_status_check",
      sql`${t.status} in ('aktif', 'pindah', 'lulus', 'keluar')`
    ),
  ]
);

/**
 * Mutasi Peserta Didik — transfer record (masuk / keluar). `arah` is the
 * direction; `asalSekolah`/`tujuanSekolah` describe the other side of the
 * transfer. Cascades on peserta_didik delete.
 */
export const mutasiPesertaDidik = pgTable(
  "mutasi_peserta_didik",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    pesertaDidikId: uuid("peserta_didik_id")
      .notNull()
      .references(() => pesertaDidik.id, { onDelete: "cascade" }),
    arah: text("arah").notNull(),
    asalSekolah: text("asal_sekolah"),
    tujuanSekolah: text("tujuan_sekolah"),
    tanggal: date("tanggal").notNull(),
    alasan: text("alasan"),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("mutasi_peserta_didik_arah_check", sql`${t.arah} in ('masuk', 'keluar')`),
  ]
);

/**
 * Wali Peserta Didik — parent/guardian CONTACT records ONLY (acceptance
 * criterion #4). NOT Pengguna logins — a wali cannot sign in. `hubungan` is the
 * relationship (e.g. Ayah/Ibu/Wali). Cascades on peserta_didik delete.
 */
export const waliPesertaDidik = pgTable("wali_peserta_didik", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id")
    .notNull()
    .default(sql`current_setting('app.tenant_id', true)`)
    .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
  pesertaDidikId: uuid("peserta_didik_id")
    .notNull()
    .references(() => pesertaDidik.id, { onDelete: "cascade" }),
  nama: text("nama").notNull(),
  hubungan: text("hubungan"),
  telepon: text("telepon"),
  email: text("email"),
  dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Kontak Darurat — emergency contact (acceptance criterion #4). NOT a Pengguna
 * login. Cascades on peserta_didik delete.
 */
export const kontakDarurat = pgTable("kontak_darurat", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id")
    .notNull()
    .default(sql`current_setting('app.tenant_id', true)`)
    .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
  pesertaDidikId: uuid("peserta_didik_id")
    .notNull()
    .references(() => pesertaDidik.id, { onDelete: "cascade" }),
  nama: text("nama").notNull(),
  hubungan: text("hubungan"),
  telepon: text("telepon"),
  dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type PesertaDidik = typeof pesertaDidik.$inferSelect;
export type PesertaDidikInsert = typeof pesertaDidik.$inferInsert;
export type RiwayatStatusPesertaDidik = typeof riwayatStatusPesertaDidik.$inferSelect;
export type RiwayatStatusPesertaDidikInsert = typeof riwayatStatusPesertaDidik.$inferInsert;
export type MutasiPesertaDidik = typeof mutasiPesertaDidik.$inferSelect;
export type MutasiPesertaDidikInsert = typeof mutasiPesertaDidik.$inferInsert;
export type WaliPesertaDidik = typeof waliPesertaDidik.$inferSelect;
export type WaliPesertaDidikInsert = typeof waliPesertaDidik.$inferInsert;
export type KontakDarurat = typeof kontakDarurat.$inferSelect;
export type KontakDaruratInsert = typeof kontakDarurat.$inferInsert;

/**
 * Tahun Ajaran — academic year. `nama` is human-readable (e.g. "2025/2026").
 * At most one ACTIVE year per tenant (partial unique index). Historical years
 * (aktif = false) coexist. `tenant_id` from the session GUC, never client-
 * supplied (see migration default + RLS WITH CHECK).
 */
export const tahunAjaran = pgTable(
  "tahun_ajaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    aktif: boolean("aktif").notNull().default(false),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("tahun_ajaran_tenant_nama_unique").on(t.tenantId, t.nama),
    uniqueIndex("tahun_ajaran_tenant_aktif_idx")
      .on(t.tenantId)
      .where(sql`aktif = true`),
  ]
);

/**
 * Tingkat — grade level (e.g. "Kelas 1"). `urutan` is the progression order
 * (drives naik/tinggal logic). Unique per (tenant, nama) and per (tenant,
 * urutan). Cascades on tenant delete.
 */
export const tingkat = pgTable(
  "tingkat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    urutan: integer("urutan").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("tingkat_tenant_nama_unique").on(t.tenantId, t.nama),
    unique("tingkat_tenant_urutan_unique").on(t.tenantId, t.urutan),
  ]
);

/**
 * Rombongan Belajar — class / homeroom.
 *
 * IDENTITY SPANS BOTH SEMESTERS: there is NO semester column here — a rombel
 * identity persists across both ganjil and genap of its Tahun Ajaran.
 * Semester context lives in `penempatan_rombongan_belajar`. References tingkat
 * + tahun_ajaran; cascades on delete of either. Unique per (tenant, tahun,
 * nama).
 */
export const rombonganBelajar = pgTable(
  "rombongan_belajar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    tingkatId: uuid("tingkat_id")
      .notNull()
      .references(() => tingkat.id, { onDelete: "cascade" }),
    tahunAjaranId: uuid("tahun_ajaran_id")
      .notNull()
      .references(() => tahunAjaran.id, { onDelete: "cascade" }),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("rombongan_belajar_tenant_ta_nama_unique").on(
      t.tenantId,
      t.tahunAjaranId,
      t.nama
    ),
  ]
);

/**
 * Penempatan Rombongan Belajar — append-only student placement record.
 *
 * ACCEPTANCE CRITERION #4: this is APPEND-ONLY placement history — an audit
 * trail (like riwayat_status_peserta_didik). NEVER UPDATE or DELETE rows.
 * The current class context of a student is DERIVED via
 * `getPenempatanByKonteks` (repo layer, later wave), NOT cached on
 * peserta_didik. `status` is aktif|naik|tinggal|pindah; `semester` is
 * ganjil|genap. Unique per (tenant, peserta_didik, tahun_ajaran, semester) —
 * one placement per student per TA+semester. Cascades on delete of any parent.
 */
export const penempatanRombonganBelajar = pgTable(
  "penempatan_rombongan_belajar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    pesertaDidikId: uuid("peserta_didik_id")
      .notNull()
      .references(() => pesertaDidik.id, { onDelete: "cascade" }),
    rombonganBelajarId: uuid("rombongan_belajar_id")
      .notNull()
      .references(() => rombonganBelajar.id, { onDelete: "cascade" }),
    tahunAjaranId: uuid("tahun_ajaran_id")
      .notNull()
      .references(() => tahunAjaran.id, { onDelete: "cascade" }),
    semester: text("semester").notNull(),
    status: text("status").notNull(),
    catatan: text("catatan"),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "penempatan_rombongan_belajar_semester_check",
      sql`${t.semester} in ('ganjil', 'genap')`
    ),
    check(
      "penempatan_rombongan_belajar_status_check",
      sql`${t.status} in ('aktif', 'naik', 'tinggal', 'pindah')`
    ),
    unique("penempatan_rombongan_belajar_tenant_pd_ta_sem_unique").on(
      t.tenantId,
      t.pesertaDidikId,
      t.tahunAjaranId,
      t.semester
    ),
  ]
);

export type TahunAjaran = typeof tahunAjaran.$inferSelect;
export type TahunAjaranInsert = typeof tahunAjaran.$inferInsert;
export type Tingkat = typeof tingkat.$inferSelect;
export type TingkatInsert = typeof tingkat.$inferInsert;
export type RombonganBelajar = typeof rombonganBelajar.$inferSelect;
export type RombonganBelajarInsert = typeof rombonganBelajar.$inferInsert;
export type PenempatanRombonganBelajar =
  typeof penempatanRombonganBelajar.$inferSelect;
export type PenempatanRombonganBelajarInsert =
  typeof penempatanRombonganBelajar.$inferInsert;

// ---------------------------------------------------------------------------
// GLOBAL REFERENCE TABLES — Kurikulum Merdeka national curriculum data.
//
// These tables are EXEMPT from the tenant-scoping rule (ADR 0001): NO
// tenant_id, NO RLS. The data is universal and read-only from the
// application's perspective. app_user has SELECT ONLY (the migration grants
// no INSERT/UPDATE/DELETE); writes happen exclusively via the migrator
// superuser through reviewed migrations.
// ---------------------------------------------------------------------------

/**
 * Kurikulum — national curriculum version/metadata (e.g. "Kurikulum Merdeka").
 *
 * GLOBAL reference table (ADR 0001): no tenant_id, no RLS, SELECT-only for
 * app_user. AC#2 versioning via `versi`; provenance via `sumber`/`sumberUrl`/
 * `tanggalAmbil`. AC#5: `statusPersetujuan` stays 'memerlukan_tinjauan' until a
 * human sets `disetujuiOleh`. NO AI-generated canonical data — `sumber` cites
 * the official source.
 */
export const kurikulum = pgTable(
  "kurikulum",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nama: text("nama").notNull(),
    versi: text("versi").notNull(),
    deskripsi: text("deskripsi"),
    sumber: text("sumber").notNull(),
    sumberUrl: text("sumber_url"),
    tanggalAmbil: date("tanggal_ambil").notNull().default(sql`current_date`),
    disetujuiOleh: text("disetujui_oleh"),
    statusPersetujuan: text("status_persetujuan")
      .notNull()
      .default("memerlukan_tinjauan"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "kurikulum_status_persetujuan_check",
      sql`${t.statusPersetujuan} in ('memerlukan_tinjauan', 'disetujui', 'ditolak')`
    ),
  ]
);

/**
 * Mata Pelajaran — school subject, universal across all Satuan Pendidikan
 * (e.g. Matematika, Bahasa Indonesia). GLOBAL reference table (ADR 0001).
 * `kode` nullable; `nama` unique.
 */
export const mataPelajaran = pgTable(
  "mata_pelajaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kode: text("kode"),
    nama: text("nama").notNull(),
  },
  (t) => [
    unique("mata_pelajaran_kode_unique").on(t.kode),
    unique("mata_pelajaran_nama_unique").on(t.nama),
  ]
);

/**
 * Fase — Kurikulum Merdeka phase (A-F). GLOBAL reference table (ADR 0001).
 * `kode` is the canonical phase letter; `rentangKelas`/`jenjang` are
 * descriptive (some phases span jenjang).
 */
export const fase = pgTable(
  "fase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kode: text("kode").notNull(),
    nama: text("nama").notNull(),
    rentangKelas: text("rentang_kelas"),
    jenjang: text("jenjang"),
  },
  (t) => [unique("fase_kode_unique").on(t.kode)]
);

/**
 * Capaian Pembelajaran (CP) — learning outcome, child of a (kurikulum, mata
 * pelajaran, fase) triple. GLOBAL reference table (ADR 0001). Cascade-deletes
 * with its kurikulum; RESTRICTED by mata_pelajaran and fase (cannot drop a
 * referenced subject/phase). Unique per (kurikulum, mata pelajaran, fase,
 * kode) — `kode` is nullable so NULLs are distinct (standard PG semantics).
 */
export const capaianPembelajaran = pgTable(
  "capaian_pembelajaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kurikulumId: uuid("kurikulum_id")
      .notNull()
      .references(() => kurikulum.id, { onDelete: "cascade" }),
    mataPelajaranId: uuid("mata_pelajaran_id")
      .notNull()
      .references(() => mataPelajaran.id, { onDelete: "restrict" }),
    faseId: uuid("fase_id")
      .notNull()
      .references(() => fase.id, { onDelete: "restrict" }),
    kode: text("kode"),
    elemen: text("elemen"),
    deskripsi: text("deskripsi").notNull(),
    sumber: text("sumber"),
    catatan: text("catatan"),
  },
  (t) => [
    unique("capaian_pembelajaran_kur_mp_fase_kode_unique").on(
      t.kurikulumId,
      t.mataPelajaranId,
      t.faseId,
      t.kode
    ),
  ]
);

/**
 * Tujuan Pembelajaran (TP) — learning objective, child of a CP. GLOBAL
 * reference table (ADR 0001). Cascade-deletes with its CP. Unique per
 * (CP, urutan).
 */
export const tujuanPembelajaran = pgTable(
  "tujuan_pembelajaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    capaianPembelajaranId: uuid("capaian_pembelajaran_id")
      .notNull()
      .references(() => capaianPembelajaran.id, { onDelete: "cascade" }),
    urutan: integer("urutan").notNull(),
    deskripsi: text("deskripsi").notNull(),
    sumber: text("sumber"),
    catatan: text("catatan"),
  },
  (t) => [
    unique("tujuan_pembelajaran_cp_urutan_unique").on(
      t.capaianPembelajaranId,
      t.urutan
    ),
  ]
);

/**
 * Alur Tujuan Pembelajaran (ATP) — learning objective flow step, child of a
 * TP. GLOBAL reference table (ADR 0001). Cascade-deletes with its TP. Unique
 * per (TP, urutan).
 */
export const alurTujuanPembelajaran = pgTable(
  "alur_tujuan_pembelajaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tujuanPembelajaranId: uuid("tujuan_pembelajaran_id")
      .notNull()
      .references(() => tujuanPembelajaran.id, { onDelete: "cascade" }),
    urutan: integer("urutan").notNull(),
    deskripsi: text("deskripsi").notNull(),
    sumber: text("sumber"),
    catatan: text("catatan"),
  },
  (t) => [
    unique("alur_tujuan_pembelajaran_tp_urutan_unique").on(
      t.tujuanPembelajaranId,
      t.urutan
    ),
  ]
);

export type Kurikulum = typeof kurikulum.$inferSelect;
export type KurikulumInsert = typeof kurikulum.$inferInsert;
export type MataPelajaran = typeof mataPelajaran.$inferSelect;
export type MataPelajaranInsert = typeof mataPelajaran.$inferInsert;
export type Fase = typeof fase.$inferSelect;
export type FaseInsert = typeof fase.$inferInsert;
export type CapaianPembelajaran = typeof capaianPembelajaran.$inferSelect;
export type CapaianPembelajaranInsert = typeof capaianPembelajaran.$inferInsert;
export type TujuanPembelajaran = typeof tujuanPembelajaran.$inferSelect;
export type TujuanPembelajaranInsert = typeof tujuanPembelajaran.$inferInsert;
export type AlurTujuanPembelajaran =
  typeof alurTujuanPembelajaran.$inferSelect;
export type AlurTujuanPembelajaranInsert =
  typeof alurTujuanPembelajaran.$inferInsert;

// ---------------------------------------------------------------------------
// TEACHER CONTEXT — teaching load + class guardian assignment.
//
// Tenant-scoped tables that sit on top of the academic layer (ptk, mata
// pelajaran, rombongan belajar, tingkat, tahun ajaran). Defined after the
// GLOBAL reference tables because beban_mengajar references mata_pelajaran
// (GLOBAL) — keeping references backward-resolving avoids TDZ at module load.
// ---------------------------------------------------------------------------

/**
 * Beban Mengajar — teaching load. Connects a PTK to a Mata Pelajaran for a
 * period (tahun_ajaran + semester), targeting exactly ONE of Rombongan Belajar
 * (a specific class) or Tingkat (all classes in a grade level).
 *
 * AC#2 (XOR): the `beban_mengajar_target_check` constraint enforces that
 * exactly one of `rombonganBelajarId` / `tingkatId` is set — neither or both is
 * rejected. `mataPelajaranId` is a GLOBAL reference (ADR 0001): cross-schema
 * FK, ON DELETE RESTRICT (a subject referenced by a load cannot be dropped).
 * `tenant_id` is sourced from the session GUC `app.tenant_id`, never client-
 * supplied (see migration default + RLS WITH CHECK).
 */
export const bebanMengajar = pgTable(
  "beban_mengajar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    ptkId: uuid("ptk_id")
      .notNull()
      .references(() => ptk.id, { onDelete: "cascade" }),
    mataPelajaranId: uuid("mata_pelajaran_id")
      .notNull()
      .references(() => mataPelajaran.id, { onDelete: "restrict" }),
    rombonganBelajarId: uuid("rombongan_belajar_id").references(
      () => rombonganBelajar.id,
      { onDelete: "cascade" }
    ),
    tingkatId: uuid("tingkat_id").references(() => tingkat.id, {
      onDelete: "cascade",
    }),
    tahunAjaranId: uuid("tahun_ajaran_id")
      .notNull()
      .references(() => tahunAjaran.id, { onDelete: "cascade" }),
    semester: text("semester").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "beban_mengajar_semester_check",
      sql`${t.semester} in ('ganjil', 'genap')`
    ),
    check(
      "beban_mengajar_target_check",
      sql`(${t.rombonganBelajarId} is not null) <> (${t.tingkatId} is not null)`
    ),
  ]
);

/**
 * Wali Kelas — class guardian assignment. One wali per Rombongan Belajar per
 * period (tahun_ajaran + semester).
 *
 * AC#3: UNIQUE per (tenant, rombongan_belajar, tahun_ajaran, semester). This is
 * a CURRENT-STATE assignment (not append-only history): past-period rows
 * persist for historical context, but changing the wali for the CURRENT period
 * is an UPDATE, not a new insert. `tenant_id` is sourced from the session GUC
 * `app.tenant_id`, never client-supplied (see migration default + RLS WITH
 * CHECK).
 */
export const waliKelas = pgTable(
  "wali_kelas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    ptkId: uuid("ptk_id")
      .notNull()
      .references(() => ptk.id, { onDelete: "cascade" }),
    rombonganBelajarId: uuid("rombongan_belajar_id")
      .notNull()
      .references(() => rombonganBelajar.id, { onDelete: "cascade" }),
    tahunAjaranId: uuid("tahun_ajaran_id")
      .notNull()
      .references(() => tahunAjaran.id, { onDelete: "cascade" }),
    semester: text("semester").notNull(),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "wali_kelas_semester_check",
      sql`${t.semester} in ('ganjil', 'genap')`
    ),
    unique("wali_kelas_tenant_rombel_ta_semester_unique").on(
      t.tenantId,
      t.rombonganBelajarId,
      t.tahunAjaranId,
      t.semester
    ),
  ]
);

export type BebanMengajar = typeof bebanMengajar.$inferSelect;
export type BebanMengajarInsert = typeof bebanMengajar.$inferInsert;
export type WaliKelas = typeof waliKelas.$inferSelect;
export type WaliKelasInsert = typeof waliKelas.$inferInsert;

// ---------------------------------------------------------------------------
// GRADING DATA LAYER — komponen_nilai -> penilaian -> nilai_peserta_didik.
//
// Tenant-scoped grading chain rooted at a beban_mengajar (and joined to
// peserta_didik at the leaf). Defined after beban_mengajar + peserta_didik so
// the FK references resolve without TDZ. Every link is ON DELETE CASCADE:
// deleting a teaching load rips the whole grading subtree; deleting a student
// removes their scores. `tenant_id` from the session GUC, never client-supplied.
// ---------------------------------------------------------------------------

/**
 * Komponen Nilai — grading component (UTS, UAS, Tugas Harian, ...) tied to a
 * Beban Mengajar.
 *
 * `bobot` is a positive weight used for Nilai Akhir derivation (AC#3 — visible
 * & auditable). Unique per (tenant, beban_mengajar, nama) so two components on
 * the same teaching load cannot share a name. Cascades on beban_mengajar delete.
 * `tenant_id` from the session GUC, never client-supplied (RLS WITH CHECK).
 */
export const komponenNilai = pgTable(
  "komponen_nilai",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    bebanMengajarId: uuid("beban_mengajar_id")
      .notNull()
      .references(() => bebanMengajar.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    bobot: numeric("bobot").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("komponen_nilai_bobot_check", sql`${t.bobot} > 0`),
    unique("komponen_nilai_tenant_beban_nama_unique").on(
      t.tenantId,
      t.bebanMengajarId,
      t.nama
    ),
  ]
);

/**
 * Penilaian — individual assessment within a Komponen Nilai (e.g. "Tugas 1",
 * "Ujian Tengah Semester"). `tanggal` is the assessment date; `dibuatOleh` is
 * the aktor userId. Unique per (tenant, komponen_nilai, nama). Cascades on
 * komponen_nilai delete.
 */
export const penilaian = pgTable(
  "penilaian",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    komponenNilaiId: uuid("komponen_nilai_id")
      .notNull()
      .references(() => komponenNilai.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    tanggal: date("tanggal").notNull(),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("penilaian_tenant_komponen_nama_unique").on(
      t.tenantId,
      t.komponenNilaiId,
      t.nama
    ),
  ]
);

/**
 * Nilai Peserta Didik — per-student score for a Penilaian. `nilai` is 0..100
 * and NULLABLE (absent / ungraded students get NULL — AC: nullable score with
 * CHECK 0<=nilai<=100). `catatan` is an optional teacher note. Unique per
 * (tenant, penilaian, peserta_didik) — one score row per student per
 * assessment. Cascades on delete of either penilaian or peserta_didik.
 */
export const nilaiPesertaDidik = pgTable(
  "nilai_peserta_didik",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    penilaianId: uuid("penilaian_id")
      .notNull()
      .references(() => penilaian.id, { onDelete: "cascade" }),
    pesertaDidikId: uuid("peserta_didik_id")
      .notNull()
      .references(() => pesertaDidik.id, { onDelete: "cascade" }),
    nilai: numeric("nilai"),
    catatan: text("catatan"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "nilai_peserta_didik_nilai_check",
      sql`${t.nilai} >= 0 and ${t.nilai} <= 100`
    ),
    unique("nilai_peserta_didik_tenant_penilaian_pd_unique").on(
      t.tenantId,
      t.penilaianId,
      t.pesertaDidikId
    ),
  ]
);

export type KomponenNilai = typeof komponenNilai.$inferSelect;
export type KomponenNilaiInsert = typeof komponenNilai.$inferInsert;
export type Penilaian = typeof penilaian.$inferSelect;
export type PenilaianInsert = typeof penilaian.$inferInsert;
export type NilaiPesertaDidik = typeof nilaiPesertaDidik.$inferSelect;
export type NilaiPesertaDidikInsert = typeof nilaiPesertaDidik.$inferInsert;

// ---------------------------------------------------------------------------
// AI WORKFLOW DATA LAYER — permintaan_ai -> draf_ai (1:1) + kuota_ai budget.
//
// Tenant-scoped tables for the AI assistance workflow. permintaan_ai is the
// request lifecycle (state machine: dibuat->diproses->selesai|gagal|
// dibatalkan); draf_ai is the AI output with a verification gate
// (menunggu->disetujui|ditolak); kuota_ai is the per-tenant per-period budget.
// Defined after tahun_ajaran so the kuota_ai FK resolves without TDZ.
//
// DOMAIN DISTINCTION (CONTEXT.md): "Permintaan AI" is the process request,
// "Draf AI" is draft output that MUST be reviewed, and the final Dokumen AI
// still requires Verifikasi Dokumen AI. `tenant_id` from the session GUC,
// never client-supplied (RLS WITH CHECK).
// ---------------------------------------------------------------------------

/**
 * Permintaan AI — AI request lifecycle (state machine).
 *
 * `status` flows dibuat -> diproses -> selesai | gagal | dibatalkan. A retry is
 * a NEW row with `permintaanTerkaitId` pointing at the prior attempt (ON DELETE
 * SET NULL so deleting the original keeps the retry). `konteks` is the JSON
 * context for the AI request (mapel, fase, elemen, ...). `pesanError` is set
 * when `status` = 'gagal'. `tenant_id` is sourced from the session GUC
 * `app.tenant_id`, never client-supplied (see migration default + RLS WITH
 * CHECK).
 */
export const permintaanAi = pgTable(
  "permintaan_ai",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    jenis: text("jenis").notNull(),
    konteks: jsonb("konteks").notNull().default({}),
    status: text("status").notNull().default("dibuat"),
    pesanError: text("pesan_error"),
    permintaanTerkaitId: uuid("permintaan_terkait_id").references(
      (): AnyPgColumn => permintaanAi.id,
      { onDelete: "set null" }
    ),
    dibuatOleh: text("dibuat_oleh").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
    diprosesPada: timestamp("diproses_pada", { withTimezone: true }),
    selesaiPada: timestamp("selesai_pada", { withTimezone: true }),
  },
  (t) => [
    check(
      "permintaan_ai_jenis_check",
      sql`${t.jenis} in ('deskripsi_cp', 'deskripsi_tp', 'deskripsi_atp', 'narasi_raport')`
    ),
    check(
      "permintaan_ai_status_check",
      sql`${t.status} in ('dibuat', 'diproses', 'selesai', 'gagal', 'dibatalkan')`
    ),
  ]
);

/**
 * Draf AI — AI output for one permintaan (1:1) with a verification gate.
 *
 * AC#3: AI content is NOT final by default. `statusVerifikasi` flows
 * menunggu -> disetujui | ditolak; only `disetujui` may be used downstream as a
 * Dokumen AI. `provenance` (AC#2) records model + prompt_hash + timestamp so AI
 * output is traceable, never anonymous. `konten` is the AI-generated text
 * (placeholder/mock in MVP). `diverifikasiOleh` is the approver userId. UNIQUE
 * on `permintaanAiId` enforces 1:1. Cascades on permintaan_ai delete.
 */
export const drafAi = pgTable(
  "draf_ai",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    permintaanAiId: uuid("permintaan_ai_id")
      .notNull()
      .references(() => permintaanAi.id, { onDelete: "cascade" }),
    konten: text("konten").notNull(),
    provenance: text("provenance").notNull(),
    statusVerifikasi: text("status_verifikasi").notNull().default("menunggu"),
    diverifikasiOleh: text("diverifikasi_oleh"),
    diverifikasiPada: timestamp("diverifikasi_pada", { withTimezone: true }),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("draf_ai_permintaan_ai_id_unique").on(t.permintaanAiId),
    check(
      "draf_ai_status_verifikasi_check",
      sql`${t.statusVerifikasi} in ('menunggu', 'disetujui', 'ditolak')`
    ),
  ]
);

/**
 * Kuota AI — per-tenant per-period (tahun_ajaran + semester) AI budget.
 *
 * AC#5: creating a permintaan_ai increments `terpakai`; the repo layer rejects
 * new requests when `terpakai >= batas`. `batas` defaults to 100. UNIQUE on
 * (tenant, tahun_ajaran, semester) so at most one quota row per period.
 * Cascades on delete of tenant or tahun_ajaran.
 */
export const kuotaAi = pgTable(
  "kuota_ai",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    tahunAjaranId: uuid("tahun_ajaran_id")
      .notNull()
      .references(() => tahunAjaran.id, { onDelete: "cascade" }),
    semester: text("semester").notNull(),
    terpakai: integer("terpakai").notNull().default(0),
    batas: integer("batas").notNull().default(100),
  },
  (t) => [
    check(
      "kuota_ai_semester_check",
      sql`${t.semester} in ('ganjil', 'genap')`
    ),
    unique("kuota_ai_tenant_ta_semester_unique").on(
      t.tenantId,
      t.tahunAjaranId,
      t.semester
    ),
  ]
);

export type PermintaanAi = typeof permintaanAi.$inferSelect;
export type PermintaanAiInsert = typeof permintaanAi.$inferInsert;
export type DrafAi = typeof drafAi.$inferSelect;
export type DrafAiInsert = typeof drafAi.$inferInsert;
export type KuotaAi = typeof kuotaAi.$inferSelect;
export type KuotaAiInsert = typeof kuotaAi.$inferInsert;

// ---------------------------------------------------------------------------
// E-RAPORT DOCUMENT LAYER — draf_eraport (lifecycle) + revisi_eraport (append-
// only history).
//
// Tenant-scoped tables for the E-Raport document lifecycle (Draf -> Terbit ->
// Revisi). draf_eraport is the report document per (peserta_didik, tahun_
// ajaran, semester); konten is a jsonb snapshot of the Nilai Akhir (#11)
// derivation plus report data. draf_ai_id optionally links a verified Draf AI
// (#12) used as AI-assisted narrative (AC#4 — must be disetujui, enforced in
// the repo layer). revisi_eraport is APPEND-ONLY (AC#3 accountability): a
// revision appends a new row and flips the parent status to 'revisi'. Defined
// after peserta_didik / tahun_ajaran / draf_ai so every FK resolves without
// TDZ. `tenant_id` from the session GUC, never client-supplied (RLS WITH CHECK).
// ---------------------------------------------------------------------------

/**
 * Draf E-Raport — the report document per (peserta_didik, tahun_ajaran,
 * semester) with a lifecycle state machine.
 *
 * AC#1: konten is a jsonb SNAPSHOT of the Nilai Akhir (#11) derivation + report
 * data at creation. AC#2: terbit is a protected, irreversible-ish transition
 * (the repo refuses a second terbit). AC#4: `drafAiId` optionally links a
 * verified (disetujui) Draf AI — the repo rejects menunggu/ditolak drafts.
 * UNIQUE on (tenant, peserta_didik, tahun_ajaran, semester) — one report per
 * student per period. Cascades on delete of peserta_didik / tahun_ajaran.
 * `tenant_id` is sourced from the session GUC `app.tenant_id`, never client-
 * supplied (see migration default + RLS WITH CHECK).
 */
export const drafEraport = pgTable(
  "draf_eraport",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    pesertaDidikId: uuid("peserta_didik_id")
      .notNull()
      .references(() => pesertaDidik.id, { onDelete: "cascade" }),
    tahunAjaranId: uuid("tahun_ajaran_id")
      .notNull()
      .references(() => tahunAjaran.id, { onDelete: "cascade" }),
    semester: text("semester").notNull(),
    status: text("status").notNull().default("draf"),
    konten: jsonb("konten").notNull().default({}),
    drafAiId: uuid("draf_ai_id").references(() => drafAi.id, {
      onDelete: "set null",
    }),
    catatan: text("catatan"),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
    diterbitkanPada: timestamp("diterbitkan_pada", { withTimezone: true }),
  },
  (t) => [
    check(
      "draf_eraport_semester_check",
      sql`${t.semester} in ('ganjil', 'genap')`
    ),
    check(
      "draf_eraport_status_check",
      sql`${t.status} in ('draf', 'terbit', 'revisi')`
    ),
    unique("draf_eraport_tenant_pd_ta_semester_unique").on(
      t.tenantId,
      t.pesertaDidikId,
      t.tahunAjaranId,
      t.semester
    ),
  ]
);

/**
 * Revisi E-Raport — APPEND-ONLY revision history (AC#3 accountability).
 *
 * A revision NEVER rewrites or deletes prior rows. Each revision appends a new
 * row carrying `alasan` (required reason) + optional `kontenPerubahan` (the
 * proposed change blob), and the action/repo layer atomically flips the parent
 * `draf_eraport.status` to 'revisi'. Cascades on draf_eraport delete.
 * `tenant_id` from the session GUC, never client-supplied (RLS WITH CHECK).
 */
export const revisiEraport = pgTable("revisi_eraport", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id")
    .notNull()
    .default(sql`current_setting('app.tenant_id', true)`)
    .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
  eraportId: uuid("eraport_id")
    .notNull()
    .references(() => drafEraport.id, { onDelete: "cascade" }),
  alasan: text("alasan").notNull(),
  kontenPerubahan: jsonb("konten_perubahan"),
  dibuatOleh: text("dibuat_oleh"),
  dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type DrafEraport = typeof drafEraport.$inferSelect;
export type DrafEraportInsert = typeof drafEraport.$inferInsert;
export type RevisiEraport = typeof revisiEraport.$inferSelect;
export type RevisiEraportInsert = typeof revisiEraport.$inferInsert;

// ---------------------------------------------------------------------------
// CETAK (PRINT/EXPORT) LAYER — template_cetak (config) + dokumen_cetak (output).
//
// Tenant-scoped tables for the E-Raport print/export surface (#14). template_
// cetak is a reusable print-config template (margin, font, header/footer,
// logo/header visibility); one default per (tenant, jenis). dokumen_cetak is a
// generated print document rooted at a TERBIT draf_eraport + a template, with
// print-element tanda tangan + stempel placeholders.
//
// AC#4 (MANDATORY): tanda_tangan_nama / tanda_tangan_peran / stempel_url on
// dokumen_cetak are PRINT ELEMENTS for document formatting only. They are NOT
// legal digital signatures, cryptographic proofs, or approval mechanisms. Do
// not rely on them for authorization or non-repudiation.
//
// Defined after draf_eraport so the FK resolves without TDZ. `tenant_id` from
// the session GUC, never client-supplied (RLS WITH CHECK).
// ---------------------------------------------------------------------------

/** Mirrors the schema CHECK constraint on `template_cetak.jenis`. */
export const JENIS_TEMPLATE_CETAK = ["eraport"] as const;
export type JenisTemplateCetak = (typeof JENIS_TEMPLATE_CETAK)[number];

/**
 * Template Cetak — reusable print-config template. `pengaturan` is a jsonb blob
 * (margin_mm, font_size, header_text, footer_text, show_logo, show_header). At
 * most one default per (tenant, jenis) — enforced in the repo layer (unset
 * others before setting is_default=true). `tenant_id` from the session GUC.
 */
export const templateCetak = pgTable(
  "template_cetak",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    jenis: text("jenis").notNull().default("eraport"),
    pengaturan: jsonb("pengaturan").notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("template_cetak_jenis_check", sql`${t.jenis} in ('eraport')`),
  ]
);

/**
 * Dokumen Cetak — a generated print document from a TERBIT draf_eraport (#14
 * AC#2) rendered with a template_cetak.
 *
 * AC#4: `tandaTanganNama` / `tandaTanganPeran` / `stempelUrl` are PRINT
 * ELEMENTS for formatting only — NOT legal digital signatures or approval
 * proof. Cascades on delete of draf_eraport or template_cetak.
 */
export const dokumenCetak = pgTable(
  "dokumen_cetak",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    drafEraportId: uuid("draf_eraport_id")
      .notNull()
      .references(() => drafEraport.id, { onDelete: "cascade" }),
    templateCetakId: uuid("template_cetak_id")
      .notNull()
      .references(() => templateCetak.id, { onDelete: "cascade" }),
    tandaTanganNama: text("tanda_tangan_nama"),
    tandaTanganPeran: text("tanda_tangan_peran"),
    stempelUrl: text("stempel_url"),
    format: text("format").notNull(),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [check("dokumen_cetak_format_check", sql`${t.format} in ('a4', 'f4')`)]
);

export type TemplateCetak = typeof templateCetak.$inferSelect;
export type TemplateCetakInsert = typeof templateCetak.$inferInsert;
export type DokumenCetak = typeof dokumenCetak.$inferSelect;
export type DokumenCetakInsert = typeof dokumenCetak.$inferInsert;
