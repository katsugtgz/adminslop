import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Tenant registry. `id` mirrors the WorkOS `Organization.id` (the Satuan
 * Pendidikan). Owned here for FK integrity only — lifecycle stays in WorkOS.
 * NOT tenant-scoped (it IS the tenant boundary), so it carries no RLS.
 */
export const satuanPendidikan = pgTable("satuan_pendidikan", {
  id: text("id").primaryKey(),
  nama: text("nama").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  // Profil (issue #5)
  npsn: text("npsn"),
  jenjang: text("jenjang"),
  alamat: text("alamat"),
  namaKepala: text("nama_kepala"),
  logoUrl: text("logo_url"),
  // Pengaturan (issue #5)
  tahunAjaranAktif: text("tahun_ajaran_aktif"),
  semesterAktif: text("semester_aktif"),
  zonaWaktu: text("zona_waktu").notNull().default("Asia/Jakarta"),
  // Preferensi Cetak (issue #5)
  cetakPaperSize: text("cetak_paper_size").notNull().default("A4"),
  cetakTampilkanLogo: boolean("cetak_tampilkan_logo").notNull().default(true),
  cetakTampilkanHeader: boolean("cetak_tampilkan_header")
    .notNull()
    .default(true),
});

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
export type SatuanPendidikan = typeof satuanPendidikan.$inferSelect;

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
