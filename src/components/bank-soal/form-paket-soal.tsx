import { Button } from "@/components/ui/button";

import type { ServerAksi } from "./form-butir-soal";

/**
 * Form to create a Paket Soal. Server-rendered only; posts to
 * `buatPaketSoalAction`. The page renders this only when
 * `boleh("paket_soal:buat")`.
 */
export function FormPaketSoal({
  action,
  mataPelajaran,
  tingkat,
  tahunAjaran,
}: {
  action: ServerAksi;
  mataPelajaran: readonly { id: string; nama: string }[];
  tingkat: readonly { id: string; nama: string }[];
  tahunAjaran: readonly { id: string; nama: string }[];
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl tracking-tight text-foreground">
          Buat Paket Soal
        </h2>
        <p className="text-xs text-muted-foreground">
          Rakit Butir Soal menjadi satu Paket untuk satu periode penilaian.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="paket-nama" className="text-sm font-medium">
          Nama Paket
        </label>
        <input
          id="paket-nama"
          name="nama"
          type="text"
          required
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="paket-mapel" className="text-sm font-medium">
          Mata Pelajaran
        </label>
        <select
          id="paket-mapel"
          name="mataPelajaranId"
          defaultValue=""
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Pilih Mata Pelajaran
          </option>
          {mataPelajaran.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="paket-tingkat" className="text-sm font-medium">
          Tingkat (opsional)
        </label>
        <select
          id="paket-tingkat"
          name="tingkatId"
          defaultValue=""
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Tanpa Tingkat</option>
          {tingkat.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="paket-ta" className="text-sm font-medium">
          Tahun Ajaran
        </label>
        <select
          id="paket-ta"
          name="tahunAjaranId"
          defaultValue=""
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Pilih Tahun Ajaran
          </option>
          {tahunAjaran.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="paket-semester" className="text-sm font-medium">
          Semester (opsional)
        </label>
        <select
          id="paket-semester"
          name="semester"
          defaultValue=""
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Tanpa Semester</option>
          <option value="ganjil">Ganjil</option>
          <option value="genap">Genap</option>
        </select>
      </div>

      <Button type="submit" className="w-fit">
        Simpan Paket Soal
      </Button>
    </form>
  );
}
