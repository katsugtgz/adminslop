import { Button } from "@/components/ui/button";

/**
 * A server action reference — `(formData) => Promise<void>`. Plain server forms
 * post directly to this; no client hooks, no client validation (the T5 actions
 * are the authoritative gate — identity doc §12).
 */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

const INPUT_CLASS =
  "h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Form to add a new Peserta Didik (student). Server-rendered only; posts to
 * `simpanPesertaDidikBaruAction`. The page only renders this when
 * `boleh("peserta_didik:buat") && boleh("peserta_didik:ubah")` (admin / dev) —
 * the action re-checks server-side.
 *
 * No `"use client"`: a plain server form. NISN is optional but constrained to
 * 8 numeric digits (matches the T6 action's NISN_RE); the action is still the
 * authoritative validator.
 */
export function FormTambah({ action }: { action: ServerAksi }) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Tambah Peserta Didik</h2>
        <p className="text-xs text-muted-foreground">
          Tambah catatan Peserta Didik baru untuk Satuan Pendidikan Aktif.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pd-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="pd-nama"
          name="nama"
          type="text"
          required
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pd-nisn" className="text-sm font-medium">
          NISN
        </label>
        <input
          id="pd-nisn"
          name="nisn"
          type="text"
          inputMode="numeric"
          maxLength={8}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pd-nis" className="text-sm font-medium">
          NIS
        </label>
        <input
          id="pd-nis"
          name="nis"
          type="text"
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pd-tanggal-lahir" className="text-sm font-medium">
          Tanggal Lahir
        </label>
        <input
          id="pd-tanggal-lahir"
          name="tanggalLahir"
          type="date"
          required
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pd-jenis-kelamin" className="text-sm font-medium">
          Jenis Kelamin
        </label>
        <select
          id="pd-jenis-kelamin"
          name="jenisKelamin"
          defaultValue="L"
          className={INPUT_CLASS}
        >
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </select>
      </div>

      <Button type="submit" className="w-fit">
        Tambah Peserta Didik
      </Button>
    </form>
  );
}
