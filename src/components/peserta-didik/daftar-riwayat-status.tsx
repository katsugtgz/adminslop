import type { RiwayatStatusPesertaDidik } from "@/db/schema";

/** Bahasa label for a status slug (aktif|pindah|lulus|keluar). */
function labelStatus(status: string): string {
  switch (status) {
    case "aktif":
      return "Aktif";
    case "pindah":
      return "Pindah";
    case "lulus":
      return "Lulus";
    case "keluar":
      return "Keluar";
    default:
      return status;
  }
}

/**
 * Append-only status history for a Peserta Didik (audit trail). ALWAYS visible —
 * even read-only viewers (guru / wali_kelas / kepala_sekolah) see the history;
 * it is audit data, not editable biodata. Entries render oldest-first (the
 * query orders by `dibuatPada` ascending).
 */
export function DaftarRiwayatStatus({
  riwayat,
}: {
  riwayat: readonly RiwayatStatusPesertaDidik[];
}) {
  if (riwayat.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Riwayat Status.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {riwayat.map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {labelStatus(row.status)}
            </span>
            <span className="text-xs text-muted-foreground">
              {row.dibuatPada instanceof Date
                ? row.dibuatPada.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
                : row.dibuatPada}
            </span>
          </div>
          {row.catatan && (
            <span className="text-sm text-foreground">{row.catatan}</span>
          )}
          {row.dibuatOleh && (
            <span className="text-xs text-muted-foreground">
              oleh: {row.dibuatOleh}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
