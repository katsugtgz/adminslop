import Link from "next/link";

import { CardHover } from "@/components/motion";
import type { PaketSoal } from "@/db/schema";
import type { MataPelajaran } from "@/db/schema";

/**
 * List of Paket Soal visible in the active tenant. Each row shows the nama,
 * mata pelajaran display name, tahun ajaran, semester, and a drill-down link
 * to the assembly view. The list is read-only here; management actions live
 * in the detail view.
 */
export function DaftarPaketSoal({
  paket,
  mapelMap,
  baseHref,
}: {
  paket: readonly PaketSoal[];
  /** mataPelajaranId -> MataPelajaran display row (for name resolution). */
  mapelMap: ReadonlyMap<string, MataPelajaran>;
  /** Prefix for the per-row drill-down link (searchParams-based routing). */
  baseHref: string;
}) {
  if (paket.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Belum ada Paket Soal.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {paket.map((p) => {
        const mapel = mapelMap.get(p.mataPelajaranId);
        return (
          <CardHover
            as="li"
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm hover:border-accent/40"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">
                {p.nama}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {mapel ? mapel.nama : "—"}
                {p.semester ? ` · ${p.semester}` : ""}
              </span>
            </div>
            <Link
              href={`${baseHref}&paketId=${p.id}`}
              className="text-xs font-medium text-accent underline-offset-4 hover:underline"
            >
              Rakit / Lihat Butir
            </Link>
          </CardHover>
        );
      })}
    </ul>
  );
}
