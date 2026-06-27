import { Check, Sparkles } from "lucide-react";

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
      <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        Belum ada Tahun Ajaran.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {tahunAjaran.map((ta, idx) => {
        const aktif = ta.aktif;
        return (
          <li
            key={ta.id}
            className={`group relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-warm transition-shadow hover:shadow-warm-lg ${
              aktif
                ? "border-accent ring-2 ring-accent/20"
                : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3 pl-2">
              <span
                aria-hidden="true"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-sm ${
                  aktif
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {aktif ? (
                  <Check className="h-5 w-5" />
                ) : (
                  String(idx + 1).padStart(2, "0")
                )}
              </span>
              <span className="text-base font-semibold text-foreground">
                {ta.nama}
              </span>
              {aktif ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                  <Sparkles
                    className="h-3 w-3"
                    aria-hidden="true"
                  />
                  Aktif
                </span>
              ) : null}
            </div>

            {aktif ? (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Sedang Aktif
              </span>
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
