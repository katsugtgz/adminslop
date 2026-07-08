import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { CardHover } from "@/components/motion";
import type { MataPelajaran } from "@/db/schema";

/**
 * Level 1 of the Kurikulum drill-down (#9 / T6): the mata pelajaran that have
 * capaian pembelajaran under the selected kurikulum. Each item is a `<Link>`
 * preserving `kurikulumId` and adding `mapelId` (clearing deeper levels).
 * Read-only. GLOBAL data (ADR 0001).
 */
export function DaftarMataPelajaran({
  items,
  selectedId,
  kurikulumId,
}: {
  items: readonly MataPelajaran[];
  selectedId?: string;
  kurikulumId: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="eyebrow-accent">
          02 — Mata Pelajaran
        </p>
        <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Mata Pelajaran
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          Belum ada Mata Pelajaran.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((mp, idx) => {
            const selected = mp.id === selectedId;
            const qs = new URLSearchParams({
              kurikulumId,
              mapelId: mp.id,
            }).toString();
            return (
              <li key={mp.id}>
                <CardHover asChild>
                  <Link
                    href={`/dashboard/kurikulum?${qs}`}
                    aria-current={selected ? "true" : undefined}
                    className={`group relative flex h-full items-center justify-between gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg ${
                      selected
                        ? "border-accent ring-2 ring-accent/25"
                        : "border-border"
                    }`}
                  >
                    <span className="flex flex-col gap-1">
                      <span
                        aria-hidden="true"
                        className="font-mono text-xs font-medium text-muted-foreground/60 transition-colors group-hover:text-accent"
                      >
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="text-base font-semibold text-foreground">
                        {mp.nama}
                      </span>
                      {mp.kode ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          Kode: {mp.kode}
                        </span>
                      ) : null}
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:text-accent"
                    />
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
