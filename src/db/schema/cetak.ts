import {
  boolean,
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { drafEraport } from "./eraport";

/** Mirrors the schema CHECK constraint on `template_cetak.jenis`. */
export const JENIS_TEMPLATE_CETAK = ["eraport"] as const;
export type JenisTemplateCetak = (typeof JENIS_TEMPLATE_CETAK)[number];

/**
 * Template Cetak — reusable print-config template. `pengaturan` is a jsonb blob
 * (margin_mm, font_size, header_text, footer_text, show_logo, show_header). At
 * most one default per (tenant, jenis) — enforced in the repo layer (unset
 * others before setting is_default=true). `tenant_id` from the session GUC.
 */
export const templateCetak = pgTable(
  "template_cetak",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    jenis: text("jenis").notNull().default("eraport"),
    pengaturan: jsonb("pengaturan").notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("template_cetak_jenis_check", sql`${t.jenis} in ('eraport')`),
  ]
);

/**
 * Dokumen Cetak — a generated print document from a TERBIT draf_eraport (#14
 * AC#2) rendered with a template_cetak.
 *
 * AC#4: `tandaTanganNama` / `tandaTanganPeran` / `stempelUrl` are PRINT
 * ELEMENTS for formatting only — NOT legal digital signatures or approval
 * proof. Cascades on delete of draf_eraport or template_cetak.
 */
export const dokumenCetak = pgTable(
  "dokumen_cetak",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    drafEraportId: uuid("draf_eraport_id")
      .notNull()
      .references(() => drafEraport.id, { onDelete: "cascade" }),
    templateCetakId: uuid("template_cetak_id")
      .notNull()
      .references(() => templateCetak.id, { onDelete: "cascade" }),
    tandaTanganNama: text("tanda_tangan_nama"),
    tandaTanganPeran: text("tanda_tangan_peran"),
    stempelUrl: text("stempel_url"),
    format: text("format").notNull(),
    dibuatOleh: text("dibuat_oleh"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [check("dokumen_cetak_format_check", sql`${t.format} in ('a4', 'f4')`)]
);

export type TemplateCetak = typeof templateCetak.$inferSelect;
export type TemplateCetakInsert = typeof templateCetak.$inferInsert;
export type DokumenCetak = typeof dokumenCetak.$inferSelect;
export type DokumenCetakInsert = typeof dokumenCetak.$inferInsert;
