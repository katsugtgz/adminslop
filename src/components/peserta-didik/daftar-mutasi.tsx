import type { MutasiPesertaDidik } from "@/db/schema";

/** Bahasa label for a mutasi arah slug (masuk|keluar). */
function labelArah(arah: string): string {
  return arah === "masuk" ? "Masuk" : arah === "keluar" ? "Keluar" : arah;
}

/**
 * List of transfer (mutasi) records for a Peserta Didik. Always visible — it is
 * historical audit data. The records are ordered by `tanggal` DESC then
 * `dibuatPada` DESC (most recent first) by the query.
 */
export function DaftarMutasi({
  mutasi,
}: {
  mutasi: readonly MutasiPesertaDidik[];
}) {
  if (mutasi.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Mutasi.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {mutasi.map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {labelArah(row.arah)}
            </span>
            <span className="text-xs text-muted-foreground">
              Tanggal: {row.tanggal}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-sm">
            {row.asalSekolah && (
              <span className="text-muted-foreground">
                Asal Sekolah: {row.asalSekolah}
              </span>
            )}
            {row.tujuanSekolah && (
              <span className="text-muted-foreground">
                Tujuan Sekolah: {row.tujuanSekolah}
              </span>
            )}
            {row.alasan && <span className="text-foreground">{row.alasan}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
