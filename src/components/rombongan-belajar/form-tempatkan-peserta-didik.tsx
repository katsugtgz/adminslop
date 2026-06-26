import { Button } from "@/components/ui/button";
import type { PesertaDidik, RombonganBelajar } from "@/db/schema";

import type { ServerAksi } from "./form-tingkat-baru";

/**
 * Form to place a Peserta Didik into a Rombongan Belajar for the CURRENT active
 * context. Server-rendered only; posts to `tempatkanPesertaDidikAction`. The
 * page only renders this when
 * `boleh("rombongan_belajar:kelola_penempatan")` (admin / dev).
 *
 * AC#4 (derived context): the active Tahun Ajaran + active semester are
 * resolved SERVER-SIDE by the action — there are no TA/semester fields here. A
 * client cannot inject a different class context.
 *
 * `peserta` and `rombel` are loaded server-side (tenant-scoped) and rendered as
 * `<select>`s; the chosen ids are posted to the action, which validates them
 * within the tenant (RLS).
 */
export function FormTempatkanPesertaDidik({
  action,
  peserta,
  rombel,
}: {
  action: ServerAksi;
  peserta: readonly PesertaDidik[];
  rombel: readonly RombonganBelajar[];
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Tempatkan Peserta Didik
        </h2>
        <p className="text-xs text-muted-foreground">
          Tempatkan peserta didik ke Rombongan Belajar untuk konteks aktif.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="tempatkan-peserta" className="text-sm font-medium">
          Peserta Didik
        </label>
        <select
          id="tempatkan-peserta"
          name="pesertaDidikId"
          required
          defaultValue=""
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      <div className="flex flex-col gap-1">
        <label htmlFor="tempatkan-rombel" className="text-sm font-medium">
          Rombongan Belajar
        </label>
        <select
          id="tempatkan-rombel"
          name="rombonganBelajarId"
          required
          defaultValue=""
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Pilih Rombongan Belajar
          </option>
          {rombel.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nama}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="w-fit">
        Tempatkan Peserta Didik
      </Button>
    </form>
  );
}
