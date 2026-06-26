import { Button } from "@/components/ui/button";
import type { BarisArsip, TabelArsip } from "@/db/queries/arsip";
import { labelTabelArsip } from "@/db/queries/arsip";

import type { ServerAksi } from "./form-retensi";

/** Format a Date as a readable Bahasa timestamp. */
function formatWaktu(d: Date): string {
  return d.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Arsip Data list — archived records across the four supported tables. Each row
 * shows tabel + label + arsip_pada + arsip_oleh and a "Pulihkan" button posting
 * to `pulihkanAction`. The page only renders this when `boleh("arsip:baca")`;
 * the recover button only when `boleh("arsip:kelola")`. The action re-checks
 * server-side (§12).
 */
export function DaftarArsip({
  baris,
  bolehKelola,
  pulihkanAction,
}: {
  baris: readonly BarisArsip[];
  bolehKelola: boolean;
  pulihkanAction: ServerAksi;
}) {
  if (baris.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada arsip.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {baris.map((b) => (
        <li
          key={`${b.tabel}:${b.id}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{b.label}</span>
            <span className="text-xs text-muted-foreground">
              {labelTabelArsip(b.tabel as TabelArsip)} · Diarsipkan:{" "}
              {formatWaktu(b.arsipPada)}
              {b.arsipOleh ? ` oleh ${b.arsipOleh}` : ""}
            </span>
          </div>
          {bolehKelola && (
            <form action={pulihkanAction}>
              <input type="hidden" name="tabel" value={b.tabel} />
              <input type="hidden" name="id" value={b.id} />
              <Button type="submit" variant="outline" size="sm">
                Pulihkan
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
