import { Button } from "@/components/ui/button";
import type { TahunAjaran } from "@/db/schema";

import type { ServerAksi } from "./form-tahun-ajaran-baru";

/**
 * Read-only or manageable list of Tahun Ajaran in the active Satuan Pendidikan.
 *
 * When `bolehKelola` is true each non-active row renders its own server form
 * posting to `aktifkanTahunAjaranAction` with the row id as a hidden field.
 * The active row shows "Sedang Aktif" (no button — at most one aktif per
 * tenant, schema partial unique index). When false (kepala_sekolah), no forms
 * render — the list is purely informational.
 */
export function DaftarTahunAjaran({
  tahunAjaran,
  bolehKelola,
  action,
}: {
  tahunAjaran: readonly TahunAjaran[];
  bolehKelola: boolean;
  action: ServerAksi;
}) {
  if (tahunAjaran.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Tahun Ajaran.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tahunAjaran.map((ta) => {
        const aktif = ta.aktif;
        return (
          <li
            key={ta.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold">{ta.nama}</span>
              {aktif ? (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Aktif
                </span>
              ) : null}
            </div>

            {aktif ? (
              <span className="text-xs text-muted-foreground">Sedang Aktif</span>
            ) : bolehKelola ? (
              <form action={action}>
                <input type="hidden" name="id" value={ta.id} />
                <Button type="submit" size="sm">
                  Aktifkan
                </Button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
