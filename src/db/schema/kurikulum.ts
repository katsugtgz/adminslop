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

/**
 * Kurikulum — national curriculum version/metadata (e.g. "Kurikulum Merdeka").
 *
 * GLOBAL reference table (ADR 0001): no tenant_id, no RLS, SELECT-only for
 * app_user. AC#2 versioning via `versi`; provenance via `sumber`/`sumberUrl`/
 * `tanggalAmbil`. AC#5: `statusPersetujuan` stays 'memerlukan_tinjauan' until a
 * human sets `disetujuiOleh`. NO AI-generated canonical data — `sumber` cites
 * the official source.
 */
export const kurikulum = pgTable(
  "kurikulum",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nama: text("nama").notNull(),
    versi: text("versi").notNull(),
    deskripsi: text("deskripsi"),
    sumber: text("sumber").notNull(),
    sumberUrl: text("sumber_url"),
    tanggalAmbil: date("tanggal_ambil").notNull().default(sql`current_date`),
    disetujuiOleh: text("disetujui_oleh"),
    statusPersetujuan: text("status_persetujuan")
      .notNull()
      .default("memerlukan_tinjauan"),
    dibuatPada: timestamp("dibuat_pada", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "kurikulum_status_persetujuan_check",
      sql`${t.statusPersetujuan} in ('memerlukan_tinjauan', 'disetujui', 'ditolak')`
    ),
  ]
);

/**
 * Mata Pelajaran — school subject, universal across all Satuan Pendidikan
 * (e.g. Matematika, Bahasa Indonesia). GLOBAL reference table (ADR 0001).
 * `kode` nullable; `nama` unique.
 */
export const mataPelajaran = pgTable(
  "mata_pelajaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kode: text("kode"),
    nama: text("nama").notNull(),
  },
  (t) => [
    unique("mata_pelajaran_kode_unique").on(t.kode),
    unique("mata_pelajaran_nama_unique").on(t.nama),
  ]
);

/**
 * Fase — Kurikulum Merdeka phase (A-F). GLOBAL reference table (ADR 0001).
 * `kode` is the canonical phase letter; `rentangKelas`/`jenjang` are
 * descriptive (some phases span jenjang).
 */
export const fase = pgTable(
  "fase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kode: text("kode").notNull(),
    nama: text("nama").notNull(),
    rentangKelas: text("rentang_kelas"),
    jenjang: text("jenjang"),
  },
  (t) => [unique("fase_kode_unique").on(t.kode)]
);

/**
 * Capaian Pembelajaran (CP) — learning outcome, child of a (kurikulum, mata
 * pelajaran, fase) triple. GLOBAL reference table (ADR 0001). Cascade-deletes
 * with its kurikulum; RESTRICTED by mata_pelajaran and fase (cannot drop a
 * referenced subject/phase). Unique per (kurikulum, mata pelajaran, fase,
 * kode) — `kode` is nullable so NULLs are distinct (standard PG semantics).
 */
export const capaianPembelajaran = pgTable(
  "capaian_pembelajaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kurikulumId: uuid("kurikulum_id")
      .notNull()
      .references(() => kurikulum.id, { onDelete: "cascade" }),
    mataPelajaranId: uuid("mata_pelajaran_id")
      .notNull()
      .references(() => mataPelajaran.id, { onDelete: "restrict" }),
    faseId: uuid("fase_id")
      .notNull()
      .references(() => fase.id, { onDelete: "restrict" }),
    kode: text("kode"),
    elemen: text("elemen"),
    deskripsi: text("deskripsi").notNull(),
    sumber: text("sumber"),
    catatan: text("catatan"),
  },
  (t) => [
    unique("capaian_pembelajaran_kur_mp_fase_kode_unique").on(
      t.kurikulumId,
      t.mataPelajaranId,
      t.faseId,
      t.kode
    ),
  ]
);

/**
 * Tujuan Pembelajaran (TP) — learning objective, child of a CP. GLOBAL
 * reference table (ADR 0001). Cascade-deletes with its CP. Unique per
 * (CP, urutan).
 */
export const tujuanPembelajaran = pgTable(
  "tujuan_pembelajaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    capaianPembelajaranId: uuid("capaian_pembelajaran_id")
      .notNull()
      .references(() => capaianPembelajaran.id, { onDelete: "cascade" }),
    urutan: integer("urutan").notNull(),
    deskripsi: text("deskripsi").notNull(),
    sumber: text("sumber"),
    catatan: text("catatan"),
  },
  (t) => [
    unique("tujuan_pembelajaran_cp_urutan_unique").on(
      t.capaianPembelajaranId,
      t.urutan
    ),
  ]
);

/**
 * Alur Tujuan Pembelajaran (ATP) — learning objective flow step, child of a
 * TP. GLOBAL reference table (ADR 0001). Cascade-deletes with its TP. Unique
 * per (TP, urutan).
 */
export const alurTujuanPembelajaran = pgTable(
  "alur_tujuan_pembelajaran",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tujuanPembelajaranId: uuid("tujuan_pembelajaran_id")
      .notNull()
      .references(() => tujuanPembelajaran.id, { onDelete: "cascade" }),
    urutan: integer("urutan").notNull(),
    deskripsi: text("deskripsi").notNull(),
    sumber: text("sumber"),
    catatan: text("catatan"),
  },
  (t) => [
    unique("alur_tujuan_pembelajaran_tp_urutan_unique").on(
      t.tujuanPembelajaranId,
      t.urutan
    ),
  ]
);

export type Kurikulum = typeof kurikulum.$inferSelect;
export type KurikulumInsert = typeof kurikulum.$inferInsert;
export type MataPelajaran = typeof mataPelajaran.$inferSelect;
export type MataPelajaranInsert = typeof mataPelajaran.$inferInsert;
export type Fase = typeof fase.$inferSelect;
export type FaseInsert = typeof fase.$inferInsert;
export type CapaianPembelajaran = typeof capaianPembelajaran.$inferSelect;
export type CapaianPembelajaranInsert = typeof capaianPembelajaran.$inferInsert;
export type TujuanPembelajaran = typeof tujuanPembelajaran.$inferSelect;
export type TujuanPembelajaranInsert = typeof tujuanPembelajaran.$inferInsert;
export type AlurTujuanPembelajaran =
  typeof alurTujuanPembelajaran.$inferSelect;
export type AlurTujuanPembelajaranInsert =
  typeof alurTujuanPembelajaran.$inferInsert;
