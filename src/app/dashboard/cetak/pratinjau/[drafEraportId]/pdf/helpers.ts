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

// Safe extractors — `konten` is opaque jsonb (`Record<string, unknown>`), so
// every access must be guarded. These helpers normalise the unknown shape into
// primitives we can format, returning empty/null when a field is absent or has
// an unexpected type. They NEVER throw.
function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArr(v: unknown): readonly unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStr(v: unknown): string {
  return typeof v === "string"
    ? v
    : typeof v === "number" || typeof v === "boolean"
      ? String(v)
      : "";
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// Render a numeric nilai: whole numbers without trailing ".0", else 1 decimal.
function formatNilai(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

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

  const konten = k.konten;

  const pd = asObj(konten["peserta_didik"]);
  if (pd) {
    const nama = asStr(pd["nama"]);
    const nisn = asStr(pd["nisn"]);
    const kelas = asStr(pd["kelas"]);
    if (nama || nisn || kelas) {
      baris.push({ teks: "Identitas Peserta Didik", gaya: "label" });
      if (nama) baris.push({ teks: `Nama Peserta Didik: ${nama}` });
      if (nisn) baris.push({ teks: `NISN: ${nisn}` });
      if (kelas) baris.push({ teks: `Kelas: ${kelas}` });
      baris.push({ teks: "" });
    }
  }

  const mapel = asArr(konten["mata_pelajaran"]);
  if (mapel.length > 0) {
    baris.push({ teks: "Mata Pelajaran", gaya: "label" });
    let ada = false;
    mapel.forEach((item, i) => {
      const m = asObj(item);
      if (!m) return;
      const nama = asStr(m["nama"]);
      if (!nama) return;
      ada = true;
      const segmen: string[] = [`${i + 1}. ${nama}`];
      const nilai = asNum(m["nilai"]);
      if (nilai !== null) segmen.push(`Nilai: ${formatNilai(nilai)}`);
      const predikat = asStr(m["predikat"]);
      if (predikat) segmen.push(`Predikat: ${predikat}`);
      baris.push({ teks: segmen.join(" - ") });
      const catatan = asStr(m["catatan"]);
      if (catatan) baris.push({ teks: `Catatan: ${catatan}` });
    });
    if (ada) baris.push({ teks: "" });
  }

  const ekskul = asStr(konten["ekstrakurikuler"]);
  if (ekskul) {
    baris.push({ teks: `Ekstrakurikuler: ${ekskul}` });
    baris.push({ teks: "" });
  }

  const hadir = asObj(konten["kehadiran"]);
  if (hadir) {
    const sakit = asNum(hadir["sakit"]);
    const izin = asNum(hadir["izin"]);
    const alpa = asNum(hadir["alpa"]);
    if (sakit !== null || izin !== null || alpa !== null) {
      baris.push({ teks: "Kehadiran", gaya: "label" });
      if (sakit !== null) baris.push({ teks: `Sakit: ${sakit} hari` });
      if (izin !== null) baris.push({ teks: `Izin: ${izin} hari` });
      if (alpa !== null) baris.push({ teks: `Alpa: ${alpa} hari` });
      baris.push({ teks: "" });
    }
  }

  const catatanWali = asStr(konten["catatan_wali_kelas"]);
  if (catatanWali) {
    baris.push({ teks: "Catatan Wali Kelas", gaya: "label" });
    baris.push({ teks: catatanWali });
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
