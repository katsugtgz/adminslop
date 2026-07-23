import {
  check,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";

/**
 * Retensi Data — per-tenant per-table retention policy (AC#3). `periodeBulan`
 * defaults to 84 (7 years) to match typical Indonesian school record
 * retention. UNIQUE per (tenant, tabel). `tabel` is validated against a strict
 * whitelist in the action layer — never interpolated raw into SQL (AC#5).
 * `tenant_id` from the session GUC, never client-supplied (RLS WITH CHECK).
 */
export const retensiData = pgTable(
  "retensi_data",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    tabel: text("tabel").notNull(),
    periodeBulan: integer("periode_bulan").notNull().default(84),
    keterangan: text("keterangan"),
  },
  (t) => [
    check("retensi_data_periode_bulan_check", sql`${t.periodeBulan} > 0`),
    unique("retensi_data_tenant_tabel_unique").on(t.tenantId, t.tabel),
  ]
);

export type RetensiData = typeof retensiData.$inferSelect;
export type RetensiDataInsert = typeof retensiData.$inferInsert;
