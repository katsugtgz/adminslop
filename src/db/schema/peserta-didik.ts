import {
  check,
  date,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";

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
