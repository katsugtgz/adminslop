import { Button } from "@/components/ui/button";
import type { ButirSoal } from "@/db/schema";

import type { ServerAksi } from "./form-butir-soal";

/**
 * Form to add an existing Butir Soal into the active Paket at `urutan` with
 * optional `bobot`. Server-rendered only; posts to
 * `tambahButirKePaketAction`. The page renders this only when
 * `boleh("paket_soal:ubah")`. The butir select is restricted to butir NOT
 * already in the paket (caller filters the candidate list).
 */
export function FormTambahButir({
  action,
  paketSoalId,
  candidates,
  nextUrutan,
}: {
  action: ServerAksi;
  paketSoalId: string;
  /** Butir Soal rows eligible to add (already excludes paket members). */
  candidates: readonly ButirSoal[];
  /** Pre-filled urutan (caller computes the next slot). */
  nextUrutan: number;
}) {
  if (candidates.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
        Semua Butir Soal yang aktif sudah ada di paket ini.
      </p>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
    >
      <input type="hidden" name="paketSoalId" value={paketSoalId} />

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`tambah-butir-${paketSoalId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Tambah ke Paket
        </label>
        <select
          id={`tambah-butir-${paketSoalId}`}
          name="butirSoalId"
          defaultValue=""
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="" disabled>
            Pilih Butir Soal
          </option>
          {candidates.map((b) => (
            <option key={b.id} value={b.id}>
              {b.pertanyaan.slice(0, 60)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`tambah-urutan-${paketSoalId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Urutan
        </label>
        <input
          id={`tambah-urutan-${paketSoalId}`}
          name="urutan"
          type="number"
          min={1}
          defaultValue={nextUrutan}
          className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor={`tambah-bobot-${paketSoalId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Bobot
        </label>
        <input
          id={`tambah-bobot-${paketSoalId}`}
          name="bobot"
          type="text"
          inputMode="decimal"
          placeholder="1"
          className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>

      <Button type="submit" size="sm">
        Tambah ke Paket
      </Button>
    </form>
  );
}
