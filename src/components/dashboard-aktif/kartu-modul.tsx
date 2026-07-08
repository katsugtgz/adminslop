import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TampilanKartuModul = "utama" | "standar" | "ringkas";

const GAYA_KARTU: Record<TampilanKartuModul, string> = {
  utama: "p-5 md:p-6 lg:col-span-2",
  standar: "p-4 md:p-5",
  ringkas: "p-4",
};

const GAYA_IKON: Record<TampilanKartuModul, string> = {
  utama: "h-11 w-11 rounded-xl",
  standar: "h-9 w-9 rounded-lg",
  ringkas: "h-8 w-8 rounded-lg",
};

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
  tampilan = "standar",
}: {
  icon: LucideIcon;
  judul: string;
  deskripsi: string;
  href: string;
  labelTombol: string;
  tampilan?: TampilanKartuModul;
}) {
  return (
    <div
      className={cn(
        "group flex h-full flex-col justify-between gap-4 rounded-2xl border border-border bg-card text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg t-lift",
        GAYA_KARTU[tampilan]
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground",
            GAYA_IKON[tampilan]
          )}
          aria-hidden="true"
        >
          <Ikon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium">{judul}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{deskripsi}</p>
        </div>
      </div>
      <Button asChild variant="outline" className="w-full justify-center sm:w-fit">
        <Link href={href}>{labelTombol}</Link>
      </Button>
    </div>
  );
}
