import { Button } from "@/components/ui/button";
import type { DrafEraport, PesertaDidik } from "@/db/schema";
import type { StatusEraport } from "@/db/queries/eraport";

import { DetailEraport } from "./detail-eraport";
import type { ServerAksi } from "./form-draf";

const LABEL_STATUS: Record<StatusEraport, string> = {
  draf: "Draf",
  terbit: "Terbit",
  revisi: "Revisi",
};

const BADGE_STATUS: Record<StatusEraport, string> = {
  draf: "bg-muted text-muted-foreground",
  terbit:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  revisi:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

function formatTanggal(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Resolve a peserta_didik nama by id (defensive when the map is partial). */
function namaPeserta(
  pdId: string,
  map: ReadonlyMap<string, PesertaDidik>
): string {
  return map.get(pdId)?.nama ?? pdId;
}

/**
 * AC#1 visible-status list of Draf E-Raport. Each row shows the peserta_didik
 * nama, a status badge, and the `dibuatPada` timestamp. Action surface is
 * gated by the caller's capability flags (visibility only — the actions
 * re-check server-side, identity doc §12):
 *   - `bolehTerbit` -> "Terbitkan" form on non-terbit rows.
 *   - `bolehRevisi` -> expandable {@linkcode DetailEraport} with the Revisi
 *     form + revision history.
 */
export function DaftarEraport({
  eraport,
  pesertaMap,
  revisiMap,
  bolehTerbit,
  bolehRevisi,
  terbitAction,
  revisiAction,
}: {
  eraport: readonly DrafEraport[];
  pesertaMap: ReadonlyMap<string, PesertaDidik>;
  revisiMap: ReadonlyMap<string, { alasan: string; dibuatPada: Date; dibuatOleh: string | null }[]>;
  bolehTerbit: boolean;
  bolehRevisi: boolean;
  terbitAction: ServerAksi;
  revisiAction: ServerAksi;
}) {
  if (eraport.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada E-Raport.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {eraport.map((e) => {
        const status = e.status as StatusEraport;
        const bisaTerbit = bolehTerbit && status !== "terbit";
        const revisiList = revisiMap.get(e.id) ?? [];

        return (
          <li
            key={e.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {namaPeserta(e.pesertaDidikId, pesertaMap)}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STATUS[status]}`}
                >
                  {LABEL_STATUS[status]}
                </span>
                <span className="text-xs text-muted-foreground">
                  Semester: {e.semester}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                Dibuat {formatTanggal(e.dibuatPada)}
              </span>
            </div>

            {e.diterbitkanPada ? (
              <p className="text-xs text-muted-foreground">
                Diterbitkan {formatTanggal(e.diterbitkanPada)}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {bisaTerbit ? (
                <form action={terbitAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <Button type="submit" size="sm">
                    Terbitkan
                  </Button>
                </form>
              ) : null}
            </div>

            <DetailEraport
              eraport={e}
              revisiList={revisiList}
              bolehRevisi={bolehRevisi}
              revisiAction={revisiAction}
            />
          </li>
        );
      })}
    </ul>
  );
}
