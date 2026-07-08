import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { KomponenNilai } from "@/db/schema";

import type { ServerAksi } from "./form-komponen-nilai";

/**
 * Read-only or manageable list of Komponen Nilai for one Beban Mengajar.
 *
 * Each row is a `<Link>` that drills into the component's Penilaian list by
 * adding `komponenId` to the query (clearing any deeper `penilaianId`). When
 * `bolehTulis` is true (guru / admin / dev) each row also renders its own
 * server form posting to `hapusKomponenNilaiAction` (destructive); the action
 * re-checks `penilaian:ubah` + ownership (AC#4) server-side.
 *
 * `selectedId` marks the row matching the active `komponenId` searchParam with
 * `aria-current="true"` so the drill-down position is announced.
 *
 * NOTE: `KomponenNilai.bobot` is a drizzle `numeric()` column (string on read).
 * It is shown verbatim (e.g. "30"); the Nilai Akhir derivation converts it via
 * `Number(...)`.
 */
export function DaftarKomponenNilai({
  komponen,
  bolehTulis,
  selectedId,
  bebanId,
  hapusAction,
}: {
  komponen: readonly KomponenNilai[];
  bolehTulis: boolean;
  selectedId?: string;
  bebanId: string;
  hapusAction: ServerAksi;
}) {
  if (komponen.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] p-6 text-center text-sm text-muted-foreground">
        Belum ada Komponen Nilai.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {komponen.map((k) => {
        const selected = k.id === selectedId;
        return (
          <li
            key={k.id}
            aria-current={selected ? "true" : undefined}
            className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg aria-[current=true]:border-accent/50 aria-[current=true]:ring-2 aria-[current=true]:ring-accent/40 t-lift"
          >
            <Link
              href={`/dashboard/penilaian?bebanId=${encodeURIComponent(bebanId)}&komponenId=${encodeURIComponent(k.id)}`}
              className="flex flex-col gap-0.5 hover:text-accent"
            >
              <span className="text-sm font-semibold">{k.nama}</span>
              <span className="eyebrow text-muted-foreground">
                Bobot: {k.bobot}
              </span>
            </Link>

            {bolehTulis && (
              <form action={hapusAction}>
                <input type="hidden" name="id" value={k.id} />
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
