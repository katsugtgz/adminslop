import Link from "next/link";

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
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">
        Tujuan Pembelajaran
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Belum ada Tujuan Pembelajaran.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
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
                <Link
                  href={`/dashboard/kurikulum?${params.toString()}`}
                  aria-current={selected ? "true" : undefined}
                  className={`flex flex-col gap-1 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-primary ${
                    selected ? "border-primary ring-2 ring-primary" : "border-border"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                      {t.urutan}
                    </span>
                    <span className="text-sm text-foreground">{t.deskripsi}</span>
                  </span>
                  {t.sumber ? (
                    <span className="pl-8 text-xs text-muted-foreground">
                      Sumber: {t.sumber}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
