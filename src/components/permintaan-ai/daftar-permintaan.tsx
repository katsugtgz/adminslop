import { RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PermintaanAi, DrafAi } from "@/db/schema";
import type { StatusPermintaanAi } from "@/db/queries/permintaan-ai";

import { KartuDraf } from "./kartu-draf";
import { LABEL_JENIS, type ServerAksi } from "./form-permintaan";

const LABEL_STATUS: Record<StatusPermintaanAi, string> = {
  dibuat: "Dibuat",
  diproses: "Diproses",
  selesai: "Selesai",
  gagal: "Gagal",
  dibatalkan: "Dibatalkan",
};

const BADGE_STATUS: Record<StatusPermintaanAi, string> = {
  dibuat: "bg-muted text-muted-foreground",
  diproses: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  selesai:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  gagal: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  dibatalkan: "bg-muted text-muted-foreground",
};

function formatTanggal(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
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
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
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
          <li
            key={p.id}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {LABEL_JENIS[p.jenis as keyof typeof LABEL_JENIS]}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STATUS[status]}`}
                >
                  {LABEL_STATUS[status]}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                Dibuat {formatTanggal(p.dibuatPada)}
              </span>
            </div>

            {status === "gagal" && p.pesanError ? (
              <p className="text-xs text-rose-700 dark:text-rose-400">
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
          </li>
        );
      })}
    </ul>
  );
}
