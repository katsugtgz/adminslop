import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Semester } from "@/db/queries/beban-mengajar";

import type { ServerAksi } from "./form-beban-mengajar-baru";

/**
 * An enriched "view" row for a Beban Mengajar: the raw `beban_mengajar` row has
 * only foreign-key ids, so the page resolves display names (PTK, Mata Pelajaran,
 * target Rombongan Belajar / Tingkat) before handing rows to this list. The
 * `semester` is the active-period semester ("ganjil" | "genap").
 */
export interface BarisBebanMengajar {
  readonly id: string;
  readonly ptkNama: string;
  readonly mataPelajaranNama: string;
  /** Rombongan Belajar nama OR Tingkat nama — whichever the row targets. */
  readonly targetNama: string;
  readonly semester: Semester;
}

/** Bahasa label for a semester slug. */
function labelSemester(semester: Semester): string {
  return semester === "ganjil" ? "Ganjil" : "Genap";
}

/**
 * Read-only or manageable list of Beban Mengajar. When `bolehKelola` is true
 * each row renders its own server form posting to `hapusBebanMengajarAction`
 * (destructive). When false (kepala_sekolah / guru-without-ptk), no forms
 * render — the list is purely informational.
 */
export function DaftarBebanMengajar({
  beban,
  bolehKelola,
  hapusAction,
}: {
  beban: readonly BarisBebanMengajar[];
  bolehKelola: boolean;
  hapusAction: ServerAksi;
}) {
  if (beban.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Beban Mengajar.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {beban.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{row.ptkNama}</span>
            <span className="text-xs text-muted-foreground">
              {row.mataPelajaranNama} · Target: {row.targetNama} ·{" "}
              {labelSemester(row.semester)}
            </span>
          </div>

          {bolehKelola && (
            <form action={hapusAction}>
              <input type="hidden" name="id" value={row.id} />
              <Button type="submit" variant="destructive" size="sm">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Hapus
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
