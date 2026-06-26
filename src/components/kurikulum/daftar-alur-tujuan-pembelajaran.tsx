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
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">
        Alur Tujuan Pembelajaran
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Belum ada Alur Tujuan Pembelajaran.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
            >
              <span className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                  {a.urutan}
                </span>
                <span className="text-sm text-foreground">{a.deskripsi}</span>
              </span>
              {a.sumber ? (
                <span className="pl-8 text-xs text-muted-foreground">
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
