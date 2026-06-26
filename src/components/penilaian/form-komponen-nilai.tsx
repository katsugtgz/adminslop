import { Button } from "@/components/ui/button";

/**
 * A server action reference — `(formData) => Promise<void>`. Plain server forms
 * post directly to this; no client hooks, no client validation (the T5 actions
 * are the authoritative gate — identity doc §12).
 */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

/**
 * Form to add a Komponen Nilai (grading component — UTS / UAS / Tugas Harian)
 * on a Beban Mengajar. Server-rendered only; posts to
 * `simpanKomponenNilaiBaruAction`. The page only renders this when
 * `boleh("penilaian:buat")` (guru / admin / dev) — the action re-checks
 * server-side (gate 1) AND re-resolves ownership (gate 2, AC#4).
 *
 * `bebanMengajarId` is resolved server-side (never client-supplied) and carried
 * as a hidden field. `bobot` is the positive weight used for Nilai Akhir
 * derivation (AC#3); the schema CHECK + the action enforce positivity.
 */
export function FormKomponenNilai({
  action,
  bebanMengajarId,
}: {
  action: ServerAksi;
  bebanMengajarId: string;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <input type="hidden" name="bebanMengajarId" value={bebanMengajarId} />

      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight">
          Tambah Komponen Nilai
        </h3>
        <p className="text-xs text-muted-foreground">
          Komponen (mis. UTS, UAS, Tugas Harian) dengan bobot untuk perhitungan
          Nilai Akhir.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="kn-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="kn-nama"
          name="nama"
          type="text"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="kn-bobot" className="text-sm font-medium">
          Bobot
        </label>
        <input
          id="kn-bobot"
          name="bobot"
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        Tambah Komponen Nilai
      </Button>
    </form>
  );
}
