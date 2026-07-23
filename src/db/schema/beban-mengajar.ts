import {
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { ptk } from "./akses";
import { mataPelajaran } from "./kurikulum";
import { rombonganBelajar, tingkat, tahunAjaran } from "./akademik";

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
    arsipPada: timestamp("arsip_pada", { withTimezone: true }),
    arsipOleh: text("arsip_oleh"),
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
    arsipPada: timestamp("arsip_pada", { withTimezone: true }),
    arsipOleh: text("arsip_oleh"),
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
