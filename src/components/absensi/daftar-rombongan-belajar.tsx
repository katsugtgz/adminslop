import Link from "next/link";

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
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Rombongan Belajar.
      </p>
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
          <li
            key={r.id}
            aria-current={selected ? "true" : undefined}
            className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm aria-[current=true]:ring-2 aria-[current=true]:ring-primary"
          >
            <Link
              href={`/dashboard/absensi?rombonganBelajarId=${encodeURIComponent(
                r.id
              )}${tanggalQuery}`}
              className="flex items-center justify-between text-sm font-semibold hover:text-primary"
            >
              <span>{r.nama}</span>
              {selected && (
                <span
                  aria-hidden="true"
                  className="text-xs font-normal text-primary"
                >
                  Terpilih
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
