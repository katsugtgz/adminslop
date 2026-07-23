import { Button } from "@/components/ui/button";
import {
  isTabelArsip,
  labelTabelArsip,
  TABEL_ARSIP,
} from "@/db/queries/arsip";
import type { RetensiData } from "@/db/schema";

import type { ServerAksi } from "./form-retensi";

/**
 * Retensi Data display + management form. Lists the existing retention policies
 * for the active tenant (tabel, periode bulan, keterangan). When
 * `bolehKelola`, renders one inline form per supported table to set/update its
 * policy (periode bulan + optional keterangan).
 */
export function DaftarRetensi({
  retensi,
  bolehKelola,
  aturRetensiAction,
}: {
  retensi: readonly RetensiData[];
  bolehKelola: boolean;
  aturRetensiAction: ServerAksi;
}) {
  const existing = new Map(retensi.map((r) => [r.tabel, r]));

  return (
    <div className="flex flex-col gap-3">
      {retensi.length === 0 && !bolehKelola && (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Belum ada kebijakan retensi.
        </p>
      )}

      {bolehKelola && (
        <ul className="flex flex-col gap-2">
          {TABEL_ARSIP.map((tabel) => {
            const row = existing.get(tabel);
            return (
              <li
                key={tabel}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{labelTabelArsip(tabel)}</span>
                  {row && (
                    <span className="text-xs text-muted-foreground">
                      Periode saat ini: {row.periodeBulan} bulan
                      {row.keterangan ? ` · ${row.keterangan}` : ""}
                    </span>
                  )}
                </div>
                <form
                  action={aturRetensiAction}
                  className="flex flex-wrap items-end gap-2"
                  aria-label={`Retensi ${tabel}`}
                >
                  <input type="hidden" name="tabel" value={tabel} />
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`periode-${tabel}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Periode (Bulan)
                    </label>
                    <input
                      id={`periode-${tabel}`}
                      name="periodeBulan"
                      type="number"
                      min="1"
                      defaultValue={row?.periodeBulan ?? 84}
                      aria-label="Periode (Bulan)"
                      className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`ket-${tabel}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Keterangan
                    </label>
                    <input
                      id={`ket-${tabel}`}
                      name="keterangan"
                      type="text"
                      defaultValue={row?.keterangan ?? ""}
                      placeholder="opsional"
                      aria-label="Keterangan"
                      className="h-9 w-48 rounded-md border border-input bg-background px-2 text-sm"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    Simpan
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {!bolehKelola && retensi.length > 0 && (
        <ul className="flex flex-col gap-2">
          {retensi.map((r) => {
            const label = isTabelArsip(r.tabel) ? labelTabelArsip(r.tabel) : r.tabel;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
              >
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-xs text-muted-foreground">
                  Periode (Bulan): {r.periodeBulan}
                  {r.keterangan ? ` · ${r.keterangan}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
