import { Button } from "@/components/ui/button";
import { Input, inputVariants } from "@/components/ui/input";
import type { TemplateCetak } from "@/db/schema";

import type { ServerAksi } from "./form-template";

/** Selectable TERBIT E-Raport option for the Dokumen Cetak form. */
export interface OpsiEraport {
  readonly id: string;
  readonly label: string;
}

/**
 * Form to generate a Dokumen Cetak from a TERBIT E-Raport (AC#2). Posts to
 * `buatDokumenCetakAction`. The page renders this only when
 * `boleh("cetak:buat")` — the action re-checks server-side (identity doc §12).
 *
 * AC#4 (MANDATORY DISCLAIMER): Tanda Tangan Cetak and Stempel Cetak are PRINT
 * ELEMENTS for document formatting only. They are NOT legal digital signatures,
 * cryptographic proofs, or approval mechanisms.
 */
export function KontrolCetak({
  eraportOptions,
  templateOptions,
  action,
}: {
  eraportOptions: readonly OpsiEraport[];
  templateOptions: readonly TemplateCetak[];
  action: ServerAksi;
}) {
  const hasEraport = eraportOptions.length > 0;
  const hasTemplate = templateOptions.length > 0;

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg tracking-tight text-foreground">Cetak Dokumen</h2>
        <p className="text-xs text-muted-foreground">
          Hanya E-Raport berstatus Terbit yang dapat dicetak.
        </p>
      </div>

      <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
        Catatan: Tanda Tangan Cetak dan Stempel Cetak adalah elemen format
        dokumen, BUKAN tanda tangan legal atau bukti persetujuan.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-eraport" className="text-sm font-medium">
          E-Raport
        </label>
        <select
          id="cetak-eraport"
          name="drafEraportId"
          defaultValue=""
          className={inputVariants()}
          required
        >
          <option value="" disabled>
            {hasEraport ? "Pilih E-Raport Terbit" : "Belum ada E-Raport Terbit"}
          </option>
          {eraportOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-template" className="text-sm font-medium">
          Template Cetak
        </label>
        <select
          id="cetak-template"
          name="templateCetakId"
          defaultValue=""
          className={inputVariants()}
          required
        >
          <option value="" disabled>
            {hasTemplate ? "Pilih Template Cetak" : "Belum ada Template Cetak"}
          </option>
          {templateOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nama}
              {t.isDefault ? " (Default)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-format" className="text-sm font-medium">
          Format Kertas
        </label>
        <select id="cetak-format" name="format" defaultValue="a4" className={inputVariants()}>
          <option value="a4">A4</option>
          <option value="f4">F4</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="cetak-td-nama" className="text-sm font-medium">
            Nama Tanda Tangan
          </label>
          <Input
            id="cetak-td-nama"
            name="tandaTanganNama"
            type="text"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="cetak-td-peran" className="text-sm font-medium">
            Peran Tanda Tangan
          </label>
          <Input
            id="cetak-td-peran"
            name="tandaTanganPeran"
            type="text"
            placeholder="Contoh: Kepala Sekolah"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-stempel" className="text-sm font-medium">
          Stempel (URL gambar, opsional)
        </label>
        <Input
          id="cetak-stempel"
          name="stempelUrl"
          type="url"
          placeholder="https://..."
        />
      </div>

      <Button type="submit" className="w-fit" disabled={!hasEraport || !hasTemplate}>
        Cetak Dokumen
      </Button>
    </form>
  );
}
