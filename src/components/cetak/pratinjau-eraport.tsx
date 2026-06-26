import type { KontenCetak } from "@/db/queries/cetak";
import type { FormatCetak } from "@/db/queries/cetak";

/**
 * Effective print settings after layering the Template Cetak `pengaturan` over
 * the Satuan Pendidikan preferensi defaults. Template values win when present.
 */
interface PengaturanEfektif {
  readonly format: FormatCetak;
  readonly showLogo: boolean;
  readonly showHeader: boolean;
  readonly headerText: string | null;
  readonly footerText: string | null;
  readonly marginMm: number | null;
  readonly fontSize: number | null;
}

function pengaturanDariTemplate(p: unknown): Record<string, unknown> {
  return typeof p === "object" && p !== null ? (p as Record<string, unknown>) : {};
}

/** Resolve the layered print settings for a {@linkcode KontenCetak} payload. */
export function hitungPengaturanEfektif(k: KontenCetak): PengaturanEfektif {
  const tp = pengaturanDariTemplate(k.template?.pengaturan);
  return {
    format: k.formatPreferensi,
    showLogo:
      typeof tp.showLogo === "boolean" ? tp.showLogo : k.tampilkanLogoDefault,
    showHeader:
      typeof tp.showHeader === "boolean" ? tp.showHeader : k.tampilkanHeaderDefault,
    headerText: typeof tp.headerText === "string" ? tp.headerText : null,
    footerText: typeof tp.footerText === "string" ? tp.footerText : null,
    marginMm: typeof tp.marginMm === "number" ? tp.marginMm : null,
    fontSize: typeof tp.fontSize === "number" ? tp.fontSize : null,
  };
}

/**
 * Pratinjau Cetak — renders the E-Raport konten in print-ready HTML (AC#3
 * golden visual check target). A4 or F4 layout is selected by the Satuan
 * Pendidikan paper-size preferensi (overridable via the Template Cetak). The
 * school identity header (nama, NPSN, alamat, logo when `showLogo`) renders at
 * the top; tanda tangan + stempel placeholders render at the bottom.
 *
 * AC#4: the Tanda Tangan and Stempel areas are PRINT ELEMENTS for document
 * formatting only — NOT legal signatures or approval proof.
 *
 * Structural hooks (for the golden visual test): the root carries
 * `data-cetak-format`, the school name is an <h1>, the NPSN/alamat are labelled
 * paragraphs, and the signature block carries `data-cetak-tanda-tangan`.
 */
export function PratinjauEraport({
  konten,
  tandaTanganNama,
  tandaTanganPeran,
}: {
  konten: KontenCetak;
  tandaTanganNama?: string | null;
  tandaTanganPeran?: string | null;
}) {
  const ef = hitungPengaturanEfektif(konten);
  const isA4 = ef.format === "a4";
  const widthClass = isA4 ? "cetak-a4" : "cetak-f4";
  const pageSize = isA4 ? "A4" : "F4";
  const pageStyle =
    ef.marginMm != null
      ? `@page { size: ${pageSize}; margin: ${ef.marginMm}mm; }`
      : `@page { size: ${pageSize}; margin: 15mm; }`;
  const bodyFont = ef.fontSize != null ? `${ef.fontSize}px` : undefined;

  return (
    <div className="flex flex-col items-center gap-4">
      <style dangerouslySetInnerHTML={{ __html: pageStyle }} />
      <div
        data-cetak-format={ef.format}
        className={`cetak-kertas ${widthClass} mx-auto flex flex-col gap-6 rounded-sm border border-border bg-white p-8 text-slate-900 shadow-md`}
        style={{ fontSize: bodyFont }}
      >
        {ef.showHeader ? (
          <header
            data-cetak-header
            className="flex flex-col items-center gap-2 border-b border-slate-300 pb-4 text-center"
          >
            {ef.showLogo && konten.logoUrl ? (
              <img
                src={konten.logoUrl}
                alt="Logo Satuan Pendidikan"
                className="h-16 w-16 object-contain"
              />
            ) : null}
            {ef.headerText ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {ef.headerText}
              </p>
            ) : null}
            <h1 className="text-xl font-bold tracking-tight">
              {konten.namaSatuanPendidikan}
            </h1>
            {konten.npsn ? (
              <p className="text-xs text-slate-600">
                NPSN: {konten.npsn}
              </p>
            ) : null}
            {konten.alamat ? (
              <p className="text-xs text-slate-600">{konten.alamat}</p>
            ) : null}
            <p className="text-xs text-slate-600">
              Semester: {konten.semester}
            </p>
          </header>
        ) : null}

        <section
          data-cetak-konten
          className="flex flex-col gap-3 text-sm leading-relaxed"
        >
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {JSON.stringify(konten.konten, null, 2)}
          </pre>
        </section>

        <footer
          data-cetak-tanda-tangan
          className="mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-slate-300 pt-4"
        >
          <div className="flex flex-col gap-1 text-xs text-slate-600">
            <span className="font-semibold">Stempel</span>
            <span className="inline-flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-slate-400 text-[10px] text-slate-400">
              Stempel
            </span>
          </div>
          <div className="flex flex-col gap-1 text-xs text-slate-600">
            <span className="font-semibold">Tanda Tangan</span>
            <span className="inline-flex h-20 items-end justify-center">
              {tandaTanganNama ?? "........................"}
            </span>
            <span className="font-medium text-slate-800">
              {tandaTanganNama ?? ""}
            </span>
            <span>{tandaTanganPeran ?? ""}</span>
          </div>
        </footer>

        {ef.footerText ? (
          <p className="text-center text-[10px] text-slate-500">
            {ef.footerText}
          </p>
        ) : null}
      </div>
    </div>
  );
}
