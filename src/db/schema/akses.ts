import {
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { satuanPendidikan } from "./core";

/**
 * PTK — catatan personel (pendidik / tenaga kependidikan).
 *
 * DOMAIN DISTINCTION (#6 acceptance criterion #1): a PTK is a personnel record
 * that exists independently of any login. Creating a PTK never creates a
 * Pengguna; access is granted only by linking a Pengguna to it via
 * `pengguna.ptkId`. `tenant_id` is sourced from the session GUC `app.tenant_id`,
 * never from a client-supplied value (see migration default + RLS WITH CHECK).
 */
export const ptk = pgTable(
  "ptk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    nama: text("nama").notNull(),
    nip: text("nip"),
    jenis: text("jenis").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // AC#1 (#19): soft-delete timestamp. NULL = active. "Delete" = archive only.
    // AC#2: arsip_oleh records the userId who archived (accountability).
    arsipPada: timestamp("arsip_pada", { withTimezone: true }),
    arsipOleh: text("arsip_oleh"),
  },
  (t) => [
    check(
      "ptk_jenis_check",
      sql`${t.jenis} in ('pendidik', 'tenaga_kependidikan')`
    ),
  ]
);

/**
 * Pengguna — identitas login aplikasi (WorkOS User).
 *
 * DOMAIN DISTINCTION: a Pengguna is a login identity, optionally linked to a PTK
 * via `ptkId` (nullable). `userId` is the stable WorkOS User.id; `peranAkses` is
 * a RoleSlug snapshot. Unique per (tenant, user). At most one pengguna per ptk
 * within a tenant — enforced by a partial unique index that allows multiple
 * unlinked (NULL `ptkId`) rows.
 */
export const pengguna = pgTable(
  "pengguna",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    peranAkses: text("peran_akses").notNull(),
    ptkId: uuid("ptk_id").references(() => ptk.id, { onDelete: "set null" }),
    nama: text("nama"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("pengguna_tenant_user_id_unique").on(t.tenantId, t.userId),
    uniqueIndex("pengguna_tenant_ptk_idx")
      .on(t.tenantId, t.ptkId)
      .where(sql`ptk_id is not null`),
  ]
);

/**
 * Izin Akses — pemberian izin eksplisit per pengguna (`slug` = IzinSlug, e.g.
 * `ptk:baca`). Unique per (tenant, pengguna, slug). Cascades on pengguna delete.
 */
export const izinAkses = pgTable(
  "izin_akses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    penggunaId: uuid("pengguna_id")
      .notNull()
      .references(() => pengguna.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("izin_akses_tenant_pengguna_slug_unique").on(
      t.tenantId,
      t.penggunaId,
      t.slug
    ),
  ]
);

/**
 * Pembatasan Akses — penolakan keras (hard-deny) per pengguna (`slug` =
 * IzinSlug). `alasan` optional, untuk penolakan yang dapat dijelaskan. Unique
 * per (tenant, pengguna, slug). Cascades on pengguna delete.
 */
export const pembatasanAkses = pgTable(
  "pembatasan_akses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id")
      .notNull()
      .default(sql`current_setting('app.tenant_id', true)`)
      .references(() => satuanPendidikan.id, { onDelete: "cascade" }),
    penggunaId: uuid("pengguna_id")
      .notNull()
      .references(() => pengguna.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    alasan: text("alasan"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("pembatasan_akses_tenant_pengguna_slug_unique").on(
      t.tenantId,
      t.penggunaId,
      t.slug
    ),
  ]
);

export type Ptk = typeof ptk.$inferSelect;
export type PtkInsert = typeof ptk.$inferInsert;
export type Pengguna = typeof pengguna.$inferSelect;
export type PenggunaInsert = typeof pengguna.$inferInsert;
export type IzinAkses = typeof izinAkses.$inferSelect;
export type IzinAksesInsert = typeof izinAkses.$inferInsert;
export type PembatasanAkses = typeof pembatasanAkses.$inferSelect;
export type PembatasanAksesInsert = typeof pembatasanAkses.$inferInsert;
