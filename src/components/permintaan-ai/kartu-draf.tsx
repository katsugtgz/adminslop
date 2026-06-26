import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DrafAi } from "@/db/schema";
import type { StatusVerifikasi } from "@/db/queries/draf-ai";

import type { ServerAksi } from "./form-permintaan";

/** Bahasa label for each {@linkcode StatusVerifikasi} slug. */
const LABEL_VERIFIKASI: Record<StatusVerifikasi, string> = {
  menunggu: "Menunggu Verifikasi",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
};

/**
 * Tailwind badge classes tuned per verification state for at-a-glance scanning.
 * AC#3: a menunggu draft is NOT final — amber signals it still needs review.
 */
const BADGE_VERIFIKASI: Record<StatusVerifikasi, string> = {
  menunggu: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  disetujui:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ditolak: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

/**
 * AC#2/AC#3 Draf AI card. Renders the AI-generated konten (clearly marked
 * `[DRAF AI]` so a reviewer never mistakes it for human/verified content), its
 * provenance (model + timestamp — traceable, never anonymous), and the
 * verification-gate UI:
 *   - `menunggu` + `bolehVerifikasi` -> "Setujui" + "Tolak" forms posting to
 *     the verifikasi action with `drafId` + `status` (disetujui | ditolak).
 *   - `menunggu` + `!bolehVerifikasi` -> badge only (no buttons).
 *   - terminal (`disetujui` | `ditolak`) -> badge only, idempotent (the repo
 *     refuses a second verdict).
 *
 * The page passes `bolehVerifikasi = akses.boleh("draf_ai:verifikasi")` — but
 * that is visibility only; the action re-checks server-side (identity doc §12).
 */
export function KartuDraf({
  draf,
  bolehVerifikasi,
  action,
}: {
  draf: DrafAi;
  bolehVerifikasi: boolean;
  action: ServerAksi;
}) {
  const status = draf.statusVerifikasi as StatusVerifikasi;
  const menunggu = status === "menunggu";

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Draf AI
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_VERIFIKASI[status]}`}
        >
          {LABEL_VERIFIKASI[status]}
        </span>
      </div>

      {/* AC#3: AI content is unmistakably marked so it is never treated as final. */}
      <div className="rounded-md border border-border bg-background p-3 text-sm">
        <span className="mr-2 font-mono text-xs font-bold text-amber-700 dark:text-amber-400">
          [DRAF AI]
        </span>
        <span className="whitespace-pre-wrap">{draf.konten}</span>
      </div>

      {/* AC#2 provenance — traceable output. */}
      <p className="text-xs text-muted-foreground">
        Provenance: {draf.provenance}
      </p>

      {status === "disetujui" ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Draf AI Terverifikasi
        </p>
      ) : null}

      {menunggu && bolehVerifikasi ? (
        <div className="flex flex-wrap gap-2">
          <form action={action}>
            <input type="hidden" name="drafId" value={draf.id} />
            <input type="hidden" name="status" value="disetujui" />
            <Button type="submit" size="sm">
              Setujui
            </Button>
          </form>
          <form action={action}>
            <input type="hidden" name="drafId" value={draf.id} />
            <input type="hidden" name="status" value="ditolak" />
            <Button type="submit" size="sm" variant="destructive">
              Tolak
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
