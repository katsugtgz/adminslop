import {
  check,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { pesertaDidik } from "./peserta-didik";
import { bebanMengajar } from "./beban-mengajar";

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
    arsipPada: timestamp("arsip_pada", { withTimezone: true }),
    arsipOleh: text("arsip_oleh"),
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
    /**
     * #21 Mode Offline — optimistic-concurrency version. Defaults to 1; bumped
     * on every successful UPDATE by the sync endpoint. AC#4: when the client's
     * `versi` does not match the server's, a conflict is surfaced (no silent
     * overwrite).
     */
    versi: integer("versi").notNull().default(1),
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
