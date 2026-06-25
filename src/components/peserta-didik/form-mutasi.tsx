import { Button } from "@/components/ui/button";

import type { ServerAksi } from "./form-ubah-biodata";

/**
 * Form to record a student transfer (mutasi). Server-rendered only; posts to
 * `catatMutasiPesertaDidikAction` which atomically records the transfer row AND
 * transitions status in one transaction (AC#2 + AC#3). Rendered only when
 * `boleh("peserta_didik:ubah")`.
 *
 * Note: the action reads the peserta_didik id from the `id` field (not
 * `pesertaDidikId`), so the hidden input carries `name="id"`.
 */
export function FormMutasi({
  action,
  pesertaDidikId,
}: {
  action: ServerAksi;
  pesertaDidikId: string;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <input type="hidden" name="id" value={pesertaDidikId} />

      <h2 className="text-lg font-semibold tracking-tight">Catat Mutasi</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="mutasi-arah" className="text-sm font-medium">
          Arah
        </label>
        <select
          id="mutasi-arah"
          name="arah"
          defaultValue="masuk"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="masuk">Masuk</option>
          <option value="keluar">Keluar</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mutasi-asal" className="text-sm font-medium">
          Asal Sekolah
        </label>
        <input
          id="mutasi-asal"
          name="asalSekolah"
          type="text"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mutasi-tujuan" className="text-sm font-medium">
          Tujuan Sekolah
        </label>
        <input
          id="mutasi-tujuan"
          name="tujuanSekolah"
          type="text"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mutasi-tanggal" className="text-sm font-medium">
          Tanggal
        </label>
        <input
          id="mutasi-tanggal"
          name="tanggal"
          type="date"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mutasi-alasan" className="text-sm font-medium">
          Alasan
        </label>
        <textarea
          id="mutasi-alasan"
          name="alasan"
          rows={2}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        Catat Mutasi
      </Button>
    </form>
  );
}
