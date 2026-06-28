import type { KontenCetak } from "@/db/queries/cetak";
import type { BarisPdf } from "@/lib/pdf/minimal-pdf";

/**
 * Pure presentation helpers for the Cetak PDF route. Kept in a non-route
 * module so the route file (`./route.ts`) exports ONLY the Next.js-legal
 * `GET` handler + `dynamic` — Next.js validates route exports at build time
 * and rejects arbitrary named exports.
 *
 * SECURITY: these functions perform NO authz or tenant scoping. They take an
 * already-resolved {@linkcode KontenCetak} payload and produce deterministic
 * presentation output.
 *
 * AC#4: tanda tangan / stempel info is deliberately NOT enriched with any
 * "signed by" framing — those fields remain print elements only.
 */
export function kontenKeBarisPdf(k: KontenCetak): BarisPdf[] {
  const baris: BarisPdf[] = [
    { teks: "E-Raport (Pratinjau Cetak)", gaya: "label" },
    { teks: "" },
  ];
  if (k.npsn) baris.push({ teks: `NPSN: ${k.npsn}` });
  if (k.alamat) baris.push({ teks: `Alamat: ${k.alamat}` });
  baris.push({ teks: `Semester: ${k.semester}` });
  baris.push({ teks: `Status: ${k.status}` });
  baris.push({ teks: `Format: ${k.formatPreferensi.toUpperCase()}` });
  baris.push({ teks: "" });
  baris.push({ teks: "Konten:", gaya: "label" });
  // Konten is opaque jsonb — render it pretty-printed so the PDF reader sees
  // the same shape the on-screen Pratinjau shows. Lines are already split.
  const json = JSON.stringify(k.konten, null, 2);
  for (const line of json.split("\n")) {
    baris.push({ teks: line || "" });
  }
  return baris;
}

/**
 * ASCII-only PDF filename (RFC 6266 `filename=` is happiest with ASCII;
 * RFC 5987 `filename*=UTF-8''…` is a separate header we deliberately do not
 * emit for MVP). Strips diacritics + non-alphanumerics, lowercases, clamps to
 * 40 chars. Falls back to `"eraport"` if the school name is empty.
 */
export function namaFilePdf(k: KontenCetak): string {
  const base =
    (k.namaSatuanPendidikan || "eraport")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "eraport";
  const semester = (k.semester || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${base}${semester ? `-${semester}` : ""}.pdf`;
}
