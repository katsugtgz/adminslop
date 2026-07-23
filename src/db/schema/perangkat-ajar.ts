import {
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { mataPelajaran } from "./kurikulum";
import { tingkat, tahunAjaran } from "./akademik";
import { drafAi } from "./ai";

/**
 * Perangkat Ajar — teaching document per jenis, optionally AI-assisted.
 *
 * `jenis` (AC#1/AC#4) discriminates modul_ajar/rpp/silabus/prota/promes.
 * `mataPelajaranId` (AC#2) references the GLOBAL mata_pelajaran (ON DELETE
 * RESTRICT — a referenced subject cannot be dropped). `drafAiId` (AC#3) links
 * the AI draft source (ON DELETE SET NULL). `statusDokumenAi` is the
 * verification gate: NULL = not AI-assisted (already resmi); 'menunggu' =
 * AI-assisted, awaiting verification (NOT resmi); 'disetujui'/'ditolak' = the
 * verified verdict. `tenant_id` from the session GUC, never client-supplied.
 */
export const perangkatAjar = pgTable(
  "perangkat_ajar",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    jenis: text("jenis").notNull(),
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
    judul: text("judul").notNull(),
    konten: jsonb("konten").notNull().default({}),
    drafAiId: uuid("draf_ai_id").references(() => drafAi.id, {
      onDelete: "set null",
    }),
    statusDokumenAi: text("status_dokumen_ai"),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "perangkat_ajar_jenis_check",
      sql`${t.jenis} in ('modul_ajar', 'rpp', 'silabus', 'prota', 'promes')`
    ),
    check(
      "perangkat_ajar_semester_check",
      sql`(${t.semester} is null) or (${t.semester} in ('ganjil', 'genap'))`
    ),
    check(
      "perangkat_ajar_status_dokumen_ai_check",
      sql`(${t.statusDokumenAi} is null) or (${t.statusDokumenAi} in ('menunggu', 'disetujui', 'ditolak'))`
    ),
  ]
);

export type PerangkatAjar = typeof perangkatAjar.$inferSelect;
export type PerangkatAjarInsert = typeof perangkatAjar.$inferInsert;
