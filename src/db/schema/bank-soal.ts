import {
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { mataPelajaran } from "./kurikulum";
import { tingkat, tahunAjaran } from "./akademik";
import { drafAi } from "./ai";

/**
 * Butir Soal — individual question item (reusable, searchable).
 *
 * `jenis` is the question type (Pilihan Ganda / Essay / Isian / Jodohkan /
 * Benar-Salah). `pilihan` is the PG options JSON (null for non-PG types).
 * `kunci_jawaban` is the canonical answer; `pembahasan` is the optional
 * worked solution. `status` is aktif (default) or arsip — archive is a
 * soft-delete that hides the row from the active list without destroying it
 * (per CONTEXT.md, no hard-delete of domain data).
 *
 * AC#2 (provenance + verification gate): `drafAiId` optionally links to a
 * draf_ai. The repo layer rejects a non-null `drafAiId` whose
 * `statusVerifikasi` is not 'disetujui' — unverified AI content cannot
 * become canonical. ON DELETE SET NULL: dropping the draft detaches but
 * keeps the butir. `tenant_id` is sourced from the session GUC, never
 * client-supplied (RLS WITH CHECK).
 */
export const butirSoal = pgTable(
  "butir_soal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    mataPelajaranId: uuid("mata_pelajaran_id")
      .notNull()
      .references(() => mataPelajaran.id, { onDelete: "restrict" }),
    tingkatId: uuid("tingkat_id").references(() => tingkat.id, {
      onDelete: "cascade",
    }),
    jenis: text("jenis").notNull(),
    pertanyaan: text("pertanyaan").notNull(),
    pilihan: jsonb("pilihan"),
    kunciJawaban: text("kunci_jawaban").notNull(),
    pembahasan: text("pembahasan"),
    drafAiId: uuid("draf_ai_id").references(() => drafAi.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("aktif"),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "butir_soal_jenis_check",
      sql`${t.jenis} in ('pg', 'essay', 'isian', 'jodohkan', 'benar_salah')`
    ),
    check(
      "butir_soal_status_check",
      sql`${t.status} in ('aktif', 'arsip')`
    ),
  ]
);

/**
 * Paket Soal — assembled package of items for an assessment period.
 *
 * Tied to a Tahun Ajaran (required) + optional semester + optional Tingkat +
 * a Mata Pelajaran (GLOBAL, RESTRICT). The set of butir in this paket is held
 * in the `paket_soal_butir` junction with per-item `urutan` + `bobot`.
 * `tenant_id` is sourced from the session GUC, never client-supplied.
 */
export const paketSoal = pgTable(
  "paket_soal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    mataPelajaranId: uuid("mata_pelajaran_id")
      .notNull()
      .references(() => mataPelajaran.id, { onDelete: "restrict" }),
    tingkatId: uuid("tingkat_id").references(() => tingkat.id, {
      onDelete: "cascade",
    }),
    tahunAjaranId: uuid("tahun_ajaran_id")
      .notNull()
      .references(() => tahunAjaran.id, { onDelete: "cascade" }),
    semester: text("semester"),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "paket_soal_semester_check",
      sql`(${t.semester} is null) or (${t.semester} in ('ganjil', 'genap'))`
    ),
  ]
);

/**
 * Paket Soal Butir — ordered junction linking butir into paket.
 *
 * UNIQUE per (tenant, paket, butir): the same butir appears at most once per
 * paket. A butir MAY be reused across many paket with different `urutan` /
 * `bobot` per paket. `bobot` defaults to 1. `tenant_id` is sourced from the
 * session GUC, never client-supplied.
 */
export const paketSoalButir = pgTable(
  "paket_soal_butir",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    paketSoalId: uuid("paket_soal_id")
      .notNull()
      .references(() => paketSoal.id, { onDelete: "cascade" }),
    butirSoalId: uuid("butir_soal_id")
      .notNull()
      .references(() => butirSoal.id, { onDelete: "cascade" }),
    urutan: integer("urutan").notNull(),
    bobot: numeric("bobot").notNull().default("1"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("paket_soal_butir_tenant_paket_butir_unique").on(
      t.tenantId,
      t.paketSoalId,
      t.butirSoalId
    ),
  ]
);

export type ButirSoal = typeof butirSoal.$inferSelect;
export type ButirSoalInsert = typeof butirSoal.$inferInsert;
export type PaketSoal = typeof paketSoal.$inferSelect;
export type PaketSoalInsert = typeof paketSoal.$inferInsert;
export type PaketSoalButir = typeof paketSoalButir.$inferSelect;
export type PaketSoalButirInsert = typeof paketSoalButir.$inferInsert;
