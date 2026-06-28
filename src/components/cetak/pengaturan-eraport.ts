import type { KontenCetak, FormatCetak } from "@/db/queries/cetak";

/**
 * Effective print settings after layering the Template Cetak `pengaturan` over
 * the Satuan Pendidikan preferensi defaults. Template values win when present.
 */
export interface PengaturanEfektif {
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

function formatCetak(value: unknown, fallback: FormatCetak): FormatCetak {
  return value === "a4" || value === "f4" ? value : fallback;
}

function angkaDalamRentang(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

/** Resolve the layered print settings for a {@linkcode KontenCetak} payload. */
export function hitungPengaturanEfektif(k: KontenCetak): PengaturanEfektif {
  const tp = pengaturanDariTemplate(k.template?.pengaturan);
  return {
    format: formatCetak(tp.format, k.formatPreferensi),
    showLogo:
      typeof tp.showLogo === "boolean" ? tp.showLogo : k.tampilkanLogoDefault,
    showHeader:
      typeof tp.showHeader === "boolean" ? tp.showHeader : k.tampilkanHeaderDefault,
    headerText: typeof tp.headerText === "string" ? tp.headerText : null,
    footerText: typeof tp.footerText === "string" ? tp.footerText : null,
    marginMm: angkaDalamRentang(tp.marginMm, 0, 100),
    fontSize: angkaDalamRentang(tp.fontSize, 6, 72),
  };
}
