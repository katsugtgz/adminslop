import { UserPlus } from "lucide-react";

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
      className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
    >
      <div className="flex flex-col gap-1">
        <p className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-accent sm:text-xs">
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Personel Baru
        </p>
        <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
          Tambah PTK
        </h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Tambah catatan personel baru untuk Satuan Pendidikan Aktif.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="ptk-nama" className="text-sm font-medium">
            Nama
          </label>
          <input
            id="ptk-nama"
            name="nama"
            type="text"
            required
            className="h-11 rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ptk-nip" className="text-sm font-medium">
            NIP
          </label>
          <input
            id="ptk-nip"
            name="nip"
            type="text"
            inputMode="numeric"
            className="h-11 rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ptk-jenis" className="text-sm font-medium">
            Jenis
          </label>
          <select
            id="ptk-jenis"
            name="jenis"
            defaultValue="pendidik"
            className="h-11 rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="pendidik">Pendidik</option>
            <option value="tenaga_kependidikan">Tenaga Kependidikan</option>
          </select>
        </div>
      </div>

      <div>
        <Button type="submit" className="w-fit">
          Tambah PTK
        </Button>
      </div>
    </form>
  );
}
