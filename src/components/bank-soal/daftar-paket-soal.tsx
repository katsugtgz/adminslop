import Link from "next/link";

import { KosongDenganTautan } from "@/components/kosong-dengan-tautan";
import { CardHover } from "@/components/motion";
import type { PaketSoal } from "@/db/schema";
import type { MataPelajaran } from "@/db/schema";

/**
 * List of Paket Soal visible in the active tenant. Each row shows the nama,
 * mata pelajaran display name, tahun ajaran, semester, and a drill-down link
 * to the assembly view. The list is read-only here; management actions live
 * in the detail view.
 */
export function DaftarPaketSoal({
  paket,
  mapelMap,
  bolehBuat,
  baseHref,
}: {
  paket: readonly PaketSoal[];
  /** mataPelajaranId -> MataPelajaran display row (for name resolution). */
  mapelMap: ReadonlyMap<string, MataPelajaran>;
  bolehBuat: boolean;
  /** Prefix for the per-row drill-down link (searchParams-based routing). */
  baseHref: string;
}) {
  if (paket.length === 0) {
    return (
      <KosongDenganTautan
        pesan="Belum ada Paket Soal."
        href={bolehBuat ? "#form-paket-soal" : undefined}
        labelTautan={bolehBuat ? "Tambah Paket" : undefined}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {paket.map((p) => {
        const mapel = mapelMap.get(p.mataPelajaranId);
        return (
          <CardHover
            as="li"
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm hover:border-accent/40"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-foreground">
                {p.nama}
              </span>
              <span className="eyebrow text-muted-foreground">
                {mapel ? mapel.nama : "—"}
                {p.semester ? ` · ${p.semester}` : ""}
              </span>
            </div>
            <Link
              href={`${baseHref}&paketId=${p.id}`}
              className="text-xs font-medium text-accent underline-offset-4 hover:underline"
            >
              Rakit / Lihat Butir
            </Link>
          </CardHover>
        );
      })}
    </ul>
  );
}
