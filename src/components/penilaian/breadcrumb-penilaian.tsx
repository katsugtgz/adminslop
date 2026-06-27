import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageReveal } from "@/components/motion";
import type { KomponenNilai, Penilaian } from "@/db/schema";

import type { BarisBeban } from "./lookup";

/**
 * Breadcrumb drill-down Manajemen Penilaian. Menampilkan jalur bertingkat
 * sesuai progressive disclosure via `searchParams`:
 *   Penilaian > Beban > Komponen > Penilaian terpilih
 *
 * Tampil ketika minimal satu level terpilih (parent mengatur kondisi via
 * `tampilkanBreadcrumb`). `bebanId` hanya dipakai saat `komponenTerpilih`
 * sudah pasti ada — konsisten dengan urutan drill-down.
 */
export function BreadcrumbPenilaian({
  bebanTerpilih,
  komponenTerpilih,
  penilaianTerpilih,
  bebanId,
  isAdmin,
}: {
  bebanTerpilih: BarisBeban | undefined;
  komponenTerpilih: KomponenNilai | undefined;
  penilaianTerpilih: Penilaian | undefined;
  bebanId: string | undefined;
  isAdmin: boolean;
}) {
  return (
    <PageReveal delay={2}>
      <nav
        aria-label="breadcrumb"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground shadow-warm"
      >
        <Link
          href="/dashboard/penilaian"
          className="font-medium text-foreground underline-offset-4 hover:text-accent hover:underline"
        >
          Penilaian
        </Link>
        {bebanTerpilih && (
          <>
            <ChevronRight className="h-4 w-4 text-accent/60" aria-hidden="true" />
            <Link
              href={`/dashboard/penilaian?bebanId=${encodeURIComponent(bebanTerpilih.id)}`}
              className="underline-offset-4 hover:text-accent hover:underline"
            >
              {isAdmin
                ? `${bebanTerpilih.ptkNama} · ${bebanTerpilih.mataPelajaranNama}`
                : bebanTerpilih.mataPelajaranNama}
            </Link>
          </>
        )}
        {komponenTerpilih && (
          <>
            <ChevronRight className="h-4 w-4 text-accent/60" aria-hidden="true" />
            <Link
              href={`/dashboard/penilaian?bebanId=${encodeURIComponent(bebanId!)}&komponenId=${encodeURIComponent(komponenTerpilih.id)}`}
              className="underline-offset-4 hover:text-accent hover:underline"
            >
              {komponenTerpilih.nama}
            </Link>
          </>
        )}
        {penilaianTerpilih && (
          <>
            <ChevronRight className="h-4 w-4 text-accent/60" aria-hidden="true" />
            <span
              className="font-medium text-accent"
              aria-current="page"
            >
              {penilaianTerpilih.nama}
            </span>
          </>
        )}
      </nav>
    </PageReveal>
  );
}
