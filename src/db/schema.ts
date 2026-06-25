import {
  boolean,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
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
