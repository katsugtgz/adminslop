import { Trash2 } from "lucide-react";

import { KosongDenganTautan } from "@/components/kosong-dengan-tautan";
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

/** Small dot badge for the active semester. */
function dotSemester(semester: Semester): string {
  return semester === "ganjil" ? "bg-accent" : "bg-chart-2";
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
      <KosongDenganTautan
        pesan="Belum ada Beban Mengajar."
        href={bolehKelola ? "#form-beban-mengajar" : "/dashboard/akses"}
        labelTautan={bolehKelola ? "Tambah Beban Mengajar" : "Buka Akses"}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {beban.map((row, idx) => (
        <li
          key={row.id}
          className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-warm transition-shadow hover:shadow-warm-lg"
        >
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="font-mono text-xs font-medium text-muted-foreground/60"
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="text-base font-semibold text-foreground">
                {row.ptkNama}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs text-muted-foreground">
              <span>{row.mataPelajaranNama}</span>
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>
              <span>Target: {row.targetNama}</span>
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${dotSemester(row.semester)}`}
                />
                {labelSemester(row.semester)}
              </span>
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
