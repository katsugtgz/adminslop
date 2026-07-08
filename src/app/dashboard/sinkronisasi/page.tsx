"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { DaftarPerubahanTertunda } from "@/components/offline/daftar-perubahan-tertunda";
import { IndikatorOffline } from "@/components/offline/indikator-offline";
import { PageReveal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { type StyleWithVars } from "@/lib/utils";

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
    <section className="flex flex-col gap-10 md:gap-12">
      <PageReveal
        as="header"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div
          aria-hidden="true"
          className="hero-glow pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{ "--glow-opacity": 0.35, "--glow-extent": "70%" } as StyleWithVars}
        />
        <div className="relative flex flex-col gap-3">
          <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Kembali ke Dasbor
            </Link>
          </Button>
          <p className="inline-flex items-center gap-2 eyebrow-accent">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Mode Offline
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
              Sinkronisasi Data
            </h1>
            <IndikatorOffline />
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
            Kelola draf Nilai dan Absensi yang tertunda saat Mode Offline.
            Sinkronkan saat tersambung kembali ke internet.
          </p>
        </div>
      </PageReveal>

      <PageReveal delay={2}>
        <DaftarPerubahanTertunda />
      </PageReveal>
    </section>
  );
}
