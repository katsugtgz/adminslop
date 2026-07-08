import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Server action reference — `(formData) => Promise<void>`. Shared across this folder. */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

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
      className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg tracking-tight text-foreground">Buat Template</h2>
        <p className="text-xs text-muted-foreground">
          Template berisi konfigurasi cetak yang dapat digunakan ulang.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-nama" className="text-sm font-medium">
          Nama Template
        </label>
        <Input
          id="cetak-nama"
          name="nama"
          type="text"
          required
          placeholder="Contoh: Template Rapor Standar"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="cetak-margin" className="text-sm font-medium">
            Margin (mm)
          </label>
          <Input
            id="cetak-margin"
            name="marginMm"
            type="number"
            min={0}
            placeholder="15"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="cetak-font" className="text-sm font-medium">
            Ukuran Font
          </label>
          <Input
            id="cetak-font"
            name="fontSize"
            type="number"
            min={6}
            placeholder="12"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-header-text" className="text-sm font-medium">
          Teks Header
        </label>
        <Input
          id="cetak-header-text"
          name="headerText"
          type="text"
          placeholder="LAPORAN HASIL BELAJAR"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cetak-footer-text" className="text-sm font-medium">
          Teks Footer
        </label>
        <Input
          id="cetak-footer-text"
          name="footerText"
          type="text"
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
