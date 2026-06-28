import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Satu kartu nav-link modul pada dashboard Satuan Pendidikan aktif. Setiap
 * modul (Sinkronisasi, Cetak, Absensi, dst.) memakai struktur visual yang
 * sama; komponen ini menjaga konsistensi sambil menerima ikon/judul/deskripsi/
 * tujuan/label tombol yang spesifik per modul.
 *
 * Parent menahan render (`{boleh && <KartuModul ... />}`) berdasarkan izin
 * reachability; halaman tujuan tetap memeriksa `boleh(<izin>)` server-side
 * (identity doc §12).
 */
export function KartuModul({
  icon: Ikon,
  judul,
  deskripsi,
  href,
  labelTombol,
}: {
  icon: LucideIcon;
  judul: string;
  deskripsi: string;
  href: string;
  labelTombol: string;
}) {
  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
          aria-hidden="true"
        >
          <Ikon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium">{judul}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{deskripsi}</p>
        </div>
      </div>
      <Button asChild variant="outline">
        <Link href={href}>{labelTombol}</Link>
      </Button>
    </div>
  );
}
