import type { PerangkatAjar } from "@/db/schema";
import type { StatusDokumenAi } from "@/db/queries/perangkat-ajar";

import { CardHover } from "@/components/motion";
import { KontrolVerifikasiAi } from "./kontrol-verifikasi-ai";
import { LABEL_JENIS, type ServerAksi } from "./form-perangkat-ajar";

/**
 * Daftar Perangkat Ajar — AC#4 per-jenis list. Each row shows its Bahasa Jenis
 * label, judul, Mata Pelajaran id, and (when AI-assisted) the inline
 * {@linkcode KontrolVerifikasiAi} gate. Action surface is gated by the caller's
 * `bolehUbah` (visibility only — the actions re-check server-side, §12).
 */
export function DaftarPerangkatAjar({
  daftar,
  bolehUbah,
  verifikasiAction,
}: {
  daftar: readonly PerangkatAjar[];
  bolehUbah: boolean;
  verifikasiAction: ServerAksi;
}) {
  if (daftar.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Belum ada Perangkat Ajar.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {daftar.map((p) => (
        <CardHover
          as="li"
          key={p.id}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm hover:border-accent/40"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">{p.judul}</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {LABEL_JENIS[p.jenis as keyof typeof LABEL_JENIS]} · Mata
                Pelajaran {p.mataPelajaranId.slice(0, 8)}
              </span>
            </span>
          </div>

          {p.statusDokumenAi !== null ? (
            <KontrolVerifikasiAi
              statusDokumenAi={p.statusDokumenAi as StatusDokumenAi}
              bolehUbah={bolehUbah}
              perangkatAjarId={p.id}
              action={verifikasiAction}
            />
          ) : null}
        </CardHover>
      ))}
    </ul>
  );
}
