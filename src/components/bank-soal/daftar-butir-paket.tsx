import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardHover } from "@/components/motion";
import type { ButirSoal, PaketSoalButir } from "@/db/schema";
import type { JenisButirSoal } from "@/db/queries/bank-soal";

import { LABEL_JENIS_BUTIR } from "./jenis-butir";
import type { ServerAksi } from "./form-butir-soal";

/**
 * Ordered list of Butir Soal in a Paket. Each row shows `urutan`, the
 * pertanyaan, jenis label, and `bobot`. The "Hapus dari Paket" form renders
 * only when `bolehUbah` — visibility only, the action re-checks server-side.
 * Removing a butir from a paket does NOT delete the butir itself.
 */
export function DaftarButirPaket({
  paketSoalId,
  members,
  butirMap,
  bolehUbah,
  hapusAction,
}: {
  paketSoalId: string;
  members: readonly PaketSoalButir[];
  /** butirId -> Butir Soal row (resolved by the page in one tenant-scoped pass). */
  butirMap: ReadonlyMap<string, ButirSoal>;
  bolehUbah: boolean;
  hapusAction: ServerAksi;
}) {
  if (members.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Belum ada Butir Soal dalam Paket ini.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {members.map((m) => {
        const butir = butirMap.get(m.butirSoalId);
        const jenis = butir?.jenis as JenisButirSoal | undefined;
        return (
          <CardHover
            as="li"
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-warm hover:border-accent/40"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {m.urutan}
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {butir ? butir.pertanyaan : "(Butir hilang)"}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {jenis ? LABEL_JENIS_BUTIR[jenis] : ""}
                  {butir ? ` · Kunci: ${butir.kunciJawaban}` : ""}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Bobot: <span className="font-mono">{m.bobot}</span>
              </span>
              {bolehUbah ? (
                <form action={hapusAction}>
                  <input type="hidden" name="paketSoalId" value={paketSoalId} />
                  <input
                    type="hidden"
                    name="butirSoalId"
                    value={m.butirSoalId}
                  />
                  <Button type="submit" size="sm" variant="outline">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Hapus dari Paket
                  </Button>
                </form>
              ) : null}
            </div>
          </CardHover>
        );
      })}
    </ol>
  );
}
