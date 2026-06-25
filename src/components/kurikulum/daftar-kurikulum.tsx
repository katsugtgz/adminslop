import Link from "next/link";

import type { Kurikulum } from "@/db/schema";

/**
 * Kurikulum reference-data browser — Level 0 of the progressive drill-down
 * (#9 / T6). Read-only: every item is a `<Link>` that adds `kurikulumId` to the
 * query (clearing deeper levels — mapel/fase/cp/tp/atp — so the browser resets
 * into the chosen curriculum). GLOBAL data (ADR 0001): no tenant scoping.
 *
 * The approval-state badge uses the project token palette (`primary` for
 * disetujui, `muted` for memerlukan_tinjauan, `destructive` for ditolak).
 */
const LABEL_STATUS: Record<Kurikulum["statusPersetujuan"], string> = {
  disetujui: "Disetujui",
  memerlukan_tinjauan: "Memerlukan Tinjauan",
  ditolak: "Ditolak",
};

const BADGE_STATUS: Record<Kurikulum["statusPersetujuan"], string> = {
  disetujui: "bg-primary/10 text-primary",
  memerlukan_tinjauan: "bg-muted text-muted-foreground",
  ditolak: "bg-destructive/10 text-destructive",
};

export function DaftarKurikulum({
  items,
  selectedId,
}: {
  items: readonly Kurikulum[];
  selectedId?: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Pilih Kurikulum</h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Belum ada Kurikulum.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((k) => {
            const selected = k.id === selectedId;
            const href = `/dashboard/kurikulum?kurikulumId=${encodeURIComponent(k.id)}`;
            return (
              <li key={k.id}>
                <Link
                  href={href}
                  aria-current={selected ? "true" : undefined}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-primary ${
                    selected
                      ? "border-primary ring-2 ring-primary"
                      : "border-border"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold">{k.nama}</span>
                    <span className="text-xs text-muted-foreground">
                      Versi {k.versi}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STATUS[k.statusPersetujuan]}`}
                  >
                    {LABEL_STATUS[k.statusPersetujuan]}
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
