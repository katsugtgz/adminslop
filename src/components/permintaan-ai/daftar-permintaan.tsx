import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardHover, ShimmerText } from "@/components/motion";
import type { PermintaanAi, DrafAi } from "@/db/schema";
import type { StatusPermintaanAi } from "@/db/queries/permintaan-ai";

import { KartuDraf } from "./kartu-draf";
import { LABEL_JENIS } from "./jenis-permintaan";
import type { ServerAksi } from "./form-permintaan";

const LABEL_STATUS: Record<StatusPermintaanAi, string> = {
  dibuat: "Dibuat",
  diproses: "Diproses",
  selesai: "Selesai",
  gagal: "Gagal",
  dibatalkan: "Dibatalkan",
};

const BADGE_STATUS: Record<StatusPermintaanAi, string> = {
  dibuat: "bg-muted text-muted-foreground",
  diproses: "bg-accent/10",
  selesai: "bg-success/15 text-success",
  gagal: "bg-destructive/12 text-destructive",
  dibatalkan: "bg-muted text-muted-foreground",
};

const BADGE_BASE =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

// Module-scope formatter — Intl.DateTimeFormat is expensive to construct.
const formatterTanggalMedium = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTanggal(d: Date): string {
  return formatterTanggalMedium.format(d);
}

/**
 * AC#1 visible-status list of Permintaan AI. Each row shows its Bahasa Jenis
 * label, a status badge, and the `dibuatPada` timestamp. Action surface is
 * gated by the caller's `bolehBuat` (visibility only — the actions re-check
 * server-side, identity doc §12):
 *   - `dibuat` | `diproses` + bolehBuat -> "Batalkan" form (posts `id`).
 *   - `gagal` + bolehBuat -> "Coba Lagi" form (posts `id`), plus the
 *     `pesanError` text.
 *   - `selesai` -> the linked {@linkcode KartuDraf} from `drafMap`.
 */
export function DaftarPermintaan({
  permintaan,
  drafMap,
  bolehBuat,
  bolehVerifikasi,
  batalkanAction,
  retryAction,
  verifikasiAction,
}: {
  permintaan: readonly PermintaanAi[];
  drafMap: ReadonlyMap<string, DrafAi>;
  bolehBuat: boolean;
  bolehVerifikasi: boolean;
  batalkanAction: ServerAksi;
  retryAction: ServerAksi;
  verifikasiAction: ServerAksi;
}) {
  if (permintaan.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Belum ada Permintaan AI.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {permintaan.map((p) => {
        const status = p.status as StatusPermintaanAi;
        const bisaBatalkan =
          bolehBuat && (status === "dibuat" || status === "diproses");
        const bisaRetry = bolehBuat && status === "gagal";
        const draf = drafMap.get(p.id);

        return (
          <CardHover
            as="li"
            key={p.id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm hover:border-accent/40"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {LABEL_JENIS[p.jenis as keyof typeof LABEL_JENIS]}
                </span>
                {status === "diproses" ? (
                  <ShimmerText className={`${BADGE_BASE} ${BADGE_STATUS.diproses}`}>
                    {LABEL_STATUS.diproses}
                  </ShimmerText>
                ) : (
                  <span className={`${BADGE_BASE} ${BADGE_STATUS[status]}`}>
                    {LABEL_STATUS[status]}
                  </span>
                )}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Dibuat {formatTanggal(p.dibuatPada)}
              </span>
            </div>

            {status === "gagal" && p.pesanError ? (
              <p className="text-xs text-destructive">
                {p.pesanError}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {bisaBatalkan ? (
                <form action={batalkanAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button type="submit" size="sm" variant="outline">
                    <X className="h-4 w-4" aria-hidden="true" />
                    Batalkan
                  </Button>
                </form>
              ) : null}

              {bisaRetry ? (
                <form action={retryAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <Button type="submit" size="sm" variant="outline">
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Coba Lagi
                  </Button>
                </form>
              ) : null}
            </div>

            {status === "selesai" && draf ? (
              <KartuDraf
                draf={draf}
                bolehVerifikasi={bolehVerifikasi}
                action={verifikasiAction}
              />
            ) : null}
          </CardHover>
        );
      })}
    </ul>
  );
}
