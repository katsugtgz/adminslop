import {
  boolean,
  check,
  date,
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
