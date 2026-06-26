import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { KontakDarurat } from "@/db/schema";

import type { ServerAksi } from "./form-ubah-biodata";

/**
 * List of emergency contacts for a Peserta Didik. When `bolehTulis` is true each
 * row renders its own server form posting to `hapusKontakDaruratAction`
 * (destructive). When false, no forms render — the list is purely informational.
 */
export function DaftarKontakDarurat({
  kontak,
  bolehTulis,
  hapusAction,
}: {
  kontak: readonly KontakDarurat[];
  bolehTulis: boolean;
  hapusAction: ServerAksi;
}) {
  if (kontak.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Kontak Darurat.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {kontak.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{row.nama}</span>
            <span className="text-xs text-muted-foreground">
              Hubungan: {row.hubungan ? row.hubungan : "—"} · Telepon:{" "}
              {row.telepon ? row.telepon : "—"}
            </span>
          </div>

          {bolehTulis && (
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
