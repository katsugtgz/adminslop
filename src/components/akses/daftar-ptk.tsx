import { Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardHover } from "@/components/motion";
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
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Belum ada PTK.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {ptks.map((ptk) => (
        <li key={ptk.id}>
          <CardHover className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-warm hover:border-accent/40 md:p-5">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              >
                <User className="h-5 w-5" />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {ptk.nama}
                </span>
                <span className="text-xs text-muted-foreground">
                  NIP: {ptk.nip ? ptk.nip : "—"} · {labelJenis(ptk.jenis)}
                </span>
              </div>
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
          </CardHover>
        </li>
      ))}
    </ul>
  );
}
