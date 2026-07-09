import Link from "next/link";
import { useId } from "react";
import { ArrowRight, Compass, Sparkles } from "lucide-react";

import { PageReveal, TextStagger } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { type StyleWithVars } from "@/lib/utils";

const HEADLINE_JUDUL: React.ReactNode = (
  <>
    EduAdmin Pro <span className="text-gradient-warm">Premium</span>
    <span className="text-accent">.</span>
  </>
);

export function KepalaBeranda() {
  return (
    <PageReveal
      as="section"
      className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card"
    >
      <BatikPattern className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]" />

      <div
        aria-hidden="true"
        className="hero-glow pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ "--glow-opacity": 0.42, "--glow-extent": "66%" } as StyleWithVars}
      />

      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-4 right-2 select-none font-display text-[9rem] leading-none tracking-tighter text-foreground/[0.035] sm:text-[12rem] md:-top-6 md:right-6 md:text-[15rem]"
      >
        01
      </span>

      <div className="relative px-6 py-10 sm:px-10 sm:py-16 md:px-16 md:py-14">
        <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Selamat datang di
        </p>

        <TextStagger
          as="h1"
          className="mt-5 font-display text-[2.5rem] leading-[0.95] tracking-tight text-foreground sm:mt-6 sm:text-7xl"
          lines={HEADLINE_JUDUL}
        />

        <p className="mt-6 max-w-2xl text-pretty text-base text-muted-foreground sm:mt-8 sm:text-xl">
          Satu produk untuk mengelola administrasi Satuan Pendidikan Anda:
          Peserta Didik, Nilai, E-Raport, Bank Soal, Perangkat Ajar, hingga
          Absensi QR.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3 sm:mt-10">
          <Button asChild size="lg" className="group h-12 px-6 text-base">
            <Link href="/dashboard">
              Masuk ke Dashboard
              <ArrowRight
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 px-6 text-base"
          >
            <Link href="/panduan">
              <Compass aria-hidden="true" />
              Tur Awal
            </Link>
          </Button>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/40 sm:mt-10">
          {[
            { label: "Modul", value: "7" },
            { label: "Bahasa", value: "Indonesia" },
            { label: "Konteks", value: "Aktif" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="min-w-0 bg-card/80 px-2 py-2 backdrop-blur-sm sm:px-6 sm:py-5"
            >
              <dt className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-xs sm:tracking-[0.18em]">
                {stat.label}
              </dt>
              <dd className="mt-1 truncate font-display text-base text-foreground sm:text-3xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </PageReveal>
  );
}

function BatikPattern({ className }: { className?: string }) {
  const patternId = `batik-dots-${useId().replaceAll(":", "")}`;

  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <pattern
          id={patternId}
          x="0"
          y="0"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="20" cy="20" r="1.5" fill="currentColor" />
          <circle cx="0" cy="0" r="0.8" fill="currentColor" />
          <circle cx="40" cy="40" r="0.8" fill="currentColor" />
          <path
            d="M20 8 L24 20 L20 32 L16 20 Z"
            stroke="currentColor"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
