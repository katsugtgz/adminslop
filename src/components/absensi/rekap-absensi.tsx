import type { RekapAbsensi } from "@/db/queries/absensi";

/**
 * AC#4 — Rekap Absensi display. Shows per-student attendance buckets
 * (Hadir / Izin / Sakit / Alpa) over a date range. Used on the Absensi page
 * after a rombel+tanggal context is chosen so the teacher / wali_kelas /
 * kepala_sekolah sees a per-student summary alongside the per-day entry form.
 *
 * `rekap` is a Map keyed by pesertaDidikId (from `getRekapByRombonganBelajar`);
 * `pesertaNama` resolves names. Students with NO attendance rows in range are
 * absent from the Map (the page decides how to render the gap — typically
 * shown with zero counts).
 */
export function RekapAbsensiTable({
  rekap,
  pesertaNama,
}: {
  rekap: ReadonlyMap<string, RekapAbsensi>;
  pesertaNama: ReadonlyMap<string, string>;
}) {
  if (rekap.size === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Belum ada Absensi.
      </p>
    );
  }

  // Stable order: alphabetical by name (instead of by opaque uuid).
  const rows = [...rekap.entries()].sort(([aId], [bId]) => {
    const aNama = pesertaNama.get(aId) ?? "—";
    const bNama = pesertaNama.get(bId) ?? "—";
    return aNama < bNama ? -1 : aNama > bNama ? 1 : 0;
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card text-card-foreground shadow-warm">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <th scope="col" className="p-3.5 font-medium">
              Nama
            </th>
            <th scope="col" className="p-3.5 font-medium text-right">
              Hadir
            </th>
            <th scope="col" className="p-3.5 font-medium text-right">
              Izin
            </th>
            <th scope="col" className="p-3.5 font-medium text-right">
              Sakit
            </th>
            <th scope="col" className="p-3.5 font-medium text-right">
              Alpa
            </th>
            <th scope="col" className="p-3.5 font-medium text-right">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([pdId, r]) => (
            <tr key={pdId} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
              <td className="p-3.5 font-medium text-foreground">
                {pesertaNama.get(pdId) ?? "—"}
              </td>
              <td className="p-3.5 text-right tabular-nums">{r.hadir}</td>
              <td className="p-3.5 text-right tabular-nums">{r.izin}</td>
              <td className="p-3.5 text-right tabular-nums">{r.sakit}</td>
              <td className="p-3.5 text-right tabular-nums">{r.alpa}</td>
              <td className="p-3.5 text-right font-semibold tabular-nums text-accent">
                {r.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
