"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DaftarPerubahanTertunda } from "@/components/offline/daftar-perubahan-tertunda";
import { IndikatorOffline } from "@/components/offline/indikator-offline";
import { Button } from "@/components/ui/button";

/**
 * Mode Offline (#21) — the Sinkronisasi Data page. Reachable from the
 * dashboard by every member (all roles carry `offline:baca`). Shows the offline
 * indicator, the pending + conflicting draft list, and the sync trigger.
 *
 * This is a `"use client"` component because the entire Mode Offline surface is
 * browser-side: drafts live in localStorage and sync via fetch. There is no
 * server data to preload — the page is a thin shell over the client store.
 */
export default function SinkronisasiPage() {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Kembali ke Dasbor
          </Link>
        </Button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Sinkronisasi Data</h1>
          <IndikatorOffline />
        </div>
        <p className="text-sm text-muted-foreground">
          Kelola draf Nilai dan Absensi yang tertunda saat Mode Offline.
          Sinkronkan saat tersambung kembali ke internet.
        </p>
      </header>

      <DaftarPerubahanTertunda />
    </section>
  );
}
