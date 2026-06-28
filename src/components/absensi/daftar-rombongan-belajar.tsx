import Link from "next/link";
import { QrCode } from "lucide-react";

import { CardHover } from "@/components/motion";
import { KosongDenganTautan } from "@/components/kosong-dengan-tautan";
import type { RombonganBelajar } from "@/db/schema";

/**
 * Drill-down list of Rombongan Belajar (classes / homerooms) in the active
 * Satuan Pendidikan for the active Tahun Ajaran. The page renders this BEFORE
 * a (rombonganBelajarId, tanggal) is selected; clicking one carries the id
 * into the search params via a plain `<Link>` (no client JS).
 *
 * `selectedId` highlights the active rombel (aria-current). `tanggal` is
 * carried along so the link keeps the active tanggal context (the page
 * fallback defaults to today when absent).
 */
export function DaftarRombonganBelajarAbsensi({
  rombonganBelajar,
  selectedId,
  tanggal,
}: {
  rombonganBelajar: readonly RombonganBelajar[];
  selectedId?: string;
  tanggal?: string;
}) {
  if (rombonganBelajar.length === 0) {
    return (
      <KosongDenganTautan
        pesan="Belum ada Rombongan Belajar."
        href="/dashboard/rombongan-belajar"
        labelTautan="Buat Rombongan Belajar"
      />
    );
  }

  const tanggalQuery = tanggal
    ? `&tanggal=${encodeURIComponent(tanggal)}`
    : "";

  return (
    <ul className="flex flex-col gap-2">
      {rombonganBelajar.map((r) => {
        const selected = r.id === selectedId;
        return (
          <CardHover
            as="li"
            key={r.id}
            aria-current={selected ? "true" : undefined}
            className="bg-grain rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-warm hover:border-accent/40 aria-[current=true]:border-accent/50 aria-[current=true]:ring-2 aria-[current=true]:ring-accent"
          >
            <Link
              href={`/dashboard/absensi?rombonganBelajarId=${encodeURIComponent(
                r.id
              )}${tanggalQuery}`}
              className="flex items-center justify-between gap-3 text-sm font-semibold text-foreground hover:text-accent"
            >
              <span className="flex items-center gap-2.5">
                <QrCode className="h-4 w-4 text-accent" aria-hidden="true" />
                {r.nama}
              </span>
              {selected && (
                <span
                  aria-hidden="true"
                  className="font-mono text-[11px] font-normal uppercase tracking-[0.16em] text-accent"
                >
                  Terpilih
                </span>
              )}
            </Link>
          </CardHover>
        );
      })}
    </ul>
  );
}
