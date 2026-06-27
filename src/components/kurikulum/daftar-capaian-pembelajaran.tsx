import Link from "next/link";
import { ArrowUpRight, Quote } from "lucide-react";

import { CardHover } from "@/components/motion";
import type { CapaianPembelajaran } from "@/db/schema";

/**
 * Level 3 of the Kurikulum drill-down (#9 / T6): capaian pembelajaran for the
 * selected (kurikulum, mata pelajaran [, fase]). Each item is a `<Link>`
 * preserving the active ancestor params and adding `cpId` (clearing tp/atp).
 * Renders the FULL deskripsi (reference prose), elemen, and sumber. Read-only.
 * GLOBAL data (ADR 0001).
 */
export function DaftarCapaianPembelajaran({
  items,
  selectedId,
  kurikulumId,
  mapelId,
  faseId,
}: {
  items: readonly CapaianPembelajaran[];
  selectedId?: string;
  kurikulumId: string;
  mapelId: string;
  faseId?: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          04 — Capaian
        </p>
        <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Capaian Pembelajaran
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          Belum ada Capaian Pembelajaran.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((c) => {
            const selected = c.id === selectedId;
            const params = new URLSearchParams({
              kurikulumId,
              mapelId,
              cpId: c.id,
            });
            if (faseId) params.set("faseId", faseId);
            return (
              <li key={c.id}>
                <CardHover asChild>
                  <Link
                    href={`/dashboard/kurikulum?${params.toString()}`}
                    aria-current={selected ? "true" : undefined}
                    className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg ${
                      selected
                        ? "border-accent ring-2 ring-accent/25"
                        : "border-border"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="flex flex-wrap items-center gap-2">
                        {c.kode ? (
                          <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
                            {c.kode}
                          </span>
                        ) : null}
                        {c.elemen ? (
                          <span className="text-sm font-semibold text-foreground">
                            {c.elemen}
                          </span>
                        ) : null}
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:text-accent"
                      />
                    </div>
                    <p className="flex gap-2 text-sm text-foreground sm:text-[15px]">
                      <Quote
                        className="h-4 w-4 shrink-0 text-accent/50"
                        aria-hidden="true"
                      />
                      <span className="text-pretty">{c.deskripsi}</span>
                    </p>
                    {c.sumber ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        Sumber: {c.sumber}
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
