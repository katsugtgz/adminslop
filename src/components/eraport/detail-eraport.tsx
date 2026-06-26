"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { DrafEraport } from "@/db/schema";

import { FormRevisi } from "./form-revisi";
import type { ServerAksi } from "./form-draf";

/** Compact revision-history row view (append-only, newest-first). */
function RiwayatRevisi({
  revisiList,
}: {
  revisiList: readonly {
    alasan: string;
    dibuatPada: Date;
    dibuatOleh: string | null;
  }[];
}) {
  if (revisiList.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Riwayat Revisi
      </span>
      <ul className="flex flex-col gap-1.5">
        {revisiList.map((r, i) => (
          <li key={i} className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium text-foreground">Alasan Revisi: {r.alasan}</span>
            <span className="text-muted-foreground">
              {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(r.dibuatPada)}
              {r.dibuatOleh ? ` · ${r.dibuatOleh}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Expandable detail for a Draf E-Raport. Shows the konten JSON snapshot, the
 * optional Draf AI link, and — when `bolehRevisi` — the {@linkcode FormRevisi}
 * (posts `id` + `alasan` + optional `kontenPerubahan`). Revision history is
 * always visible (append-only, newest-first). The expand toggle is client-side
 * state; the actions re-check server-side (identity doc §12).
 */
export function DetailEraport({
  eraport,
  revisiList,
  bolehRevisi,
  revisiAction,
}: {
  eraport: DrafEraport;
  revisiList: readonly {
    alasan: string;
    dibuatPada: Date;
    dibuatOleh: string | null;
  }[];
  bolehRevisi: boolean;
  revisiAction: ServerAksi;
}) {
  const [terbuka, setTerbuka] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        aria-expanded={terbuka}
        onClick={() => setTerbuka((v) => !v)}
      >
        {terbuka ? "Sembunyikan Detail" : "Lihat Detail"}
      </Button>

      {terbuka ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Konten
            </span>
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 text-xs">
              {JSON.stringify(eraport.konten, null, 2)}
            </pre>
          </div>

          {eraport.drafAiId ? (
            <p className="text-xs text-muted-foreground">
              Tautan Draf AI: {eraport.drafAiId}
            </p>
          ) : null}

          <RiwayatRevisi revisiList={revisiList} />

          {bolehRevisi ? (
            <FormRevisi eraportId={eraport.id} action={revisiAction} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
