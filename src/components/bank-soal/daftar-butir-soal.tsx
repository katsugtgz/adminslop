import { Archive } from "lucide-react";
import Link from "next/link";

import { KosongDenganTautan } from "@/components/kosong-dengan-tautan";
import { Button } from "@/components/ui/button";
import { CardHover } from "@/components/motion";
import type { ButirSoal } from "@/db/schema";
import type { JenisButirSoal } from "@/db/queries/bank-soal";

import { LABEL_JENIS_BUTIR } from "./jenis-butir";
import type { ServerAksi } from "./form-butir-soal";

const LABEL_STATUS: Record<string, string> = {
  aktif: "Aktif",
  arsip: "Arsip",
};

const BADGE_STATUS: Record<string, string> = {
  aktif: "bg-success/15 text-success",
  arsip: "bg-muted text-muted-foreground",
};

/**
 * List of Butir Soal visible in the active tenant. Each row shows the
 * pertanyaan, jenis (Bahasa label), status badge, and drill-down link to
 * the detail/assemble view. The "Arsipkan" form renders only when
 * `bolehUbah` (visibility only — the action re-checks server-side).
 */
export function DaftarButirSoal({
  butir,
  bolehBuat,
  bolehUbah,
  arsipkanAction,
  baseHref,
}: {
  butir: readonly ButirSoal[];
  bolehBuat: boolean;
  bolehUbah: boolean;
  arsipkanAction: ServerAksi;
  /** Prefix for the per-row drill-down link (searchParams-based routing). */
  baseHref: string;
}) {
  if (butir.length === 0) {
    return (
      <KosongDenganTautan
        pesan="Belum ada Butir Soal."
        href={bolehBuat ? "#form-butir-soal" : undefined}
        labelTautan={bolehBuat ? "Tambah Soal" : undefined}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {butir.map((b) => {
        const jenis = b.jenis as JenisButirSoal;
        return (
          <CardHover
            as="li"
            key={b.id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm hover:border-accent/40"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-foreground">
                  {b.pertanyaan}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {LABEL_JENIS_BUTIR[jenis]}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STATUS[b.status]}`}
                  >
                    {LABEL_STATUS[b.status]}
                  </span>
                  {b.drafAiId ? (
                    <span className="text-xs text-muted-foreground">
                      · Draf AI
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`${baseHref}&butirId=${b.id}`}
                  className="text-xs font-medium text-accent underline-offset-4 hover:underline"
                >
                  Lihat detail
                </Link>
                {bolehUbah ? (
                  <form action={arsipkanAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <Button type="submit" size="sm" variant="outline">
                      <Archive className="h-4 w-4" aria-hidden="true" />
                      Arsipkan
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Kunci: <span className="font-mono">{b.kunciJawaban}</span>
            </div>
          </CardHover>
        );
      })}
    </ul>
  );
}
