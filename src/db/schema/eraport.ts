import {
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { pesertaDidik } from "./peserta-didik";
import { tahunAjaran } from "./akademik";
import { drafAi } from "./ai";

/**
 * Draf E-Raport — the report document per (peserta_didik, tahun_ajaran,
 * semester) with a lifecycle state machine.
 *
 * AC#1: konten is a jsonb SNAPSHOT of the Nilai Akhir (#11) derivation + report
 * data at creation. AC#2: terbit is a protected, irreversible-ish transition
 * (the repo refuses a second terbit). AC#4: `drafAiId` optionally links a
 * verified (disetujui) Draf AI — the repo rejects menunggu/ditolak drafts.
 * UNIQUE on (tenant, peserta_didik, tahun_ajaran, semester) — one report per
 * student per period. Cascades on delete of peserta_didik / tahun_ajaran.
 * `tenant_id` is sourced from the GUC `app.tenant_id`, never client-
 * supplied (see migration default + RLS WITH CHECK).
 */
export const drafEraport = pgTable(
  "draf_eraport",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    pesertaDidikId: uuid("peserta_didik_id")
      .notNull()
      .references(() => pesertaDidik.id, { onDelete: "cascade" }),
    tahunAjaranId: uuid("tahun_ajaran_id")
      .notNull()
      .references(() => tahunAjaran.id, { onDelete: "cascade" }),
    semester: text("semester").notNull(),
    status: text("status").notNull().default("draf"),
    konten: jsonb("konten").notNull().default({}),
    drafAiId: uuid("draf_ai_id").references(() => drafAi.id, {
      onDelete: "set null",
    }),
    catatan: text("catatan"),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
    diterbitkanPada: timestamp("diterbitkan_pada", { withTimezone: true }),
  },
  (t) => [
    check(
      "draf_eraport_semester_check",
      sql`${t.semester} in ('ganjil', 'genap')`
    ),
    check(
      "draf_eraport_status_check",
      sql`${t.status} in ('draf', 'terbit', 'revisi')`
    ),
    unique("draf_eraport_tenant_pd_ta_semester_unique").on(
      t.tenantId,
      t.pesertaDidikId,
      t.tahunAjaranId,
      t.semester
    ),
  ]
);

/**
 * Revisi E-Raport — APPEND-ONLY revision history (AC#3 accountability).
 *
 * A revision NEVER rewrites or deletes prior rows. Each revision appends a new
 * row carrying `alasan` (required reason) + optional `kontenPerubahan` (the
 * proposed change blob), and the action/repo layer atomically flips the parent
 * `draf_eraport.status` to 'revisi'. Cascades on draf_eraport delete.
 * `tenant_id` from the session GUC, never client-supplied (RLS WITH CHECK).
 */
export const revisiEraport = pgTable("revisi_eraport", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id")
    .notNull()
    .default(sql`current_setting('app.tenant_id', true)`)
    .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
  eraportId: uuid("eraport_id")
    .notNull()
    .references(() => drafEraport.id, { onDelete: "cascade" }),
  alasan: text("alasan").notNull(),
  kontenPerubahan: jsonb("konten_perubahan"),
  dibuatOleh: text("dibuat_oleh"),
  dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type DrafEraport = typeof drafEraport.$inferSelect;
export type DrafEraportInsert = typeof drafEraport.$inferInsert;
export type RevisiEraport = typeof revisiEraport.$inferSelect;
export type RevisiEraportInsert = typeof revisiEraport.$inferInsert;
