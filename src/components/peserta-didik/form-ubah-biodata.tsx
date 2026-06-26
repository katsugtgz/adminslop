import { Button } from "@/components/ui/button";
import type { PesertaDidik } from "@/db/schema";

/**
 * A server action reference — `(formData) => Promise<void>`. Plain server forms
 * post directly to this; no client hooks, no client validation (the T6 actions
 * are the authoritative gate — identity doc §12).
 */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

/**
 * Form to edit a Peserta Didik's biodata ONLY (nama / nisn / nis / tanggalLahir
 * / jenisKelamin). Server-rendered only; posts to `ubahPesertaDidikAction`. The
 * page renders this only when `boleh("peserta_didik:ubah")` (admin / dev) — the
 * action re-checks server-side. Status is deliberately absent: status changes
 * flow through the append-only riwayat (AC#2).
 */
export function FormUbahBiodata({
  action,
  values,
}: {
  action: ServerAksi;
  values: PesertaDidik;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <input type="hidden" name="id" value={values.id} />

      <div className="flex flex-col gap-1">
        <label htmlFor="pd-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="pd-nama"
          name="nama"
          type="text"
          required
          defaultValue={values.nama}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          defaultValue={values.nisn ?? ""}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          defaultValue={values.nis ?? ""}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          defaultValue={values.tanggalLahir}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pd-jenis-kelamin" className="text-sm font-medium">
          Jenis Kelamin
        </label>
        <select
          id="pd-jenis-kelamin"
          name="jenisKelamin"
          defaultValue={values.jenisKelamin}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="L">Laki-laki</option>
          <option value="P">Perempuan</option>
        </select>
      </div>

      <Button type="submit" className="w-fit">
        Simpan Perubahan
      </Button>
    </form>
  );
}
