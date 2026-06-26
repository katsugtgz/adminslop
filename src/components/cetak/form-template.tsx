import { Button } from "@/components/ui/button";

/** Server action reference — `(formData) => Promise<void>`. Shared across this folder. */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

const INPUT_CLASS =
  "h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Form to create a Template Cetak. Server-rendered only; posts to
 * `buatTemplateCetakAction`. The page renders this only when
 * `boleh("cetak:buat")` (admin / kepala_sekolah / dev) — the action re-checks
 * server-side (identity doc §12). `pengaturan` fields are optional; only the
 * supplied values are stored. `isDefault` flips all other same-jenis templates
 * to non-default first (one default per tenant per jenis).
 */
export function FormTemplateCetak({ action }: { action: ServerAksi }) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Buat Template</h2>
        <p className="text-xs text-muted-foreground">
          Template berisi konfigurasi cetak yang dapat digunakan ulang.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-nama" className="text-sm font-medium">
          Nama Template
        </label>
        <input
          id="cetak-nama"
          name="nama"
          type="text"
          required
          className={INPUT_CLASS}
          placeholder="Contoh: Template Rapor Standar"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="cetak-margin" className="text-sm font-medium">
            Margin (mm)
          </label>
          <input
            id="cetak-margin"
            name="marginMm"
            type="number"
            min={0}
            className={INPUT_CLASS}
            placeholder="15"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="cetak-font" className="text-sm font-medium">
            Ukuran Font
          </label>
          <input
            id="cetak-font"
            name="fontSize"
            type="number"
            min={6}
            className={INPUT_CLASS}
            placeholder="12"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-header-text" className="text-sm font-medium">
          Teks Header
        </label>
        <input
          id="cetak-header-text"
          name="headerText"
          type="text"
          className={INPUT_CLASS}
          placeholder="LAPORAN HASIL BELAJAR"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-footer-text" className="text-sm font-medium">
          Teks Footer
        </label>
        <input
          id="cetak-footer-text"
          name="footerText"
          type="text"
          className={INPUT_CLASS}
          placeholder="Dokumen ini dicetak secara elektronik."
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="showLogo" defaultChecked className="h-4 w-4" />
          Tampilkan Logo
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="showHeader" defaultChecked className="h-4 w-4" />
          Tampilkan Header
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="isDefault" className="h-4 w-4" />
          Jadikan Template Default
        </label>
      </div>

      <Button type="submit" className="w-fit">
        Buat Template
      </Button>
    </form>
  );
}
