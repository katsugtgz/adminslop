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
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Wali Kelas.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {wali.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{row.ptkNama}</span>
            <span className="text-xs text-muted-foreground">
              Wali: {row.rombonganBelajarNama}
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
