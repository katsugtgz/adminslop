import { CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Semester } from "@/db/queries/tahun-ajaran";

import type { ServerAksi } from "./form-tahun-ajaran-baru";

/**
 * Kontrol Semester — server-rendered form to switch the active semester
 * (`ganjil` / `genap`) on the active Satuan Pendidikan. Posts to
 * `ubahSemesterAktifAction`. Rendered only when `boleh("tahun_ajaran:kelola")`
 * (admin / dev) — the action re-checks server-side.
 *
 * `<select defaultValue>` mirrors the FormPtkBaru `jenis` pattern; the page
 * resolves the live `semesterAktif` server-side and feeds it through.
 */
export function KontrolSemester({
  action,
  semesterAktif,
}: {
  action: ServerAksi;
  semesterAktif: Semester | null;
}) {
  return (
    <form
      action={action}
      className="flex flex-1 flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          <CalendarRange
            className="mr-1.5 inline h-3 w-3"
            aria-hidden="true"
          />
          Periode
        </p>
        <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
          Semester Aktif
        </h2>
        <p className="text-xs text-muted-foreground">
          Pilih semester yang berlaku untuk Satuan Pendidikan Aktif.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="semester-aktif" className="text-sm font-medium">
          Semester Aktif
        </label>
        <select
          id="semester-aktif"
          name="semester"
          defaultValue={semesterAktif ?? "ganjil"}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="ganjil">Ganjil</option>
          <option value="genap">Genap</option>
        </select>
      </div>

      <Button type="submit" className="w-fit">
        Ubah Semester Aktif
      </Button>
    </form>
  );
}
