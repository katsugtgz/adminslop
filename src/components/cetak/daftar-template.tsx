import type { TemplateCetak } from "@/db/schema";

function formatTanggal(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Compact, human-readable summary of a template's pengaturan blob. */
function ringkasanPengaturan(p: unknown): string {
  if (typeof p !== "object" || p === null) return "—";
  const o = p as Record<string, unknown>;
  const parts: string[] = [];
  if ("marginMm" in o) parts.push(`Margin ${o.marginMm}mm`);
  if ("fontSize" in o) parts.push(`Font ${o.fontSize}`);
  if ("showLogo" in o)
    parts.push(o.showLogo ? "Logo" : "Tanpa Logo");
  if ("showHeader" in o)
    parts.push(o.showHeader ? "Header" : "Tanpa Header");
  return parts.length > 0 ? parts.join(" · ") : "Default";
}

/**
 * Visible list of Template Cetak for the active Satuan Pendidikan. Each row
 * shows the nama, jenis, default badge, pengaturan summary, and dibuatPada.
 * Read-only display — mutations go through server actions (the page gates the
 * create form by `boleh("cetak:buat")`).
 */
export function DaftarTemplateCetak({
  templates,
}: {
  templates: readonly TemplateCetak[];
}) {
  if (templates.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] p-6 text-center text-sm text-muted-foreground">
        Belum ada Template Cetak.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {templates.map((t) => (
        <li
          key={t.id}
          className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 text-card-foreground shadow-warm transition-colors hover:border-accent/30 t-lift"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{t.nama}</span>
            {t.isDefault ? (
              <span className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success ring-1 ring-inset ring-success/30">
                Default
              </span>
            ) : null}
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
              Jenis: {t.jenis}
            </span>
          </span>
          <span className="flex flex-col items-end gap-0.5">
            <span className="text-xs text-muted-foreground">
              {ringkasanPengaturan(t.pengaturan)}
            </span>
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              Dibuat {formatTanggal(t.dibuatPada)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
