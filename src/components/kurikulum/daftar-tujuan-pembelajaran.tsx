import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { CardHover } from "@/components/motion";
import type { TujuanPembelajaran } from "@/db/schema";

/**
 * Level 4 of the Kurikulum drill-down (#9 / T6): tujuan pembelajaran for the
 * selected capaian pembelajaran. Each item is a `<Link>` preserving the active
 * ancestor params + `cpId`, and adding `tpId`. Ordered by `urutan`. Read-only.
 * GLOBAL data (ADR 0001).
 */
export function DaftarTujuanPembelajaran({
  items,
  selectedId,
  kurikulumId,
  mapelId,
  faseId,
  cpId,
}: {
  items: readonly TujuanPembelajaran[];
  selectedId?: string;
  kurikulumId: string;
  mapelId: string;
  faseId?: string;
  cpId: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="eyebrow-accent">
          05 — Tujuan
        </p>
        <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Tujuan Pembelajaran
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          Belum ada Tujuan Pembelajaran.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((t) => {
            const selected = t.id === selectedId;
            const params = new URLSearchParams({
              kurikulumId,
              mapelId,
              cpId,
              tpId: t.id,
            });
            if (faseId) params.set("faseId", faseId);
            return (
              <li key={t.id}>
                <CardHover asChild>
                  <Link
                    href={`/dashboard/kurikulum?${params.toString()}`}
                    aria-current={selected ? "true" : undefined}
                    className={`group flex items-start gap-3 rounded-2xl border bg-card p-5 shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg ${
                      selected
                        ? "border-accent ring-2 ring-accent/25"
                        : "border-border"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 font-display text-sm font-semibold text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
                    >
                      {t.urutan}
                    </span>
                    <span className="flex flex-1 flex-col gap-1">
                      <span className="text-sm text-foreground sm:text-[15px]">
                        {t.deskripsi}
                      </span>
                      {t.sumber ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          Sumber: {t.sumber}
                        </span>
                      ) : null}
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:-translate-y-0.5 group-hover:text-accent"
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
