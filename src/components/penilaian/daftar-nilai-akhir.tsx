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
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Nilai Akhir.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="p-3 font-medium">
              Nama
            </th>
            <th scope="col" className="p-3 font-medium">
              Nilai Akhir
            </th>
            <th scope="col" className="p-3 font-medium">
              Rincian
            </th>
          </tr>
        </thead>
        <tbody>
          {nilaiAkhir.map((n) => (
            <tr key={n.pesertaDidikId} className="border-b border-border">
              <td className="p-3 font-medium">
                {pesertaNama.get(n.pesertaDidikId) ?? "—"}
              </td>
              <td className="p-3 tabular-nums">{n.nilaiAkhir}</td>
              <td className="p-3">
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-primary">
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
