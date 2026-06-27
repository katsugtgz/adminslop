import { Button } from "@/components/ui/button";
import type { Tingkat } from "@/db/schema";

import type { ServerAksi } from "./form-tingkat-baru";

/**
 * Form to add a new Rombongan Belajar (class / homeroom). Server-rendered only;
 * posts to `simpanRombonganBelajarBaruAction`. The page only renders this when
 * `boleh("rombongan_belajar:buat")` (admin / dev).
 *
 * AC#4 (derived context): the active Tahun Ajaran is resolved SERVER-SIDE by
 * the action — there is no TA field here. A client cannot inject a different
 * Tahun Ajaran.
 *
 * The `tingkat` list is loaded server-side (tenant-scoped) and rendered as a
 * `<select>`; the chosen `tingkatId` is posted to the action, which validates
 * it within the tenant (RLS).
 */
export function FormRombonganBelajarBaru({
  action,
  tingkat,
}: {
  action: ServerAksi;
  tingkat: readonly Tingkat[];
}) {
  return (
    <form
      action={action}
      className="flex flex-1 flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          Form
        </p>
        <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
          Tambah Rombongan Belajar
        </h2>
        <p className="text-xs text-muted-foreground">
          Tambah kelas baru untuk Tahun Ajaran Aktif.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="rombel-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="rombel-nama"
          name="nama"
          type="text"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="rombel-tingkat" className="text-sm font-medium">
          Tingkat
        </label>
        <select
          id="rombel-tingkat"
          name="tingkatId"
          required
          defaultValue=""
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Pilih Tingkat
          </option>
          {tingkat.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nama}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="w-fit">
        Tambah Rombongan Belajar
      </Button>
    </form>
  );
}
