import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Compass,
  LogIn,
  School,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardHover, PageReveal, TextStagger } from "@/components/motion";

export const metadata: Metadata = {
  title: "Panduan Penggunaan",
  description:
    "Panduan Penggunaan dan Tur Awal untuk EduAdmin Pro Premium dalam Bahasa Indonesia.",
};

const LANGKAH: {
  judul: string;
  ikon: React.ComponentType<{ className?: string }>;
}[] = [
  { judul: "Pengguna masuk dengan akun yang terdaftar.", ikon: LogIn },
  { judul: "Pengguna memilih Satuan Pendidikan Aktif.", ikon: School },
  { judul: "Pengguna mulai mengelola Peserta Didik dan Nilai.", ikon: Users },
];

export default function PanduanPage() {
  return (
    <div className="flex flex-col gap-16 md:gap-24">
      {/* ════════════════════════════════════════════════════════
          HERO — editorial spread with oversized index number
         ════════════════════════════════════════════════════════ */}
      <PageReveal
        as="section"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-32 h-[28rem] w-[28rem] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.16 42 / 0.55) 0%, transparent 65%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.5 0.18 305 / 0.35) 0%, transparent 70%)",
          }}
        />

        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-2 select-none font-display text-[12rem] leading-none tracking-tighter text-foreground/[0.03] sm:text-[16rem] md:right-10 md:text-[20rem]"
        >
          01
        </span>

        <div className="relative px-6 py-14 sm:px-10 sm:py-20 md:px-16 md:py-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Tur Awal
          </p>

          <TextStagger
            as="h1"
            className="mt-6 font-display text-[2.75rem] leading-[0.95] tracking-tight text-foreground sm:text-7xl md:text-8xl"
            lines={["Panduan Penggunaan"]}
          />

          <p className="mt-8 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl md:text-2xl">
            Halaman ini akan menjadi titik masuk <strong>Tur Awal</strong> dan
            <strong> Bantuan Kontekstual</strong> bagi Pengguna baru. Konten
            lengkap akan ditambahkan ketika modul mulai aktif.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="group h-12 px-6 text-base">
              <Link href="/">
                Kembali ke Beranda
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
              <Link href="/bantuan">
                <Compass aria-hidden="true" />
                Pusat Bantuan
              </Link>
            </Button>
          </div>
        </div>
      </PageReveal>

      {/* ════════════════════════════════════════════════════════
          LANGKAH BERIKUTNYA — numbered editorial step cards
         ════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="langkah-judul"
        className="flex flex-col gap-8"
      >
        <PageReveal className="flex flex-col gap-3" delay={2}>
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-warm"
          >
            <Compass className="h-5 w-5" />
          </span>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            02 — Onboarding
          </p>
          <h2
            id="langkah-judul"
            className="font-display text-3xl tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            Langkah berikutnya
          </h2>
        </PageReveal>

        <ol className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {LANGKAH.map((step, idx) => {
            const Icon = step.ikon;
            return (
              <li key={step.judul} className="list-none">
                <CardHover className="group relative flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-warm hover:border-accent/40 hover:shadow-warm-lg">
                  <div className="flex items-start justify-between gap-4">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span
                      aria-hidden="true"
                      className="font-display text-4xl leading-none tracking-tighter text-foreground/[0.08] transition-colors group-hover:text-accent/40"
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="mt-auto pt-4 text-pretty text-muted-foreground sm:text-lg">
                    {step.judul}
                  </p>
                </CardHover>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ════════════════════════════════════════════════════════
          FOOTER NOTE
         ════════════════════════════════════════════════════════ */}
      <PageReveal
        as="aside"
        delay={4}
        aria-label="Catatan kaki"
        className="border-t border-border pt-10"
      >
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
          Butuh jawaban atas pertanyaan?{" "}
          <Link
            href="/bantuan"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Buka Pusat Bantuan
          </Link>
          <ArrowUpRight
            aria-hidden="true"
            className="h-4 w-4 text-muted-foreground/60"
          />
        </p>
      </PageReveal>
    </div>
  );
}
