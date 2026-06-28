import { Button } from "@/components/ui/button";
import type { ServerAksi } from "./form-tambah";

const INPUT_CLASS =
  "h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Per-row form to transition a Peserta Didik's status (aktif / pindah / lulus /
 * keluar). Server-rendered only; posts to `ubahStatusPesertaDidikAction`. The
 * page renders this inside each row when
 * `boleh("peserta_didik:buat") && boleh("peserta_didik:ubah")` (admin / dev) —
 * the action re-checks server-side (identity doc §12).
 *
 * `pesertaId` is bound by the SERVER from the row under render — it is never
 * client-supplied. The action ignores any tampered `orgId`/`tenantId` and
 * derives the tenant from the live membership (§13).
 */
export function FormUbahStatus({
  action,
  pesertaId,
}: {
  action: ServerAksi;
  pesertaId: string;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      aria-label="Ubah status Peserta Didik"
    >
      <input type="hidden" name="id" value={pesertaId} />

      <label htmlFor={`pd-status-${pesertaId}`} className="sr-only">
        Status
      </label>
      <select
        id={`pd-status-${pesertaId}`}
        name="status"
        defaultValue="aktif"
        className={INPUT_CLASS}
      >
        <option value="aktif">Aktif</option>
        <option value="pindah">Pindah</option>
        <option value="lulus">Lulus</option>
        <option value="keluar">Keluar</option>
      </select>

      <label htmlFor={`pd-catatan-${pesertaId}`} className="sr-only">
        Catatan
      </label>
      <input
        id={`pd-catatan-${pesertaId}`}
        name="catatan"
        type="text"
        placeholder="Catatan"
        aria-label="Catatan"
        className={INPUT_CLASS}
      />

      <Button type="submit" size="sm">
        Ubah Status
      </Button>
    </form>
  );
}
