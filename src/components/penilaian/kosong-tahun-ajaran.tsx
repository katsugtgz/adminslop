import Link from "next/link";

import { PageReveal } from "@/components/motion";

/**
 * Empty-state Manajemen Penilaian saat belum ada Tahun Ajaran Aktif atau
 * Semester Aktif. Menampilkan header modul (02 — Penilaian) dan ajakan
 * mengaktifkan Tahun Ajaran sebelum pekerjaan grading dapat dimulai.
 *
 * Tidak ada data tenant yang dimuat ketika kondisi ini terjadi (identity doc
 * §12 — PembatasanAkses sudah ditangani di parent; di sini hanya masalah
 * periode belum disiapkan).
 */
export function KosongTahunAjaran({
  orgName,
  roleSlug,
}: {
  orgName: string;
  roleSlug: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageReveal
        as="header"
        className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
          02 — Penilaian
        </p>
        <h1 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
          Penilaian
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {orgName} · Peran Anda:{" "}
          {roleSlug}
        </p>
      </PageReveal>
      <PageReveal delay={2}>
        <p className="rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] p-6 text-center text-sm text-muted-foreground">
          Aktifkan Tahun Ajaran terlebih dahulu.{" "}
          <Link
            href="/dashboard/tahun-ajaran"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Buka Pengaturan Tahun Ajaran
          </Link>
        </p>
      </PageReveal>
    </div>
  );
}
