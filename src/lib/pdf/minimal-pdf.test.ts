import { describe, expect, it } from "vitest";

import { buildMinimalPdf, type BarisPdf } from "./minimal-pdf";

const decoder = new TextDecoder();

function decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/**
 * Parse the xref table out of a PDF and return a map of object-number → file
 * byte offset. Used by the structural assertions to verify the xref offsets
 * actually point at `N 0 obj` headers.
 */
function parseXref(pdf: string): {
  offsets: Map<number, number>;
  startxref: number;
} {
  const startxrefMatch = pdf.match(/startxref\s+(\d+)\s+%%EOF/);
  expect(startxrefMatch, "PDF must end with startxref + %%EOF").not.toBeNull();
  const startxref = Number(startxrefMatch![1]);

  const xrefBlock = pdf.slice(startxref);
  const headerMatch = xrefBlock.match(/^xref\s+(\d+)\s+(\d+)/m);
  expect(headerMatch, "xref keyword + subsection header must be present").not.toBeNull();
  const firstObj = Number(headerMatch![1]);
  const count = Number(headerMatch![2]);

  const entries: number[] = [];
  const entryRe = /(\d{10})\s+(\d{5})\s+([nf])\s?\n/gm;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xrefBlock)) !== null) {
    entries.push(Number(m[1]));
  }
  expect(entries.length, "xref entry count must match subsection header").toBe(count);

  const offsets = new Map<number, number>();
  entries.forEach((off, i) => {
    offsets.set(firstObj + i, off);
  });
  return { offsets, startxref };
}

const SAMPLE_BARIS: BarisPdf[] = [
  { teks: "E-Raport (Pratinjau Cetak)", gaya: "label" },
  { teks: "" },
  { teks: "NPSN: 12345678" },
  { teks: "Alamat: Jl. Contoh No. 1, Jakarta" },
  { teks: "Peserta Didik: Ahmad Budi Santoso (VIII-A)" },
  { teks: "Semester: 2024/1 (Ganjil)" },
  { teks: "Status: terbit" },
  { teks: "Format: A4" },
  { teks: "" },
  { teks: "Mata Pelajaran:", gaya: "label" },
  { teks: "- Matematika: 92.5 (A) — Sangat baik" },
  { teks: "- Bahasa Indonesia: 88.0 (B+) — Baik" },
  { teks: "- IPA Terpadu: 90.0 (A) — Sangat baik" },
  { teks: "- IPS Terpadu: 85.5 (B+) — Baik" },
  { teks: "" },
  { teks: "Kehadiran: Sakit 1 · Izin 0 · Alpa 0" },
  { teks: "Ekstrakurikuler: Pramuka (Penegak)" },
  { teks: "" },
  { teks: "Catatan Wali Kelas:", gaya: "label" },
  { teks: "Menunjukkan kemajuan yang konsisten semester ini." },
];

