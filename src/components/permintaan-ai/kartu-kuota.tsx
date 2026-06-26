import type { InfoKuotaAi } from "@/db/queries/kuota-ai";

/**
 * AC#5 kuota display. Shows terpakai / batas / tersisa for the active
 * (Tahun Ajaran + Semester) AI budget, with a progress bar so usage is visible
 * at a glance. Pure presentational — the page derives `InfoKuotaAi` inside
 * `withTenant` and passes it in.
 */
export function KartuKuota({ kuota }: { kuota: InfoKuotaAi }) {
  const persen =
    kuota.batas <= 0
      ? 0
      : Math.min(100, Math.round((kuota.terpakai / kuota.batas) * 100));

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Kuota AI</h2>
        <p className="text-sm text-muted-foreground">
          {kuota.terpakai} dari {kuota.batas}{" "}
          <span className="text-muted-foreground">(tersisa {kuota.tersisa})</span>
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={persen}
        aria-label={`Kuota AI: ${kuota.terpakai} dari ${kuota.batas}`}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${persen}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Kuota dipakai setiap kali Permintaan AI selesai diproses.
      </p>
    </section>
  );
}
