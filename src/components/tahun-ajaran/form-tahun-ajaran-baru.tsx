import { Button } from "@/components/ui/button";

/**
 * A server action reference — `(formData) => Promise<void>`. Plain server forms
 * post directly to this; no client hooks, no client validation (the T8 actions
 * are the authoritative gate — identity doc §12).
 */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

/**
 * Form to add a new Tahun Ajaran (academic year, e.g. "2025/2026").
 * Server-rendered only; posts to `simpanTahunAjaranBaruAction`. The page only
 * renders this when `boleh("tahun_ajaran:kelola")` (admin / dev) — the action
 * re-checks server-side.
 */
export function FormTahunAjaranBaru({ action }: { action: ServerAksi }) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Tambah Tahun Ajaran</h2>
        <p className="text-xs text-muted-foreground">
          Tambah Tahun Ajaran baru untuk Satuan Pendidikan Aktif.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ta-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="ta-nama"
          name="nama"
          type="text"
          required
          placeholder="2025/2026"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        Tambah Tahun Ajaran
      </Button>
    </form>
  );
}
