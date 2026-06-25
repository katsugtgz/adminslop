import Link from "next/link";

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
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Mata Pelajaran</h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Belum ada Mata Pelajaran.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((mp) => {
            const selected = mp.id === selectedId;
            const qs = new URLSearchParams({
              kurikulumId,
              mapelId: mp.id,
            }).toString();
            return (
              <li key={mp.id}>
                <Link
                  href={`/dashboard/kurikulum?${qs}`}
                  aria-current={selected ? "true" : undefined}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-primary ${
                    selected ? "border-primary ring-2 ring-primary" : "border-border"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold">{mp.nama}</span>
                    {mp.kode ? (
                      <span className="text-xs text-muted-foreground">
                        Kode: {mp.kode}
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
