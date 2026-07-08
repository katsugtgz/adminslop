import Link from "next/link";
import {
  ArrowUpRight,
  BookText,
  Compass,
  GraduationCap,
  LayoutGrid,
  QrCode,
  ShieldCheck,
  Users,
} from "lucide-react";

import { KepalaBeranda } from "@/components/beranda/kepala-beranda";
import { CardHover, PageReveal } from "@/components/motion";
import { Button } from "@/components/ui/button";

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
    nama: "Peserta Didik",
    deskripsi:
      "Peserta Didik, Rombongan Belajar, dan mutasi. Kelola data demografi Peserta Didik secara terpusat.",
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
    deskripsi: "Absensi Peserta Didik lewat pemindaian QR.",
    ikon: QrCode,
  },
];

export default function BerandaPage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-10">
      <KepalaBeranda />

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
            <span className="eyebrow text-muted-foreground">
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
            <p className="eyebrow-accent">
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
          <p className="flex items-start gap-2">
            <GraduationCap
              className="mt-0.5 h-4 w-4 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span>Dibuat untuk Guru dan Satuan Pendidikan di Indonesia.</span>
          </p>
          <p className="flex items-start gap-2">
            <BookText
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              Lihat{" "}
              <Link
                href="/panduan"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                panduan penggunaan
              </Link>{" "}
              untuk selengkapnya.
            </span>
          </p>
        </div>
      </PageReveal>
    </div>
  );
}
