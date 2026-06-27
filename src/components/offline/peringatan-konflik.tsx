"use client";

import { AlertTriangle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ItemSinkronisasi } from "@/lib/offline/types";

/**
 * Mode Offline (#21) — conflict card (AC#4). A conflicting draft is shown with
 * a warning, the server-versi message, and a "Buang draft lokal" action. The
 * server row is NEVER overwritten by the conflict path; the user must discard
 * the local draft (and re-enter it against the now-current server data) to
 * clear the conflict.
 */
export function PeringatanKonflik({
  item,
  onBuang,
}: {
  item: ItemSinkronisasi;
  onBuang: () => void;
}) {
  const label =
    "penilaianId" in item.draft
      ? `Nilai — Penilaian ${item.draft.penilaianId.slice(0, 8)}…`
      : `Absensi ${item.draft.tanggal}`;

  return (
    <div
      role="alert"
      className="t-lift flex flex-col gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 shadow-warm hover:border-destructive/50 md:p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
        >
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-base tracking-tight text-destructive">
            Konflik Sinkronisasi
          </h3>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-sm text-foreground">
            {item.error ?? "Terjadi konflik — data server lebih baru."}
          </p>
          <p className="text-xs text-muted-foreground">
            Data server lebih baru dari draf lokal Anda. Buang draf lokal dan
            ulangi perubahan terhadap data terkini.
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBuang}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Buang draft lokal
        </Button>
      </div>
    </div>
  );
}