describe("buildMinimalPdf — structural validity (ISO 32000-1 §7.5)", () => {
  const bytes = buildMinimalPdf({
    judul: "SMP Negeri 1 Contoh",
    baris: SAMPLE_BARIS,
  });
  const pdf = decode(bytes);

  it("1. starts with the PDF-1.4 header magic", () => {
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
  });

  it("2. ends with startxref + %%EOF trailer", () => {
    expect(/startxref\s+\d+\s+%%EOF\s*$/.test(pdf)).toBe(true);
  });

  it("3. emits all 5 required indirect objects (Catalog/Pages/Page/Font/Content)", () => {
    expect(pdf).toMatch(/\/Type\s*\/Catalog/);
    expect(pdf).toMatch(/\/Type\s*\/Pages/);
    expect(pdf).toMatch(/\/Type\s*\/Page\b/);
    expect(pdf).toMatch(/\/Type\s*\/Font\s*\/Subtype\s*\/Type1\s*\/BaseFont\s*\/Helvetica/);
    expect(pdf).toMatch(/\/Contents\s+5\s+0\s+R/);
  });

  it("4. sets an A4 MediaBox in PostScript points", () => {
    expect(pdf).toMatch(/\/MediaBox\s*\[0 0 595\.28 841\.89\]/);
  });

  it("5. xref offsets actually point at `N 0 obj` headers", () => {
    const { offsets } = parseXref(pdf);
    for (const [objNum, off] of offsets) {
      if (objNum === 0) continue; // free head
      const slice = pdf.slice(off, off + 32);
      expect(
        slice.startsWith(`${objNum} 0 obj`),
        `obj ${objNum} offset ${off} should point at "${objNum} 0 obj", got: ${JSON.stringify(slice)}`
      ).toBe(true);
    }
  });

  it("6. /Length exactly matches the byte count between `stream\\n` and `\\nendstream`", () => {
    const lengthMatch = pdf.match(/\/Length\s+(\d+)\s*>>\s*stream\n/);
    expect(lengthMatch, "content stream must declare /Length").not.toBeNull();
    const declared = Number(lengthMatch![1]);
    const streamStart = pdf.indexOf("stream\n") + "stream\n".length;
    const streamEnd = pdf.indexOf("\nendstream", streamStart);
    const actual = new TextEncoder().encode(pdf.slice(streamStart, streamEnd)).length;
    expect(actual).toBe(declared);
  });

  it("7. trailer declares /Size and /Root pointing at the catalog (obj 1)", () => {
    expect(pdf).toMatch(/trailer\s*<<\s*\/Size\s+6\s*\/Root\s+1\s+0\s+R\s*>>/);
  });

  it("8. produces > 1000 bytes for a realistic E-Raport payload (Task 14 gate)", () => {
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("9. content stream contains the BT/ET text block with escaped title", () => {
    expect(pdf).toMatch(/BT\b[\s\S]*\/F1\s+18\s+Tf[\s\S]*\(SMP Negeri 1 Contoh\)\s+Tj[\s\S]*ET/);
  });
});

describe("buildMinimalPdf — escaping + edge cases", () => {
  it("10. escapes PDF-special characters in text literals", () => {
    const bytes = buildMinimalPdf({
      judul: "Sekolah (Satu)",
      baris: [{ teks: 'back\\slash (and) parens' }],
    });
    const pdf = decode(bytes);
    // Parens escape to `\(` and `\)` (one backslash each on the wire, which is
    // the 2-char JS string `"\\("`). The unescaped forms must NOT appear.
    expect(pdf).toContain("\\(Satu\\)");
    expect(pdf).toContain("\\(and\\)");
    expect(pdf).not.toContain("(Satu)");
    expect(pdf).not.toContain("(and)");
    // One input backslash escapes to two on the wire (4 chars in JS source).
    expect(pdf).toContain("back\\\\slash");
  });

  it("11. strips combining diacritics and replaces non-ASCII with '?'", () => {
    const bytes = buildMinimalPdf({
      judul: "Sekolah Bérsepakat",
      baris: [{ teks: "Bahasa: “Indonesia” — café" }],
    });
    const pdf = decode(bytes);
    // é (combining acute) stripped → "Bersepakat"; each curly quote → one '?';
    // em dash → one '?'; "café" diacritic stripped → "cafe".
    expect(pdf).toMatch(/\(Sekolah Bersepakat\)/);
    expect(pdf).toMatch(/\(Bahasa: \?Indonesia\? \? cafe\)/);
  });

  it("12. emits the boilerplate floor (~580 bytes) for a near-empty input", () => {
    const bytes = buildMinimalPdf({ judul: "X", baris: [] });
    // Documents the absolute minimum so a future caller can size assertions.
    // The route's kontenKeBarisPdf always emits ≥10 lines, so the real-world
    // minimum is comfortably above the Task 14 > 1000-byte gate.
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it("13. every xref entry is exactly 20 bytes wide", () => {
    const pdf = decode(buildMinimalPdf({ judul: "T", baris: SAMPLE_BARIS }));
    const xrefIdx = pdf.indexOf("xref\n0 6\n") ;
    expect(xrefIdx, "xref header `xref\\n0 6\\n` must be present").toBeGreaterThanOrEqual(0);
    const blockStart = xrefIdx + "xref\n0 6\n".length;
    const trailerIdx = pdf.indexOf("\ntrailer", blockStart);
    const entriesBlob = pdf.slice(blockStart, trailerIdx);
    const entries = entriesBlob.split("\n").filter((l) => l.length > 0);
    expect(entries.length, "1 free head + 5 objects = 6 entries").toBe(6);
    for (const e of entries) {
      // 20-byte invariant: `nnnnnnnnnn ggggg c \n` → 10 + 1 + 5 + 1 + 1 + 1
      // = 19 printable chars + the LF the split consumed = 20 bytes on wire.
      expect(e.length, `entry not 19 chars (20 with LF): ${JSON.stringify(e)}`).toBe(19);
      expect(e).toMatch(/^\d{10}\s\d{5}\s[nf] $/);
    }
  });
});
