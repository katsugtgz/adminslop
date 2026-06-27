import { Button } from "@/components/ui/button";
import type { PesertaDidik } from "@/db/schema";

import type { ServerAksi } from "./form-komponen-nilai";

/**
 * Existing nilai row for a (penilaian, peserta_didik) — used to prefill the
 * input. `nilai` is a drizzle `numeric()` column → string on read (or null when
 * the student is absent / ungraded). `catatan` is an optional teacher note.
 */
export interface NilaiExisting {
  readonly nilai: string | null;
  readonly catatan: string | null;
}

/**
 * Per-student Nilai entry for one Penilaian. Server-rendered only; one server
 * form per Peserta Didik (the `upsertNilaiAction` writes one
 * (penilaian, peserta_didik) row at a time). The page only renders this when
 * `boleh("penilaian:buat")` — the action re-checks server-side (gate 1) AND
 * re-resolves ownership via penilaian -> komponen_nilai -> beban_mengajar
 * (gate 2, AC#4).
 *
 * `penilaianId` is resolved server-side (never client-supplied) and carried as
 * a hidden field on every row form. `nilai` is optional (0..100); an empty
 * value means absent (NULL). `pesertaDidikId` is also hidden per row.
 *
 * SECURITY: `pesertaDidikId` / `penilaianId` are resolved server-side and only
 * echoed for the form payload — they are NEVER read back to derive tenant scope
 * (§13); the action re-resolves ownership server-side.
 */
export function FormNilai({
  action,
  penilaianId,
  peserta,
  nilaiMap,
}: {
  action: ServerAksi;
  penilaianId: string;
  peserta: readonly PesertaDidik[];
  nilaiMap: ReadonlyMap<string, NilaiExisting>;
}) {
  if (peserta.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] p-6 text-center text-sm text-muted-foreground">
        Belum ada Peserta Didik.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {peserta.map((p) => {
        const existing = nilaiMap.get(p.id);
        return (
          <li
            key={p.id}
            className="rounded-2xl border border-border/60 bg-card p-4 text-card-foreground shadow-warm transition-colors hover:border-accent/30 t-lift"
          >
            <form action={action} className="flex flex-col gap-3">
              <input type="hidden" name="penilaianId" value={penilaianId} />
              <input type="hidden" name="pesertaDidikId" value={p.id} />

              <span className="text-sm font-semibold">{p.nama}</span>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`nilai-${p.id}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Nilai
                </label>
                <input
                  id={`nilai-${p.id}`}
                  name="nilai"
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  inputMode="decimal"
                  defaultValue={existing?.nilai ?? ""}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`catatan-${p.id}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Catatan
                </label>
                <input
                  id={`catatan-${p.id}`}
                  name="catatan"
                  type="text"
                  defaultValue={existing?.catatan ?? ""}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <Button type="submit" size="sm" className="w-fit">
                Simpan Nilai
              </Button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
