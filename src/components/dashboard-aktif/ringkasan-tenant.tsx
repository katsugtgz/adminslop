import Link from "next/link";
import { Settings } from "lucide-react";

import { CardHover, PageReveal } from "@/components/motion";

/**
 * Ringkasan status Satuan Pendidikan aktif: tombol Pengaturan Sekolah
 * (hanya untuk peran admin / kepala_sekolah / dev), kartu hitung data contoh
 * hasil kueri tenant-scoped, dan kartu "Segera hadir" untuk modul yang belum
 * diaktifkan.
 *
 * `jumlahCatatan` adalah `null` bila DB tidak dikonfigurasi di lingkungan ini
 * (query diturunkan ke cabang catch di parent).
 */
export function RingkasanTenant({
  bolehAtur,
  jumlahCatatan,
}: {
  bolehAtur: boolean;
  jumlahCatatan: number | null;
}) {
  return (
    <>
      {bolehAtur && (
        <PageReveal delay={2}>
          <Link
            href="/dashboard/pengaturan"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-4 text-sm font-medium shadow-warm transition-colors hover:border-accent/40 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Pengaturan Sekolah
          </Link>
        </PageReveal>
      )}

      <PageReveal delay={3} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CardHover className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm hover:border-accent/40">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            Data contoh (tenant)
          </p>
          <p className="mt-2 font-display text-3xl text-foreground">
            {jumlahCatatan === null ? "—" : jumlahCatatan}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Jumlah catatan yang terisolasi per Satuan Pendidikan.
          </p>
        </CardHover>
        <div className="rounded-2xl border border-dashed border-border bg-accent/[0.03] p-5">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-accent/80">
            Berikutnya
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">
            Modul tambahan
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Arsip, laporan lanjutan, dan modul operasional lainnya akan
            bertahap aktif di dalam Satuan Pendidikan ini.
          </p>
        </div>
      </PageReveal>
    </>
  );
}
