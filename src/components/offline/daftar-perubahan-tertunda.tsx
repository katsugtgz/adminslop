"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listSemuaItem, hapusDraft } from "@/lib/offline/store";
import { syncSekarang } from "@/lib/offline/sync";
import type {
  HasilSinkronisasi,
  ItemSinkronisasi,
  TipeDraft,
} from "@/lib/offline/types";

import { PeringatanKonflik } from "./peringatan-konflik";

/**
 * Mode Offline (#21) — the Perubahan Tertunda surface (AC#1, AC#3, AC#4). Lists
 * every pending + conflicting draft, exposes a "Sinkronkan Sekarang" button,
 * and surfaces each conflict with its server-side versi via
 * {@linkcode PeringatanKonflik}.
 *
 * The list is read from localStorage client-side (`listSemuaItem`), so this
 * component is gated on `offline:baca` at the page layer (every role has it by
 * default). The sync button is disabled while offline (the queue would no-op
 * anyway; disabling makes that visible).
 */
export function DaftarPerubahanTertunda() {
  const [items, setItems] = useState<ItemSinkronisasi[]>([]);
  const [sedangSinkron, setSedangSinkron] = useState(false);
  const [hasil, setHasil] = useState<HasilSinkronisasi | null>(null);
  const [online, setOnline] = useState<boolean>(true);

  const refresh = useCallback(() => {
    setItems(listSemuaItem());
  }, []);

  useEffect(() => {
    refresh();
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", () => {
      updateOnline();
      refresh();
    });
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, [refresh]);

  const handleSync = useCallback(async () => {
    setSedangSinkron(true);
    try {
      const h = await syncSekarang();
      setHasil(h);
      refresh();
    } finally {
      setSedangSinkron(false);
    }
  }, [refresh]);

  const handleBuangKonflik = useCallback(
    (tipe: TipeDraft, id: string) => {
      hapusDraft(tipe, id);
      refresh();
    },
    [refresh]
  );

  const menunggu = items.filter((i) => i.status === "menunggu");
  const konflik = items.filter((i) => i.status === "konflik");

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Perubahan Tertunda
          </h2>
          <p className="text-sm text-muted-foreground">
            Data lokal belum disinkronkan{!online && " — sedang offline"}.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleSync}
          disabled={sedangSinkron || !online || items.length === 0}
        >
          <RefreshCw
            className={sedangSinkron ? "animate-spin" : ""}
            aria-hidden="true"
          />
          Sinkronkan Sekarang
        </Button>
      </header>

      {hasil && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          Sinkronisasi selesai — {hasil.berhasil} berhasil, {hasil.konflik}{" "}
          konflik, {hasil.gagal} gagal.
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Belum ada perubahan tertunda.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {menunggu.map((item) => (
            <li
              key={item.draft.id}
              className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {ringkasanDraft(item)}
                </span>
                <LencanaStatus status={item.status} />
              </div>
            </li>
          ))}

          {konflik.map((item) => (
            <li key={item.draft.id}>
              <PeringatanKonflik
                item={item}
                onBuang={() =>
                  handleBuangKonflik(
                    "penilaianId" in item.draft ? "nilai" : "absensi",
                    item.draft.id
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Bahasa label for a draft's natural key (the user-facing identifier). */
function ringkasanDraft(item: ItemSinkronisasi): string {
  if ("penilaianId" in item.draft) {
    return `Nilai — Penilaian ${item.draft.penilaianId.slice(0, 8)}… (Peserta Didik ${item.draft.pesertaDidikId.slice(0, 8)}…)`;
  }
  return `Absensi ${item.draft.tanggal} — Peserta Didik ${item.draft.pesertaDidikId.slice(0, 8)}…`;
}

function LencanaStatus({
  status,
}: {
  status: ItemSinkronisasi["status"];
}) {
  if (status === "menunggu") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <Clock className="h-3 w-3" aria-hidden="true" />
        Menunggu
      </span>
    );
  }
  if (status === "tersinkron") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Tersinkron
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Konflik
    </span>
  );
}
