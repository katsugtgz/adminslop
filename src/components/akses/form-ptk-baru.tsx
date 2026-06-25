import { Button } from "@/components/ui/button";

/**
 * A server action reference — `(formData) => Promise<void>`. Plain server forms
 * post directly to this; no client hooks, no client validation (the T5 actions
 * are the authoritative gate — identity doc §12).
 */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

/**
 * Form to add a new PTK (Pendidik / Tenaga Kependidikan). Server-rendered only;
 * posts to `simpanPtkBaruAction`. The page only renders this when
 * `boleh("akses:kelola")` (admin / dev) — the action re-checks server-side.
 */
export function FormPtkBaru({ action }: { action: ServerAksi }) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Tambah PTK</h2>
        <p className="text-xs text-muted-foreground">
          Tambah catatan personel baru untuk Satuan Pendidikan Aktif.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ptk-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="ptk-nama"
          name="nama"
          type="text"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ptk-nip" className="text-sm font-medium">
          NIP
        </label>
        <input
          id="ptk-nip"
          name="nip"
          type="text"
          inputMode="numeric"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ptk-jenis" className="text-sm font-medium">
          Jenis
        </label>
        <select
          id="ptk-jenis"
          name="jenis"
          defaultValue="pendidik"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="pendidik">Pendidik</option>
          <option value="tenaga_kependidikan">Tenaga Kependidikan</option>
        </select>
      </div>

      <Button type="submit" className="w-fit">
        Tambah PTK
      </Button>
    </form>
  );
}
