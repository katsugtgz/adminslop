"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Cetak page may hide a button for a `guru` client, but a
// determined client can construct a `fetch` + `FormData` and POST it directly
// to this action. That POST MUST still throw — the action is the boundary, not
// the UI. The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY from
// `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered `tenantId`
// field in formData is deliberately NEVER read. Tenant scoping happens via
// `withTenant(db, orgId, ...)` which sets the RLS session GUC `app.tenant_id`,
// so every repo lookup is already scoped to the active tenant.
//
// AC#4 (MANDATORY): Tanda Tangan Cetak and Stempel Cetak are PRINT ELEMENTS for
// document formatting only. They are NOT legal digital signatures,
// cryptographic proofs, or approval mechanisms. Do not rely on them for
// authorization or non-repudiation. The action stores them verbatim and confers
// no authorization meaning on them.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import { buatDokumenCetak, buatTemplateCetak } from "@/db/queries/cetak";
import type { FormatCetak } from "@/db/queries/cetak";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { requireAuth } from "@/lib/auth/server";

const REVALIDATE_TARGET = "/dashboard/cetak";

function isValidFormat(value: string): value is FormatCetak {
  return value === "a4" || value === "f4";
}

/**
 * Parse the template_cetak.pengaturan fields from formData into a jsonb object.
 * All fields are optional; missing numeric fields are omitted (not defaulted
 * here — the template stores only what the user supplied).
 */
function parsePengaturan(formData: FormData): Record<string, unknown> {
  const pengaturan: Record<string, unknown> = {};
  const marginMm = String(formData.get("marginMm") ?? "").trim();
  if (marginMm) {
    const n = Number(marginMm);
    if (Number.isFinite(n)) pengaturan.marginMm = n;
  }
  const fontSize = String(formData.get("fontSize") ?? "").trim();
  if (fontSize) {
    const n = Number(fontSize);
    if (Number.isFinite(n)) pengaturan.fontSize = n;
  }
  const headerText = String(formData.get("headerText") ?? "").trim();
  if (headerText) pengaturan.headerText = headerText;
  const footerText = String(formData.get("footerText") ?? "").trim();
  if (footerText) pengaturan.footerText = footerText;
  pengaturan.showLogo = formData.get("showLogo") === "on";
  pengaturan.showHeader = formData.get("showHeader") === "on";
  return pengaturan;
}

// 1. buatTemplateCetakAction ------------------------------------------------

/**
 * Create a Template Cetak. Requires `cetak:buat`. When `isDefault` is on, the
 * repo unsets every other default for the same jenis first (one default per
 * tenant per jenis). Manual validation: `nama` required.
 */
export async function buatTemplateCetakAction(
  formData: FormData
): Promise<void> {
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("cetak:buat").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk membuat Template Cetak.");
  }

  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) throw new Error("Nama Template wajib diisi.");

  const isDefault = formData.get("isDefault") === "on";
  const pengaturan = parsePengaturan(formData);

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const template = await buatTemplateCetak(tx, {
      nama,
      pengaturan,
      isDefault,
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_template_cetak",
      target: `template_cetak:${template.id}`,
      beban: { nama, isDefault },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 2. buatDokumenCetakAction -------------------------------------------------

/**
 * Generate a Dokumen Cetak from a TERBIT E-Raport (AC#2). Requires `cetak:buat`.
 * The repo validates the linked draf_eraport.status='terbit' — a draf/revisi
 * eraport cannot be printed. `format` validated to a4|f4 here (friendly error
 * before the schema CHECK).
 *
 * AC#4: tandaTanganNama / tandaTanganPeran / stempelUrl are PRINT ELEMENTS,
 * stored verbatim — they are NOT legal signatures or approval proof.
 */
export async function buatDokumenCetakAction(
  formData: FormData
): Promise<void> {
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("cetak:buat").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk membuat Dokumen Cetak.");
  }

  const drafEraportId = String(formData.get("drafEraportId") ?? "").trim();
  if (!drafEraportId) throw new Error("Draf E-Raport wajib dipilih.");
  const templateCetakId = String(formData.get("templateCetakId") ?? "").trim();
  if (!templateCetakId) throw new Error("Template Cetak wajib dipilih.");

  const formatRaw = String(formData.get("format") ?? "a4").trim();
  if (!isValidFormat(formatRaw)) {
    throw new Error("Format Kertas tidak valid (hanya A4 atau F4).");
  }
  const format: FormatCetak = formatRaw;

  // AC#4 PRINT ELEMENTS — stored verbatim, confer no authorization.
  const tandaTanganNama =
    String(formData.get("tandaTanganNama") ?? "").trim() || null;
  const tandaTanganPeran =
    String(formData.get("tandaTanganPeran") ?? "").trim() || null;
  const stempelUrl =
    String(formData.get("stempelUrl") ?? "").trim() || null;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const dokumen = await buatDokumenCetak(tx, {
      drafEraportId,
      templateCetakId,
      tandaTanganNama,
      tandaTanganPeran,
      stempelUrl,
      format,
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_dokumen_cetak",
      target: `dokumen_cetak:${dokumen.id}`,
      beban: { drafEraportId, templateCetakId, format },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
