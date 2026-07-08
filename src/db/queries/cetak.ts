/**
 * Data-access layer over the template_cetak + dokumen_cetak tables (Cetak /
 * print-export surface, #14). Pure repository functions — no authz logic, no
 * audit. Composed by the action layer.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#2 (terbit-only): `buatDokumenCetak` validates the linked draf_eraport is
 * in 'terbit' status — a draf/revisi eraport cannot be printed. A missing /
 * cross-tenant id throws (RLS hides it).
 *
 * AC#4 (PRINT ELEMENTS): the tanda_tangan_* / stempel_url columns are document
 * FORMATTING elements only. They are NOT legal signatures, cryptographic
 * proofs, or approval mechanisms. This repo treats them as opaque text.
 */
import { and, desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import {
  drafEraport,
  dokumenCetak,
  satuanPendidikan,
  templateCetak,
} from "../schema";
import type {
  DokumenCetak,
  JenisTemplateCetak,
  TemplateCetak,
} from "../schema";

/** Paper sizes accepted by dokumen_cetak.format (mirrors the CHECK). */
export type FormatCetak = "a4" | "f4";

/**
 * Flat, render-ready composition returned by {@linkcode getKontenCetak}. Folds
 * the draf_eraport konten, the Satuan Pendidikan identity + paper-size
 * preference, and the resolved Template Cetak pengaturan into one object the
 * Pratinjau component renders directly (AC#1 preview data).
 */
export interface KontenCetak {
  readonly eraportId: string;
  readonly semester: string;
  readonly status: string;
  readonly konten: Record<string, unknown>;
  /** School identity (nullable until the Satuan Pendidikan profile is filled). */
  readonly namaSatuanPendidikan: string;
  readonly npsn: string | null;
  readonly alamat: string | null;
  readonly logoUrl: string | null;
  /** Default paper size from the Satuan Pendidikan preferensi (#5/#14). */
  readonly formatPreferensi: FormatCetak;
  readonly tampilkanLogoDefault: boolean;
  readonly tampilkanHeaderDefault: boolean;
  /** Resolved Template Cetak (the default for jenis, or null if none exists). */
  readonly template: {
    readonly id: string;
    readonly nama: string;
    readonly pengaturan: Record<string, unknown>;
  } | null;
}

/** Input for `buatTemplateCetak`. `pengaturan` is the jsonb print config blob. */
export interface InputBuatTemplateCetak {
  readonly nama: string;
  readonly pengaturan?: Record<string, unknown>;
  readonly jenis?: JenisTemplateCetak;
  readonly isDefault?: boolean;
  readonly dibuatOleh?: string | null;
}

/** Optional filter for `listTemplateCetak` (independent). */
export interface OpsiListTemplateCetak {
  readonly jenis?: JenisTemplateCetak;
  readonly limit?: number;
}

/** Input for `buatDokumenCetak`. */
export interface InputBuatDokumenCetak {
  readonly drafEraportId: string;
  readonly templateCetakId: string;
  readonly tandaTanganNama?: string | null;
  readonly tandaTanganPeran?: string | null;
  readonly stempelUrl?: string | null;
  readonly format: FormatCetak;
  readonly dibuatOleh?: string | null;
}

/** Optional filter for `listDokumenCetak` (independent). */
export interface OpsiListDokumenCetak {
  readonly drafEraportId?: string;
  readonly limit?: number;
}

// Template Cetak CRUD --------------------------------------------------------

/**
 * Create a Template Cetak. When `isDefault` is true, every other template of
 * the same `jenis` in this tenant is flipped to `is_default=false` FIRST, so at
 * most one default exists per (tenant, jenis). The tenant scoping comes from
 * the surrounding `withTenant` (RLS), never from an argument. `jenis` defaults
 * to 'eraport' (the only MVP kind).
 */
export async function buatTemplateCetak(
  db: Db | Tx,
  input: InputBuatTemplateCetak
): Promise<TemplateCetak> {
  const jenis: JenisTemplateCetak = input.jenis ?? "eraport";

  if (input.isDefault) {
    await db
      .update(templateCetak)
      .set({ isDefault: false })
      .where(eq(templateCetak.jenis, jenis));
  }

  const [row] = await db
    .insert(templateCetak)
    .values({
      nama: input.nama,
      jenis,
      pengaturan: input.pengaturan ?? {},
      isDefault: input.isDefault ?? false,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .returning();
  return row;
}

/** List Template Cetak rows under the current tenant (RLS-scoped), newest first. */
export async function listTemplateCetak(
  db: Db | Tx,
  opts?: OpsiListTemplateCetak
): Promise<TemplateCetak[]> {
  return db
    .select()
    .from(templateCetak)
    .where(opts?.jenis ? eq(templateCetak.jenis, opts.jenis) : undefined)
    .orderBy(desc(templateCetak.dibuatPada))
    .limit(opts?.limit ?? 200);
}

/**
 * Find a Template Cetak by id within the current tenant (RLS-scoped). Returns
 * null when absent (including when the id exists only in another tenant).
 */
export async function cariTemplateCetakById(
  db: Db | Tx,
  id: string
): Promise<TemplateCetak | null> {
  const rows = await db
    .select()
    .from(templateCetak)
    .where(eq(templateCetak.id, id));
  return rows[0] ?? null;
}

/**
 * The default Template Cetak for a `jenis` in the current tenant. Returns null
 * when none is marked default (or when the tenant has no templates at all).
 */
export async function getTemplateDefault(
  db: Db | Tx,
  jenis: JenisTemplateCetak = "eraport"
): Promise<TemplateCetak | null> {
  const rows = await db
    .select()
    .from(templateCetak)
    .where(and(eq(templateCetak.jenis, jenis), eq(templateCetak.isDefault, true)));
  return rows[0] ?? null;
}

// Dokumen Cetak CRUD ---------------------------------------------------------

/**
 * Create a Dokumen Cetak from a TERBIT draf_eraport (AC#2). The repo validates
 * the linked draf_eraport.status='terbit' — a draf/revisi eraport cannot be
 * printed, and a missing / cross-tenant id throws (RLS hides it). The schema
 * CHECK enforces `format` in ('a4','f4').
 *
 * AC#4: tanda_tangan_* / stempel_url are stored verbatim as PRINT ELEMENTS —
 * they are not validated as signatures and confer no authorization.
 */
export async function buatDokumenCetak(
  db: Db | Tx,
  input: InputBuatDokumenCetak
): Promise<DokumenCetak> {
  const eraportRows = await db
    .select({ id: drafEraport.id, status: drafEraport.status })
    .from(drafEraport)
    .where(eq(drafEraport.id, input.drafEraportId));
  if (eraportRows.length === 0) {
    throw new Error("Draf E-Raport tidak ditemukan");
  }
  if (eraportRows[0].status !== "terbit") {
    throw new Error("Hanya E-Raport berstatus Terbit yang dapat dicetak");
  }

  const [row] = await db
    .insert(dokumenCetak)
    .values({
      drafEraportId: input.drafEraportId,
      templateCetakId: input.templateCetakId,
      tandaTanganNama: input.tandaTanganNama ?? null,
      tandaTanganPeran: input.tandaTanganPeran ?? null,
      stempelUrl: input.stempelUrl ?? null,
      format: input.format,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .returning();
  return row;
}

/** List Dokumen Cetak rows under the current tenant (RLS-scoped), newest first. */
export async function listDokumenCetak(
  db: Db | Tx,
  opts?: OpsiListDokumenCetak
): Promise<DokumenCetak[]> {
  return db
    .select()
    .from(dokumenCetak)
    .where(
      opts?.drafEraportId ? eq(dokumenCetak.drafEraportId, opts.drafEraportId) : undefined
    )
    .orderBy(desc(dokumenCetak.dibuatPada))
    .limit(opts?.limit ?? 500);
}

// Konten Cetak composition (AC#1 preview) ------------------------------------

/**
 * Compose the flat, render-ready print payload for a draf_eraport (AC#1 preview
 * data). Folds together:
 *   - the draf_eraport (konten, semester, status),
 *   - the Satuan Pendidikan identity (nama, npsn, alamat, logo_url) + paper-size
 *     preferensi (cetak_paper_size, cetak_tampilkan_logo/header),
 *   - the resolved Template Cetak pengaturan (the default for jenis 'eraport',
 *     or null when the tenant has none).
 *
 * Returns null when the draf_eraport is absent / cross-tenant (RLS hides it).
 * The Satuan Pendidikan row is read by the session GUC tenant id (it carries no
 * RLS — it IS the tenant boundary).
 */
export async function getKontenCetak(
  db: Db | Tx,
  drafEraportId: string
): Promise<KontenCetak | null> {
  const eraportRows = await db
    .select()
    .from(drafEraport)
    .where(eq(drafEraport.id, drafEraportId));
  if (eraportRows.length === 0) return null;
  const eraport = eraportRows[0];

  const spRows = await db
    .select()
    .from(satuanPendidikan)
    .where(sql`${satuanPendidikan.id} = current_setting('app.tenant_id', true)`);
  const sp = spRows[0];

  const template = await getTemplateDefault(db, "eraport");

  return {
    eraportId: eraport.id,
    semester: eraport.semester,
    status: eraport.status,
    konten: eraport.konten as Record<string, unknown>,
    namaSatuanPendidikan: sp?.nama ?? "",
    npsn: sp?.npsn ?? null,
    alamat: sp?.alamat ?? null,
    logoUrl: sp?.logoUrl ?? null,
    // DB stores uppercase ("A4"|"F4"); FormatCetak + PratinjauEraport use
    // lowercase. Normalise at the boundary (regression-guard for AC#3 print size).
    formatPreferensi: ((sp?.cetakPaperSize ?? "A4") as string).toLowerCase() as FormatCetak,
    tampilkanLogoDefault: sp?.cetakTampilkanLogo ?? true,
    tampilkanHeaderDefault: sp?.cetakTampilkanHeader ?? true,
    template: template
      ? {
          id: template.id,
          nama: template.nama,
          pengaturan: template.pengaturan as Record<string, unknown>,
        }
      : null,
  };
}
