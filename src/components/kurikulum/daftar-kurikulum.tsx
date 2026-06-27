import Link from "next/link";

import { CardHover } from "@/components/motion";
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
  disetujui: "bg-accent/10 text-accent",
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          01 — Pilih
        </p>
        <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Pilih Kurikulum
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          Belum ada Kurikulum.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((k, idx) => {
            const selected = k.id === selectedId;
            const href = `/dashboard/kurikulum?kurikulumId=${encodeURIComponent(k.id)}`;
            return (
              <li key={k.id}>
                <CardHover asChild>
                  <Link
                    href={href}
                    aria-current={selected ? "true" : undefined}
                    className={`group relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg ${
                      selected
                        ? "border-accent ring-2 ring-accent/25"
                        : "border-border"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute left-0 top-0 h-full w-1 transition-colors group-hover:bg-accent/40 ${
                        selected ? "bg-accent" : "bg-accent/0"
                      }`}
                    />
                    <span className="flex flex-wrap items-center gap-3 pl-2">
                      <span
                        aria-hidden="true"
                        className="font-mono text-xs font-medium text-muted-foreground/60 transition-colors group-hover:text-accent"
                      >
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="text-base font-semibold text-foreground">
                        {k.nama}
                      </span>
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
                </CardHover>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
