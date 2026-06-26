import Link from "next/link";

import type { Fase } from "@/db/schema";

/**
 * Level 2 of the Kurikulum drill-down (#9 / T6): the fase that have capaian
 * pembelajaran for the selected (kurikulum, mata pelajaran). Each item is a
 * `<Link>` preserving `kurikulumId`+`mapelId` and adding `faseId` (clearing
 * deeper levels). Read-only. GLOBAL data (ADR 0001).
 */
export function DaftarFase({
  items,
  selectedId,
  kurikulumId,
  mapelId,
}: {
  items: readonly Fase[];
  selectedId?: string;
  kurikulumId: string;
  mapelId: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Fase</h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Belum ada Fase.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((f) => {
            const selected = f.id === selectedId;
            const qs = new URLSearchParams({
              kurikulumId,
              mapelId,
              faseId: f.id,
            }).toString();
            return (
              <li key={f.id}>
                <Link
                  href={`/dashboard/kurikulum?${qs}`}
                  aria-current={selected ? "true" : undefined}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-primary ${
                    selected ? "border-primary ring-2 ring-primary" : "border-border"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {f.kode}
                    </span>
                    <span className="text-sm font-semibold">{f.nama}</span>
                    {f.rentangKelas ? (
                      <span className="text-xs text-muted-foreground">
                        {f.rentangKelas}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
