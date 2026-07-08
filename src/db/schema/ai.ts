import {
  type AnyPgColumn,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { tahunAjaran } from "./akademik";

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
