import { Button } from "@/components/ui/button";
import type { Ptk } from "@/db/schema";
import type { RombonganBelajar } from "@/db/schema";

import type { ServerAksi } from "./form-beban-mengajar-baru";

/**
 * Form to assign (or reassign — AC#3 upsert) a Wali Kelas for a Rombongan
 * Belajar in the active period. Server-rendered only; posts to
 * `upsertWaliKelasAction`. Rendered only when `boleh("wali_kelas:buat")`
 * (admin / dev) — the action re-checks server-side.
 */
export function FormWaliKelas({
  action,
  ptks,
  rombels,
}: {
  action: ServerAksi;
  ptks: readonly Ptk[];
  rombels: readonly RombonganBelajar[];
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Tetapkan Wali Kelas
        </h2>
        <p className="text-xs text-muted-foreground">
          Tetapkan Wali Kelas untuk sebuah Rombongan Belajar pada periode aktif.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="wali-ptk" className="text-sm font-medium">
          Guru/PTK
        </label>
        <select
          id="wali-ptk"
          name="ptkId"
          required
          defaultValue=""
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            — Pilih Guru/PTK —
          </option>
          {ptks.map((ptk) => (
            <option key={ptk.id} value={ptk.id}>
              {ptk.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="wali-rombel" className="text-sm font-medium">
          Rombongan Belajar
        </label>
        <select
          id="wali-rombel"
          name="rombonganBelajarId"
          required
          defaultValue=""
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            — Pilih Rombongan Belajar —
          </option>
          {rombels.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nama}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="w-fit">
        Tetapkan Wali Kelas
      </Button>
    </form>
  );
}
