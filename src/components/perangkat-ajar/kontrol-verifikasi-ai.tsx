import { AlertTriangle, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/motion";
import type { StatusDokumenAi } from "@/db/queries/perangkat-ajar";

import type { ServerAksi } from "./form-perangkat-ajar";

const LABEL_STATUS: Record<NonNullable<StatusDokumenAi>, string> = {
  menunggu: "Menunggu Verifikasi",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
};

const BADGE_STATUS: Record<NonNullable<StatusDokumenAi>, string> = {
  menunggu: "bg-warning/25 text-warning-foreground",
  disetujui: "bg-success/15 text-success",
  ditolak: "bg-destructive/12 text-destructive",
};

/**
 * Kontrol Verifikasi AI — the AC#3 gate rendered inline on each AI-assisted
 * Perangkat Ajar. `statusDokumenAi` is null for non-AI docs (nothing renders).
 * For 'menunggu' docs: shows the "belum diverifikasi tidak dapat digunakan
 * sebagai dokumen resmi" warning + (when `bolehUbah`) Setujui/Tolak forms. For
 * terminal states: shows the verdict badge only. Visibility is defense-in-depth
 * — the action re-checks `perangkat_ajar:ubah` server-side (identity doc §12).
 */
export function KontrolVerifikasiAi({
  statusDokumenAi,
  bolehUbah,
  perangkatAjarId,
  action,
}: {
  statusDokumenAi: StatusDokumenAi | null;
  bolehUbah: boolean;
  perangkatAjarId: string;
  action: ServerAksi;
}) {
  if (statusDokumenAi === null) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Dokumen AI Belum Diverifikasi
        </span>
        {statusDokumenAi === "menunggu" ? (
          <ShimmerText
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STATUS.menunggu}`}
          >
            {LABEL_STATUS.menunggu}
          </ShimmerText>
        ) : (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STATUS[statusDokumenAi]}`}
          >
            {LABEL_STATUS[statusDokumenAi]}
          </span>
        )}
      </div>

      {statusDokumenAi === "menunggu" ? (
        <>
          <p className="flex items-start gap-1.5 text-xs text-warning-foreground/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            Konten AI belum diverifikasi tidak dapat digunakan sebagai dokumen
            resmi.
          </p>
          {bolehUbah ? (
            <div className="flex flex-wrap gap-2">
              <form action={action}>
                <input type="hidden" name="id" value={perangkatAjarId} />
                <input type="hidden" name="keputusan" value="disetujui" />
                <Button type="submit" size="sm" variant="outline">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Disetujui
                </Button>
              </form>
              <form action={action}>
                <input type="hidden" name="id" value={perangkatAjarId} />
                <input type="hidden" name="keputusan" value="ditolak" />
                <Button type="submit" size="sm" variant="outline">
                  <X className="h-4 w-4" aria-hidden="true" />
                  Ditolak
                </Button>
              </form>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
