import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { pengguna } from "./akses";

/**
 * Notifikasi — in-app notification addressed to ONE Pengguna (recipient). `tipe`
 * categorizes the reminder (tugas_nilai | tugas_absensi | tugas_eraport | umum);
 * `konteks` carries optional deep-link context ({bebanId, penilaianId, ...}).
 * `dibaca` tracks the read/unread badge state. `tenant_id` from the session GUC,
 * never client-supplied (see migration default + RLS WITH CHECK). Cascades on
 * pengguna delete.
 */
export const notifikasi = pgTable("notifikasi", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id")
    .notNull()
    .default(sql`current_setting('app.tenant_id', true)`)
    .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
  penggunaId: uuid("pengguna_id")
    .notNull()
    .references(() => pengguna.id, { onDelete: "cascade" }),
  tipe: text("tipe").notNull(),
  judul: text("judul").notNull(),
  pesan: text("pesan").notNull(),
  dibaca: boolean("dibaca").notNull().default(false),
  konteks: jsonb("konteks"),
  dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Preferensi Notifikasi — per-Pengguna per-tipe on/off toggle (self-service).
 * UNIQUE (tenant, pengguna, tipe) so upsert is safe. Convention: a MISSING row
 * for a tipe is treated as `aktif` (on) — the repo returns a default view when
 * no row exists. `tenant_id` from the session GUC, never client-supplied.
 * Cascades on pengguna delete.
 */
export const preferensiNotifikasi = pgTable(
  "preferensi_notifikasi",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    penggunaId: uuid("pengguna_id")
      .notNull()
      .references(() => pengguna.id, { onDelete: "cascade" }),
    tipe: text("tipe").notNull(),
    aktif: boolean("aktif").notNull().default(true),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("preferensi_notifikasi_tenant_pengguna_tipe_unique").on(
      t.tenantId,
      t.penggunaId,
      t.tipe
    ),
  ]
);

export type Notifikasi = typeof notifikasi.$inferSelect;
export type NotifikasiInsert = typeof notifikasi.$inferInsert;
export type PreferensiNotifikasi = typeof preferensiNotifikasi.$inferSelect;
export type PreferensiNotifikasiInsert = typeof preferensiNotifikasi.$inferInsert;
