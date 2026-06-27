import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ServerAksi } from "./form-beban-mengajar-baru";

/**
 * An enriched "view" row for a Wali Kelas assignment: the raw `wali_kelas` row
 * has only foreign-key ids, so the page resolves display names (PTK + Rombongan
 * Belajar) before handing rows to this list.
 */
export interface BarisWaliKelas {
  readonly id: string;
  readonly ptkNama: string;
  readonly rombonganBelajarNama: string;
}

/**
 * Read-only or manageable list of Wali Kelas assignments. When `bolehKelola` is
 * true each row renders its own server form posting to `hapusWaliKelasAction`
 * (destructive). When false (kepala_sekolah), no forms render.
 */
export function DaftarWaliKelas({
  wali,
  bolehKelola,
  hapusAction,
}: {
  wali: readonly BarisWaliKelas[];
  bolehKelola: boolean;
  hapusAction: ServerAksi;
}) {
  if (wali.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        Belum ada Wali Kelas.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {wali.map((row, idx) => (
        <li
          key={row.id}
          className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-warm transition-shadow hover:shadow-warm-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <span
              aria-hidden="true"
              className="font-mono text-xs font-medium text-muted-foreground/60"
            >
              {String(idx + 1).padStart(2, "0")}
            </span>
            {bolehKelola && (
              <form action={hapusAction}>
                <input type="hidden" name="id" value={row.id} />
                <Button type="submit" variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Hapus
                </Button>
              </form>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold text-foreground">
              {row.ptkNama}
            </span>
            <span className="text-xs text-muted-foreground">
              Wali: {row.rombonganBelajarNama}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
