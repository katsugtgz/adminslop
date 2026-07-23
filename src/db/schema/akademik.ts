import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { pesertaDidik } from "./peserta-didik";

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
