import type { NilaiAkhirPesertaDidik } from "@/db/queries/nilai-peserta-didik";

/**
 * AC#3 — Nilai Akhir derivation display. Nilai Akhir is PURELY DERIVED (never
 * stored — see `getNilaiAkhir`). This table shows, per student who has any
 * nilai row under the Beban Mengajar:
 *   - their resolved display name (from `pesertaNama`);
 *   - the derived `nilaiAkhir` = Σ(component_avg × bobot) / Σ(bobot);
 *   - an expandable `<details>` rincian exposing every contributing component
 *     (nama, bobot, rata-rata) so the derivation is fully auditable (AC#3:
 *     visible & auditable bobot weights).
 *
 * `<details>` is pure HTML — collapsible without any client JS (the page is
 * server-rendered with no `"use client"`).
 *
 * NOTE: in the derived `rincian`, `bobot` and `rataRata` are already `number`
 * (the derivation converts the numeric-column strings via `Number(...)`).
 * `rataRata` is `null` when the student was absent for every penilaian in that
 * component (excluded from the weighted average).
 */
export function DaftarNilaiAkhir({
  nilaiAkhir,
  pesertaNama,
}: {
  nilaiAkhir: readonly NilaiAkhirPesertaDidik[];
  pesertaNama: ReadonlyMap<string, string>;
}) {
  if (nilaiAkhir.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] p-6 text-center text-sm text-muted-foreground">
        Belum ada Nilai Akhir.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card text-card-foreground shadow-warm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
            <th scope="col" className="p-3 font-medium sm:p-4">
              Nama
            </th>
            <th scope="col" className="p-3 font-medium sm:p-4">
              Nilai Akhir
            </th>
            <th scope="col" className="p-3 font-medium sm:p-4">
              Rincian
            </th>
          </tr>
        </thead>
        <tbody>
          {nilaiAkhir.map((n) => (
            <tr key={n.pesertaDidikId} className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/[0.03]">
              <td className="p-3 font-medium sm:p-4">
                {pesertaNama.get(n.pesertaDidikId) ?? "—"}
              </td>
              <td className="p-3 font-display text-base tabular-nums text-foreground sm:p-4">
                {n.nilaiAkhir}
              </td>
              <td className="p-3 sm:p-4">
                <details>
                  <summary className="cursor-pointer text-xs text-accent underline-offset-4 hover:underline">
                    Rincian ({n.rincian.length} komponen)
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {n.rincian.map((r) => (
                      <li
                        key={r.komponenNilaiId}
                        className="text-xs text-muted-foreground"
                      >
                        {r.nama} · Bobot: {r.bobot} · Rata-rata:{" "}
                        {r.rataRata ?? "—"}
                      </li>
                    ))}
                  </ul>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
