import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Ptk } from "@/db/schema";

import type { ServerAksi } from "./form-ptk-baru";

/** Bahasa label for a PTK jenis slug. */
function labelJenis(jenis: string): string {
  return jenis === "pendidik" ? "Pendidik" : "Tenaga Kependidikan";
}

/**
 * Read-only or manageable list of PTK in the active Satuan Pendidikan. When
 * `bolehKelola` is true each row renders its own server form posting to
 * `hapusPtkAction` (destructive). When false (kepala_sekolah), no forms render —
 * the list is purely informational.
 */
export function DaftarPtk({
  ptks,
  bolehKelola,
  hapusAction,
}: {
  ptks: readonly Ptk[];
  bolehKelola: boolean;
  hapusAction: ServerAksi;
}) {
  if (ptks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada PTK.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {ptks.map((ptk) => (
        <li
          key={ptk.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{ptk.nama}</span>
            <span className="text-xs text-muted-foreground">
              NIP: {ptk.nip ? ptk.nip : "—"} · {labelJenis(ptk.jenis)}
            </span>
          </div>

          {bolehKelola && (
            <form action={hapusAction}>
              <input type="hidden" name="ptkId" value={ptk.id} />
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
