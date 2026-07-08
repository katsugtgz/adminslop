import type { AlurTujuanPembelajaran } from "@/db/schema";

/**
 * Level 5 (LEAF) of the Kurikulum drill-down (#9 / T6): alur tujuan
 * pembelajaran for the selected tujuan pembelajaran. Pure display — no drill
 * links (this is the deepest reference level). Ordered by `urutan`. Read-only.
 * GLOBAL data (ADR 0001).
 */
export function DaftarAlurTujuanPembelajaran({
  items,
}: {
  items: readonly AlurTujuanPembelajaran[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="eyebrow-accent">
          06 — Alur
        </p>
        <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Alur Tujuan Pembelajaran
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          Belum ada Alur Tujuan Pembelajaran.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-warm"
            >
              <span className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted font-display text-sm font-semibold text-muted-foreground"
                >
                  {a.urutan}
                </span>
                <span className="flex-1 pt-1 text-sm text-foreground sm:text-[15px]">
                  {a.deskripsi}
                </span>
              </span>
              {a.sumber ? (
                <span className="pl-12 font-mono text-xs text-muted-foreground">
                  Sumber: {a.sumber}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
