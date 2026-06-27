import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookText,
  Compass,
  GraduationCap,
  LayoutGrid,
  QrCode,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardHover, PageReveal, TextStagger } from "@/components/motion";

type Modul = {
  nama: string;
  deskripsi: string;
  ikon: React.ComponentType<{ className?: string }>;
  featured?: boolean;
};

const MVP_MODULES: Modul[] = [
  {
    nama: "Profil Saya",
    deskripsi: "Data pengguna dan kepegawaian Anda.",
    ikon: GraduationCap,
  },
  {
    nama: "Pengaturan Sekolah",
    deskripsi: "Identitas dan konfigurasi Satuan Pendidikan.",
    ikon: ShieldCheck,
  },
  {
    nama: "Data Siswa",
    deskripsi:
      "Peserta Didik, Rombongan Belajar, dan mutasi. Kelola data demografi peserta didik secara terpusat.",
    ikon: Users,
    featured: true,
  },
  {
    nama: "Input Nilai & E-Raport",
    deskripsi: "Penilaian, Nilai Akhir, dan cetak E-Raport.",
    ikon: BookText,
  },
  {
    nama: "Bank Soal",
    deskripsi: "Bank soal dengan komposisi dan taksonomi.",
    ikon: LayoutGrid,
  },
  {
    nama: "Perangkat Ajar",
    deskripsi: "Modul Ajar, ATP, dan bahan ajar terpadu.",
    ikon: Compass,
  },
  {
    nama: "Absensi QR",
    deskripsi: "Absensi peserta didik lewat pemindaian QR.",
    ikon: QrCode,
  },
];

/** Hoisted to module scope to satisfy react-doctor/`jsx-no-jsx-as-prop`. */
const HEADLINE_JUDUL: React.ReactNode = (
  <>
    EduAdmin Pro{" "}
    <span className="text-gradient-warm">Premium</span>
    <span className="text-accent">.</span>
  </>
);

