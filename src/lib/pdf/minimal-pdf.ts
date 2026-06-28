/**
 * Tiny zero-dependency PDF-1.4 document builder for the Cetak export vertical
 * slice (#14, Wave 2 / Task 14). Produces a valid (Acrobat / Preview / pdf.js
 * -readable) single-page text-only PDF: header, catalog/pages/page/font
 * objects, one content stream, a 20-byte-aligned xref table, trailer, and
 * %%EOF.
 *
 * Why hand-rolled and not `pdfkit` / `jspdf` / `@react-pdf/renderer`:
 * hyperplan/plan.md defers those (heavy native/JS deps). The MVP "Unduh PDF"
 * need is a single-page text rendering of the E-Raport preview payload, which
 * a ~100-line ISO 32000-1 writer covers. The richer HTML+CSS Pratinjau (with
 * @page A4/F4, embedded stempel, tanda tangan block) remains the golden visual
 * target (AC#3) via the browser print dialog. When richer PDF fidelity is
 * needed, swap the body of {@linkcode buildMinimalPdf} for a `pdfkit` call —
 * the function signature and route handler stay the same.
 *
 * SECURITY: this module performs NO authz or tenant scoping. Callers (route
 * handlers / actions) must resolve the active Keanggotaan and read data under
 * `withTenant` BEFORE invoking. PDF construction is pure + synchronous.
 *
 * PDF 1.4 references (ISO 32000-1 §7.5): the xref table must list every object
 * (including the free head `0`), every entry is exactly 20 bytes
 * (`nnnnnnnnnn ggggg n \n` — 10-digit offset, 5-digit generation, in-use/free
 * flag, space, LF), the `startxref` byte offset must point at the `xref`
 * keyword, and the trailer's `/Root` must reference the catalog object.
 */

/** A4 portrait in PostScript points (1/72"). Used for the page MediaBox. */
const A4_POINTS = [0, 0, 595.28, 841.89] as const;

/** Inline font sizing for a single PDF text line. */
export type GayaPdf = "judul" | "label" | "body";

/** One line of text in the rendered PDF. Empty `teks` renders a blank row. */
export interface BarisPdf {
  /** Plain text for one line. */
  readonly teks: string;
  /** Inline style. Defaults to "body". */
  readonly gaya?: GayaPdf;
}

/** Input for {@linkcode buildMinimalPdf}. */
export interface DokumenPdfInput {
  /** Page title (rendered first, in judul style). */
  readonly judul: string;
  /** Body lines in render order. */
  readonly baris: readonly BarisPdf[];
}

const encoder = new TextEncoder();

function byteLength(s: string): number {
  return encoder.encode(s).length;
}

/**
 * Escape a string for inclusion inside a PDF text-string literal `( ... )`.
 * Strips combining diacritics (NFD), replaces any remaining non-ASCII byte
 * with `?` (the Bahasa Indonesia UI baseline is ASCII-only today), and escapes
 * the three PDF-special characters `\`, `(`, `)`. Raw CR/LF inside the string
 * is rejected (PDF string literals cannot contain unbalanced or control
 * chars); callers split multi-line content across multiple {@linkcode BarisPdf}
 * entries instead.
 */
function escapePdfText(s: string): string {
  return s
    .replace(/[\r\n\t]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function ukuranFont(gaya: GayaPdf | undefined): number {
  switch (gaya) {
    case "judul":
      return 18;
    case "label":
      return 11;
    default:
      return 12;
  }
}

/**
 * Build the PDF content stream — `BT ... ET` with one font resource (`/F1`
 * Helvetica), a fixed text leading of 16pt, and each line drawn via `Tj` (the
 * first line, after positioning) or `'` (subsequent lines, which advance by
 * the leading). Font size is varied per-line via `Tf`; the leading stays fixed
 * so the spacing is uniform.
 */
function buildContentStream(judul: string, baris: readonly BarisPdf[]): string {
  const out: string[] = ["BT", "16 TL"];
  let first = true;
  const renderLine = (teks: string, gaya: GayaPdf | undefined): void => {
    out.push(`/F1 ${ukuranFont(gaya)} Tf`);
    if (first) {
      out.push("72 770 Td");
      out.push(`(${escapePdfText(teks)}) Tj`);
      first = false;
    } else {
      // The `'` operator moves to the start of the next text line using the
      // current leading (TL) and then shows the string.
      out.push(`(${escapePdfText(teks)}) '`);
    }
  };

  renderLine(judul, "judul");
  for (const b of baris) renderLine(b.teks, b.gaya);
  out.push("ET");
  return out.join("\n");
}

/**
 * Build a minimal valid PDF 1.4 document as bytes. Pure + synchronous.
 *
 * Layout (5 indirect objects + xref + trailer):
 *   1 Catalog → 2 Pages
 *   2 Pages → [3 Page]
 *   3 Page → 4 Font (resources), 5 Content stream
 *   4 Font: Helvetica (one of the 14 standard fonts — no embedding needed)
 *   5 Content stream: BT ... ET (text operators)
 *
 * Throws never — malformed input is normalised by {@linkcode escapePdfText}.
 */
export function buildMinimalPdf(input: DokumenPdfInput): Uint8Array {
  const contentStream = buildContentStream(input.judul, input.baris);
  const contentLength = byteLength(contentStream);

  const objectBodies: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [${A4_POINTS.join(
      " "
    )}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream`,
  ];

  const header = "%PDF-1.4\n";
  const parts: string[] = [header];
  // xref offsets: index 0 is the free-object head, indices 1..N are objects.
  const offsets: number[] = [0];
  let cursor = byteLength(header);

  objectBodies.forEach((body, i) => {
    const objNum = i + 1;
    offsets[objNum] = cursor;
    const objText = `${objNum} 0 obj\n${body}\nendobj\n`;
    parts.push(objText);
    cursor += byteLength(objText);
  });

  const xrefOffset = cursor;
  const objCount = objectBodies.length + 1; // +1 for the free head (obj 0)
  // Each xref entry MUST be exactly 20 bytes (ISO 32000-1 §7.5.4). Format:
  // `nnnnnnnnnn ggggg f|n \n` — 10-digit offset, 1 space, 5-digit generation,
  // 1 space, in-use/free flag, 1 space, LF. The header lines (`xref`,
  // `0 N`) carry their own trailing LF and do NOT participate in the 20-byte
  // invariant.
  let xref = `xref\n0 ${objCount}\n0000000000 65535 f \n`;
  for (let i = 1; i < objCount; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  parts.push(xref);
  cursor += byteLength(xref);

  const trailer =
    `trailer\n<< /Size ${objCount} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(trailer);

  return encoder.encode(parts.join(""));
}
