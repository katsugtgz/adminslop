import { Button } from "@/components/ui/button";
import { TIPE_NOTIFIKASI, type TipeNotifikasi } from "@/db/queries/notifikasi";
import type { PreferensiNotifikasi } from "@/db/schema";

import type { ServerAksi } from "@/components/akses/form-ptk-baru";

/** Bahasa label for a `tipe` value (mirrors daftar-notifikasi). */
function labelTipe(tipe: TipeNotifikasi): string {
  switch (tipe) {
    case "tugas_nilai":
      return "Tugas Nilai";
    case "tugas_absensi":
      return "Tugas Absensi";
    case "tugas_eraport":
      return "Tugas E-Raport";
    case "umum":
      return "Umum";
  }
}

/**
 * Kontrol Preferensi Notifikasi — self-service per-tipe on/off toggles. One
 * server form per `tipe`; the `aktif` checkbox reflects the explicit
 * preference row, or defaults to CHECKED when no row exists (missing = aktif).
 * Submitting posts `(tipe, aktif)` to `aturPreferensiAction`; the action reads
 * `penggunaId` from `akses`, never formData (AC#5).
 */
export function KontrolPreferensi({
  preferensi,
  aturPreferensiAction,
}: {
  preferensi: readonly PreferensiNotifikasi[];
  aturPreferensiAction: ServerAksi;
}) {
  const prefByTipe = new Map(preferensi.map((p) => [p.tipe, p.aktif]));

  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <legend className="px-1 text-sm font-semibold">
        Preferensi Notifikasi
      </legend>
      <p className="text-xs text-muted-foreground">
        Matikan tipe yang tidak ingin Anda lihat di daftar Notifikasi.
      </p>
      {TIPE_NOTIFIKASI.map((tipe) => {
        // missing row = aktif (default on)
        const hasRow = prefByTipe.has(tipe);
        const aktif = hasRow ? (prefByTipe.get(tipe) ?? true) : true;
        return (
          <form
            key={tipe}
            action={aturPreferensiAction}
            className="flex items-center justify-between gap-2"
            aria-label={`Preferensi ${tipe}`}
          >
            <input type="hidden" name="tipe" value={tipe} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="aktif"
                defaultChecked={aktif}
                aria-label={`preferensi-${tipe}`}
                className="h-4 w-4 rounded border-input"
              />
              <span>{labelTipe(tipe)}</span>
              <span className="text-xs text-muted-foreground">
                {aktif ? "Aktif" : "Nonaktif"}
              </span>
            </label>
            <Button type="submit" size="sm" variant="ghost">
              Simpan
            </Button>
          </form>
        );
      })}
    </fieldset>
  );
}
