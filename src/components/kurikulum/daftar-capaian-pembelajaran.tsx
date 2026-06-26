import Link from "next/link";

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
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">
        Capaian Pembelajaran
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Belum ada Capaian Pembelajaran.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
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
                <Link
                  href={`/dashboard/kurikulum?${params.toString()}`}
                  aria-current={selected ? "true" : undefined}
                  className={`flex flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-primary ${
                    selected ? "border-primary ring-2 ring-primary" : "border-border"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {c.kode ? (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {c.kode}
                      </span>
                    ) : null}
                    {c.elemen ? (
                      <span className="text-sm font-semibold">{c.elemen}</span>
                    ) : null}
                  </span>
                  <span className="text-sm text-foreground">{c.deskripsi}</span>
                  {c.sumber ? (
                    <span className="text-xs text-muted-foreground">
                      Sumber: {c.sumber}
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
