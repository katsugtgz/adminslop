import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PesertaDidik } from "@/db/schema";

import type { ServerAksi } from "./form-tingkat-baru";

// Progression controls — Kenaikan Tingkat (promote to next grade) and Tinggal
// Tingkat (repeat the same grade) for a NEW Tahun Ajaran. Both append a new
// placement row for the new TA (AC#5 — append-only); the student's current
// placement is never modified.

/**
 * A private pesertaDidikId + tahunAjaranBaruId fieldset, shared by the two
 * progression forms. `legend` is the visible heading; the `submitLabel` is the
 * action verb.
 */
function FormProgresi({
  legend,
  submitLabel,
  action,
  peserta,
}: {
  legend: string;
  submitLabel: string;
  action: ServerAksi;
  peserta: readonly PesertaDidik[];
}) {
  return (
    <form
      action={action}
      className="flex flex-1 flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-warm"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"
        >
          <ArrowUp className="h-4 w-4" />
        </span>
        <h3 className="font-display text-lg tracking-tight text-foreground sm:text-xl">
          {legend}
        </h3>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`progresi-peserta-${submitLabel}`}
          className="text-sm font-medium"
        >
          Peserta Didik
        </label>
        <select
          id={`progresi-peserta-${submitLabel}`}
          name="pesertaDidikId"
          required
          defaultValue=""
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Pilih Peserta Didik
          </option>
          {peserta.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`progresi-ta-${submitLabel}`}
          className="text-sm font-medium"
        >
          Tahun Ajaran Baru
        </label>
        <input
          id={`progresi-ta-${submitLabel}`}
          name="tahunAjaranBaruId"
          type="text"
          required
          aria-label="Tahun Ajaran Baru"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}

/**
 * Progression controls for Peserta Didik across Tahun Ajaran boundaries.
 * Server-rendered only; the page renders this when
 * `boleh("rombongan_belajar:kelola_penempatan")` (admin / dev) AND a Tahun
 * Ajaran is active.
 *
 * Two independent server forms:
 *   - Kenaikan Tingkat → `kenaikanAction` (advance to the next tingkat).
 *   - Tinggal Tingkat  → `tinggalAction` (repeat the same tingkat).
 *
 * AC#4 (derived context): the student's CURRENT class context (active TA +
 * semester) is resolved SERVER-SIDE by the actions. Only the TARGET new TA id
 * is supplied by the client (`tahunAjaranBaruId`), which the actions validate
 * within the tenant.
 */
export function KontrolProgresi({
  kenaikanAction,
  tinggalAction,
  peserta,
}: {
  kenaikanAction: ServerAksi;
  tinggalAction: ServerAksi;
  peserta: readonly PesertaDidik[];
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <FormProgresi
        legend="Kenaikan Tingkat"
        submitLabel="Kenaikan Tingkat"
        action={kenaikanAction}
        peserta={peserta}
      />
      <FormProgresi
        legend="Tinggal Tingkat"
        submitLabel="Tinggal Tingkat"
        action={tinggalAction}
        peserta={peserta}
      />
    </div>
  );
}
