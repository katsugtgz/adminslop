import { Button } from "@/components/ui/button";

/**
 * A server action reference — `(formData) => Promise<void>`. Plain server forms
 * post directly to this; no client hooks, no client validation (the T9 actions
 * are the authoritative gate — identity doc §12).
 */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

/**
 * Form to add a new Tingkat (grade level, e.g. "Kelas 1"). Server-rendered
 * only; posts to `simpanTingkatBaruAction`. The page only renders this when
 * `boleh("rombongan_belajar:buat")` (admin / dev) — the action re-checks
 * server-side.
 *
 * `urutan` is the progression order — it drives the `kenaikanTingkat` "next
 * grade" lookup (see `cariTingkatBerikutnya`).
 */
export function FormTingkatBaru({ action }: { action: ServerAksi }) {
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
          Tambah Tingkat
        </h2>
        <p className="text-xs text-muted-foreground">
          Tambah jenjang tingkat baru untuk Satuan Pendidikan Aktif.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tingkat-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="tingkat-nama"
          name="nama"
          type="text"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tingkat-urutan" className="text-sm font-medium">
          Urutan
        </label>
        <input
          id="tingkat-urutan"
          name="urutan"
          type="number"
          inputMode="numeric"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        Tambah Tingkat
      </Button>
    </form>
  );
}
