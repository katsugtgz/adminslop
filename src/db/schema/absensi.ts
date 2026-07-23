import {
  check,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";
import { pesertaDidik } from "./peserta-didik";
import { rombonganBelajar } from "./akademik";

/**
 * Absensi Harian — daily attendance record. One row per peserta_didik per
 * tanggal per rombongan_belajar (UNIQUE tenant+peserta_didik+tanggal).
 *
 * `statusKehadiran` is Hadir/Izin/Sakit/Alpa (AC#2). `metodeInput` is
 * manual/qr; `sumberQr` carries the QR session token when qr (NULL for manual).
 * AC#3: a QR-sourced row is still CORRECTABLE via UPDATE — `sumberQr` presence
 * does NOT lock the record. `dibuatOleh` is the Guru userId. Cascades on delete
 * of peserta_didik or rombongan_belajar.
 */
export const absensiHarian = pgTable(
  "absensi_harian",
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
    tanggal: date("tanggal").notNull(),
    statusKehadiran: text("status_kehadiran").notNull(),
    metodeInput: text("metode_input").notNull().default("manual"),
    catatan: text("catatan"),
    sumberQr: text("sumber_qr"),
    /**
     * #21 Mode Offline — optimistic-concurrency version. Defaults to 1; bumped
     * on every successful UPDATE by the sync endpoint. AC#4: when the client's
     * `versi` does not match the server's, a conflict is surfaced (no silent
     * overwrite).
     */
    versi: integer("versi").notNull().default(1),
    dibuatOleh: text("dibuat_oleh").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
    diperbaruiPada: timestamp("diperbarui_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "absensi_harian_status_kehadiran_check",
      sql`${t.statusKehadiran} in ('hadir', 'izin', 'sakit', 'alpa')`
    ),
    check(
      "absensi_harian_metode_input_check",
      sql`${t.metodeInput} in ('manual', 'qr')`
    ),
    unique("absensi_harian_tenant_pd_tanggal_unique").on(
      t.tenantId,
      t.pesertaDidikId,
      t.tanggal
    ),
  ]
);

export type AbsensiHarian = typeof absensiHarian.$inferSelect;
export type AbsensiHarianInsert = typeof absensiHarian.$inferInsert;
