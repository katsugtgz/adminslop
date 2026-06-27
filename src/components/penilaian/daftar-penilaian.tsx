import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Penilaian } from "@/db/schema";

import type { ServerAksi } from "./form-komponen-nilai";

/**
 * Read-only or manageable list of Penilaian within one Komponen Nilai.
 *
 * Each row is a `<Link>` that drills into the per-student Nilai entry by adding
 * `penilaianId` to the query. When `bolehTulis` is true each row also renders a
 * destructive Hapus form posting to `hapusPenilaianAction`; the action
 * re-checks `penilaian:ubah` + ownership (AC#4) server-side.
 *
 * `selectedId` marks the row matching the active `penilaianId` searchParam with
 * `aria-current="true"`. `bebanId` + `komponenId` are echoed back into the drill
 * href so navigating deeper does not lose the parent context.
 */
export function DaftarPenilaian({
  penilaian,
  bolehTulis,
  selectedId,
  bebanId,
  komponenId,
  hapusAction,
}: {
  penilaian: readonly Penilaian[];
  bolehTulis: boolean;
  selectedId?: string;
  bebanId: string;
  komponenId: string;
  hapusAction: ServerAksi;
}) {
  if (penilaian.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] p-6 text-center text-sm text-muted-foreground">
        Belum ada Penilaian.
      </p>
    );
  }

  const baseHref = `/dashboard/penilaian?bebanId=${encodeURIComponent(bebanId)}&komponenId=${encodeURIComponent(komponenId)}`;

  return (
    <ul className="flex flex-col gap-2">
      {penilaian.map((p) => {
        const selected = p.id === selectedId;
        return (
          <li
            key={p.id}
            aria-current={selected ? "true" : undefined}
            className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg aria-[current=true]:border-accent/50 aria-[current=true]:ring-2 aria-[current=true]:ring-accent/40 t-lift"
          >
            <Link
              href={`${baseHref}&penilaianId=${encodeURIComponent(p.id)}`}
              className="flex flex-col gap-0.5 hover:text-accent"
            >
              <span className="text-sm font-semibold">{p.nama}</span>
              <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                Tanggal: {p.tanggal}
              </span>
            </Link>

            {bolehTulis && (
              <form action={hapusAction}>
                <input type="hidden" name="id" value={p.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Hapus
                </Button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
