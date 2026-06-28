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
    <section className="bg-grain flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-warm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent"
          >
            01
          </span>
          <h2 className="font-display text-2xl tracking-tight text-foreground">
            Kuota AI
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {kuota.terpakai} dari {kuota.batas}{" "}
          <span className="text-muted-foreground">(tersisa {kuota.tersisa})</span>
        </p>
      </div>

      <progress
        value={persen}
        max={100}
        aria-label={`Kuota AI: ${kuota.terpakai} dari ${kuota.batas}`}
        className="progress-warm"
      />
      <p className="text-xs text-muted-foreground">
        Kuota dipakai setiap kali Permintaan AI selesai diproses.
      </p>
    </section>
  );
}
