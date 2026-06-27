import type { Metadata } from "next";
import Link from "next/link";
import { CircleHelp, LifeBuoy, MessagesSquare } from "lucide-react";

import { CardHover, PageReveal, TextStagger } from "@/components/motion";

export const metadata: Metadata = {
  title: "Bantuan",
  description: "Pusat bantuan EduAdmin Pro Premium.",
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Bagaimana cara memilih Satuan Pendidikan?",
    a: "Setelah masuk, buka Dashboard. Jika Anda memiliki lebih dari satu Keanggotaan Satuan Pendidikan, Anda akan diminta memilih Satuan Pendidikan Aktif. Pilihan ini menentukan ruang data yang dapat Anda kelola; data antar Satuan Pendidikan selalu terisolasi.",
  },
  {
    q: "Bagaimana cara menambah Peserta Didik?",
    a: "Pada dashboard Satuan Pendidikan Aktif, pilih modul Peserta Didik. Admin dan Kepala Sekolah dapat menambah Peserta Didik baru lengkap dengan data Wali, Kontak Darurat, dan mutasi. Guru dan Wali Kelas dapat melihat data sesuai peran masing-masing.",
  },
  {
    q: "Bagaimana cara mencatat nilai?",
    a: "Buka modul Penilaian. Buat Komponen Nilai (misalnya Formatif, Sumatif), kemudian catat Penilaian per Peserta Didik. Nilai Akhir dihitung otomatis dari komponen yang Anda tentukan. Modul Penilaian menerapkan DUAL otorisasi: hanya pemilik data yang dapat mengubah catatan nilai.",
  },
  {
    q: "Bagaimana cara mencetak E-Raport?",
    a: "Pada versi MVP, cetak E-Raport berfokus pada pratinjau cetak (print preview) dengan dukungan kertas A4/F4 lewat media query CSS @page. Tombol cetak memunculkan dialog cetak browser; Anda dapat menyimpan hasil ke PDF atau mencetak langsung.",
  },
  {
    q: "Apa saja batasan MVP?",
    a: "MVP mencakup identitas, tenancy multi-Satuan Pendidikan, data Pokok, Penilaian, Permintaan AI dengan verifikasi, serta dasar E-Raport. Fitur lanjutan seperti portal wali murid, otomasi WhatsApp/email, tanda tangan digital legal, editor WYSIWYG untuk rapor, dashboard lintas Satuan Pendidikan, kolaborasi real-time, dan analitik lanjutan TIDAK termasuk MVP. Lihat docs/POST-MVP.md untuk detail.",
  },
];

export default function BantuanPage() {
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
            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
            Bantuan
          </p>

          <TextStagger
            as="h1"
            className="mt-6 font-display text-[2.75rem] leading-[0.95] tracking-tight text-foreground sm:text-7xl md:text-8xl"
            lines={["Pusat Bantuan"]}
          />

          <p className="mt-8 max-w-2xl text-pretty text-lg text-muted-foreground sm:text-xl md:text-2xl">
            Pertanyaan yang sering diajukan tentang penggunaan EduAdmin Pro
            Premium. Untuk panduan langkah demi langkah, lihat juga{" "}
            <Link
              href="/panduan"
              className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Panduan Penggunaan
            </Link>
            .
          </p>
        </div>
      </PageReveal>

      {/* ════════════════════════════════════════════════════════
          FAQ — editorial card grid
         ════════════════════════════════════════════════════════ */}
      <section aria-labelledby="faq-judul" className="flex flex-col gap-8">
        <PageReveal className="flex flex-col gap-3" delay={2}>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            <MessagesSquare
              className="mr-2 inline h-3.5 w-3.5"
              aria-hidden="true"
            />
            02 — FAQ
          </p>
          <h2
            id="faq-judul"
            className="font-display text-3xl tracking-tight text-foreground sm:text-4xl md:text-5xl"
          >
            Pertanyaan yang sering diajukan
          </h2>
        </PageReveal>

        <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
          {FAQ.map((item, idx) => {
            const featured = idx === FAQ.length - 1;
            return (
              <li
                key={item.q}
                className={`list-none ${featured ? "sm:col-span-2" : ""}`}
              >
                <CardHover className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-warm hover:border-accent/40 hover:shadow-warm-lg">
                  <div className="flex items-start justify-between gap-4">
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
                    >
                      <CircleHelp className="h-5 w-5" />
                    </span>
                    <span
                      aria-hidden="true"
                      className="font-mono text-xs font-medium text-muted-foreground/60 transition-colors group-hover:text-accent"
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg tracking-tight text-foreground sm:text-xl">
                    {item.q}
                  </h3>
                  <p className="mt-2 text-pretty text-sm text-muted-foreground sm:text-base">
                    {item.a}
                  </p>
                </CardHover>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ════════════════════════════════════════════════════════
          KONTAK — editorial contact aside
         ════════════════════════════════════════════════════════ */}
      <PageReveal
        as="section"
        delay={3}
        aria-labelledby="bantuan-kontak-judul"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-muted/40"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 select-none font-display text-[10rem] leading-none tracking-tighter text-foreground/[0.04] sm:text-[14rem]"
        >
          03
        </span>
        <div className="relative flex flex-col gap-4 px-6 py-10 sm:px-10 md:px-12">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-warm"
          >
            <LifeBuoy className="h-5 w-5" />
          </span>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            03 — Kontak
          </p>
          <h2
            id="bantuan-kontak-judul"
            className="font-display text-2xl tracking-tight text-foreground sm:text-3xl md:text-4xl"
          >
            Masih butuh bantuan?
          </h2>
          <p className="max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Hubungi Admin Satuan Pendidikan Anda. Admin dapat mengelola
            Keanggotaan dan Izin melalui modul Manajemen Akses.
          </p>
        </div>
      </PageReveal>
    </div>
  );
}
