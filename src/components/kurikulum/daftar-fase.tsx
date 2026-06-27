import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { CardHover } from "@/components/motion";
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          03 — Fase
        </p>
        <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Fase
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          Belum ada Fase.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => {
            const selected = f.id === selectedId;
            const qs = new URLSearchParams({
              kurikulumId,
              mapelId,
              faseId: f.id,
            }).toString();
            return (
              <li key={f.id}>
                <CardHover asChild>
                  <Link
                    href={`/dashboard/kurikulum?${qs}`}
                    aria-current={selected ? "true" : undefined}
                    className={`group relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl border bg-card p-5 shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg ${
                      selected
                        ? "border-accent ring-2 ring-accent/25"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-lg bg-accent/10 px-2.5 py-1 font-mono text-xs font-semibold text-accent">
                        {f.kode}
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:text-accent"
                      />
                    </div>
                    <span className="text-base font-semibold text-foreground">
                      {f.nama}
                    </span>
                    {f.rentangKelas ? (
                      <span className="text-xs text-muted-foreground">
                        {f.rentangKelas}
                      </span>
                    ) : null}
                  </Link>
                </CardHover>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
