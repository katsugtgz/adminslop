import Link from "next/link";
import { ArrowRight, Compass, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

const MVP_MODULES: { nama: string; deskripsi: string }[] = [
  { nama: "Profil Saya", deskripsi: "Data pengguna dan kepegawaian Anda." },
  {
    nama: "Pengaturan Sekolah",
    deskripsi: "Identitas dan konfigurasi Satuan Pendidikan.",
  },
  {
    nama: "Data Siswa",
    deskripsi: "Peserta Didik, Rombongan Belajar, dan mutasi.",
  },
  {
    nama: "Input Nilai & E-Raport",
    deskripsi: "Penilaian, Nilai Akhir, dan cetak E-Raport.",
  },
  { nama: "Bank Soal", deskripsi: "Bank soal dengan komposisi dan taksonomi." },
  {
    nama: "Perangkat Ajar",
    deskripsi: "Modul Ajar, ATP, dan bahan ajar terpadu.",
  },
  { nama: "Absensi QR", deskripsi: "Absensi peserta didik lewat pemindaian QR." },
];

export default function BerandaPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">
          Selamat datang di
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          EduAdmin Pro Premium
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Satu produk untuk mengelola administrasi Satuan Pendidikan Anda:
          Peserta Didik, Nilai, E-Raport, Bank Soal, Perangkat Ajar, hingga
          Absensi QR.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Masuk ke Dashboard
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/panduan">
              <Compass aria-hidden="true" />
              Tur Awal
            </Link>
          </Button>
        </div>
      </section>

      <section
        aria-labelledby="tur-awal-judul"
        className="rounded-xl border border-border bg-muted/40 p-6"
      >
        <div className="flex items-start gap-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Compass className="h-5 w-5" />
          </span>
          <div>
            <h2
              id="tur-awal-judul"
              className="text-lg font-semibold tracking-tight"
            >
              Tur Awal
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Belum pernah memakai EduAdmin Pro Premium? Ikuti tur singkat untuk
              mengenali alur utama sebelum mulai mencatat data Satuan
              Pendidikan.
            </p>
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link href="/panduan">
                Lihat Panduan Penggunaan
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="modul-judul" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2
            id="modul-judul"
            className="text-lg font-semibold tracking-tight"
          >
            Modul
          </h2>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Segera hadir
          </span>
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MVP_MODULES.map((modul) => (
            <li
              key={modul.nama}
              className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm"
            >
              <h3 className="text-base font-semibold">{modul.nama}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {modul.deskripsi}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
