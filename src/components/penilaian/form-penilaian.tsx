import { Button } from "@/components/ui/button";

import type { ServerAksi } from "./form-komponen-nilai";

/**
 * Form to add a Penilaian (individual assessment — e.g. "Tugas 1", "Ujian Tengah
 * Semester") within a Komponen Nilai. Server-rendered only; posts to
 * `simpanPenilaianBaruAction`. The page only renders this when
 * `boleh("penilaian:buat")` — the action re-checks server-side (gate 1) AND
 * re-resolves ownership via komponen_nilai -> beban_mengajar (gate 2, AC#4).
 *
 * `komponenNilaiId` is resolved server-side (never client-supplied) and carried
 * as a hidden field. `tanggal` is the assessment date (ISO `YYYY-MM-DD`).
 */
export function FormPenilaian({
  action,
  komponenNilaiId,
}: {
  action: ServerAksi;
  komponenNilaiId: string;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <input type="hidden" name="komponenNilaiId" value={komponenNilaiId} />

      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight">
          Tambah Penilaian
        </h3>
        <p className="text-xs text-muted-foreground">
          Penilaian individu (mis. Tugas 1, Ujian Tengah Semester) di dalam
          Komponen Nilai terpilih.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pen-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="pen-nama"
          name="nama"
          type="text"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pen-tanggal" className="text-sm font-medium">
          Tanggal
        </label>
        <input
          id="pen-tanggal"
          name="tanggal"
          type="date"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        Tambah Penilaian
      </Button>
    </form>
  );
}