export default function BerandaPage() {
  return (
    <div className="flex flex-col gap-16 md:gap-24">
      {/* ════════════════════════════════════════════════════════
          HERO — editorial spread with oversized index number
         ════════════════════════════════════════════════════════ */}
      <PageReveal
        as="section"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card"
      >
        <BatikPattern className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]" />

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
          className="pointer-events-none absolute -top-4 right-0 select-none font-display text-[12rem] leading-none tracking-tighter text-foreground/[0.04] sm:text-[15rem] md:-top-8 md:right-4 md:text-[18rem]"
        >
          01
        </span>

        <div className="relative px-6 py-14 sm:px-10 sm:py-20 md:px-16 md:py-28">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Selamat datang di
          </p>

          <TextStagger
            as="h1"
            className="mt-6 font-display text-[2.75rem] leading-[0.95] tracking-tight text-foreground sm:text-7xl md:text-8xl"
            lines={HEADLINE_JUDUL}
          />

          <p className="mt-8 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl md:text-2xl">
            Satu produk untuk mengelola administrasi Satuan Pendidikan Anda:
            Peserta Didik, Nilai, E-Raport, Bank Soal, Perangkat Ajar, hingga
            Absensi QR.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
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

          <dl className="mt-16 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/40">
            {[
              { label: "Modul MVP", value: "7" },
              { label: "Bahasa", value: "Indonesia" },
              { label: "Multi-tenant", value: "WorkOS" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-card/80 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-5"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">
                  {stat.label}
                </dt>
                <dd className="mt-1 font-display text-xl text-foreground sm:text-3xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </PageReveal>

      {/* ════════════════════════════════════════════════════════
          TUR AWAL — editorial spread with marker
         ════════════════════════════════════════════════════════ */}
      <PageReveal as="section" delay={2} className="relative">
        <div className="grid grid-cols-1 gap-8 border-l-2 border-accent/40 pl-6 md:grid-cols-[12rem_1fr] md:gap-12 md:border-l-0 md:pl-0">
          <div className="flex flex-col gap-3">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-warm"
            >
              <Compass className="h-5 w-5" />
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              02 — Onboarding
            </span>
          </div>

          <div>
            <h2
              id="tur-awal-judul"
              className="font-display text-3xl tracking-tight text-foreground sm:text-4xl md:text-5xl"
            >
              Tur Awal
            </h2>
            <p className="mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
              Belum pernah memakai EduAdmin Pro Premium? Ikuti tur singkat untuk
              mengenali alur utama sebelum mulai mencatat data Satuan
              Pendidikan.
            </p>
            <Button
              asChild
              variant="link"
              className="mt-4 h-auto gap-1 p-0 text-base text-accent"
            >
              <Link href="/panduan">
                Lihat Panduan Penggunaan
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </PageReveal>

      {/* ════════════════════════════════════════════════════════
          MODUL — bento grid (featured + standard)
         ════════════════════════════════════════════════════════ */}
      <section aria-labelledby="modul-judul" className="flex flex-col gap-8">
        <PageReveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
              <LayoutGrid
                className="mr-2 inline h-3.5 w-3.5"
                aria-hidden="true"
              />
              03 — Modul MVP
            </p>
            <h2
              id="modul-judul"
              className="mt-3 font-display text-4xl tracking-tight text-foreground sm:text-5xl md:text-6xl"
            >
              Modul
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Segera hadir
          </span>
        </PageReveal>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MVP_MODULES.map((modul, idx) => {
            const Icon = modul.ikon;
            return (
              <li
                key={modul.nama}
                className={modul.featured ? "sm:col-span-2 lg:row-span-2" : ""}
              >
                <CardHover
                  className={`group relative flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-warm hover:border-accent/40 hover:shadow-warm-lg ${
                    modul.featured ? "lg:min-h-[20rem]" : ""
                  }`}
                >
                  <Link
                    href="/dashboard"
                    aria-label={`Buka ${modul.nama}`}
                    className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                  </Link>

                  <div className="flex items-start justify-between gap-4">
                    <span
                      aria-hidden="true"
                      className={`flex items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground ${
                        modul.featured ? "h-12 w-12" : "h-10 w-10"
                      }`}
                    >
                      <Icon className={modul.featured ? "h-6 w-6" : "h-5 w-5"} />
                    </span>
                    <span
                      aria-hidden="true"
                      className="font-mono text-xs font-medium text-muted-foreground/60 transition-colors group-hover:text-accent"
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <h3
                    className={`mt-auto font-display tracking-tight text-foreground ${
                      modul.featured ? "pt-8 text-2xl sm:text-3xl" : "pt-4 text-lg"
                    }`}
                  >
                    {modul.nama}
                  </h3>
                  <p
                    className={`mt-1 text-muted-foreground ${
                      modul.featured ? "text-base sm:text-lg" : "text-sm"
                    }`}
                  >
                    {modul.deskripsi}
                  </p>

                  <ArrowUpRight
                    aria-hidden="true"
                    className="mt-4 h-4 w-4 self-end text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent"
                  />
                </CardHover>
              </li>
            );
          })}
        </ul>
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
        <div className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-accent" aria-hidden="true" />
            Dibuat untuk Guru dan Satuan Pendidikan di Indonesia.
          </p>
          <p className="inline-flex items-center gap-2">
            <BookText className="h-4 w-4" aria-hidden="true" />
            Lihat{" "}
            <Link
              href="/panduan"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              panduan penggunaan
            </Link>{" "}
            untuk selengkapnya.
          </p>
        </div>
      </PageReveal>
    </div>
  );
}

function BatikPattern({ className }: { className?: string }) {
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
          id="batik-dots"
          x="0"
          y="0"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="20" cy="20" r="1.5" fill="currentColor" />
          <circle cx="0" cy="0" r="0.8" fill="currentColor" />
          <circle cx="40" cy="40" r="0.8" fill="currentColor" />
          <path d="M20 8 L24 20 L20 32 L16 20 Z" stroke="currentColor" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#batik-dots)" />
    </svg>
  );
}
