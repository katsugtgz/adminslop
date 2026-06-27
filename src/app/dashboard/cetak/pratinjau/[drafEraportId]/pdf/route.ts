import { getDb, withTenant } from "@/db/client";
import { getKontenCetak } from "@/db/queries/cetak";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { buildMinimalPdf } from "@/lib/pdf/minimal-pdf";

import { kontenKeBarisPdf, namaFilePdf } from "./helpers";

export const dynamic = "force-dynamic";

/**
 * GET /dashboard/cetak/pratinjau/[drafEraportId]/pdf — Unduh PDF vertical slice
 * (#14, Wave 2 / Task 14). Renders the E-Raport preview payload as a minimal
 * valid PDF document. This is the MVP "real PDF bytes" export path; the richer
 * HTML+CSS Pratinjau (with @page A4/F4, stempel, tanda tangan) remains the
 * golden visual target (AC#3) and is reached via the browser print dialog.
 *
 * SECURITY (identity doc §12 — "hiding UI is not authorization"): the route
 * re-evaluates `getAksesSaya()` and `boleh("cetak:baca")` SERVER-SIDE on every
 * call. The UI "Unduh PDF" link is convenience; this endpoint is the boundary.
 * A hostile client can `fetch` the URL directly — the authz check still runs.
 *
 * SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY
 * from `akses.membership.orgId` (the live WorkOS Keanggotaan). The
 * `drafEraportId` route param is resolved under `withTenant` (RLS session GUC
 * `app.tenant_id`), so a cross-tenant id resolves to null (404), never a leak.
 *
 * AC#4: any tanda tangan / stempel info rendered into the PDF is a PRINT
 * ELEMENT for document formatting only — NOT a legal signature or approval
 * proof.
 *
 * Status codes: 401 (no active Satuan Pendidikan) · 403 (no `cetak:baca`) ·
 * 404 (draf_eraport absent or cross-tenant) · 200 `application/pdf`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ drafEraportId: string }> }
): Promise<Response> {
  const { drafEraportId } = await params;

  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    return new Response("Satuan Pendidikan Aktif belum dipilih.", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (!akses.boleh("cetak:baca").diizinkan) {
    return new Response("Anda tidak memiliki izin untuk mencetak.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { db } = getDb();
  const konten = await withTenant(db, akses.membership.orgId, (tx) =>
    getKontenCetak(tx, drafEraportId)
  );

  if (!konten) {
    return new Response("Draf E-Raport tidak ditemukan.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const pdfBytes = buildMinimalPdf({
    judul: konten.namaSatuanPendidikan || "E-Raport",
    baris: kontenKeBarisPdf(konten),
  });

  return new Response(pdfBytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${namaFilePdf(konten)}"`,
      // Private (per-user tenant data) + no-store (no cached cross-tenant
      // leak surface in shared browsers).
      "Cache-Control": "private, no-store",
    },
  });
}
