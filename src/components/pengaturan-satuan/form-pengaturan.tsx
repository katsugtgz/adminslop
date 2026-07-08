import { simpanPengaturanSatuanPendidikanAction } from "@/app/dashboard/pengaturan/actions";
import { Button } from "@/components/ui/button";
import type { ProfilDanPengaturanRow } from "@/db/queries/satuan-pendidikan";

/**
 * Form Pengaturan Satuan Pendidikan — operational defaults (Tahun Ajaran,
 * Semester, zona waktu, Preferensi Cetak). Server-rendered (no "use client");
 * the form posts directly to {@link simpanPengaturanSatuanPendidikanAction},
 * which re-validates tenancy + role server-side.
 *
 * Checkboxes are sent as `"on"` when checked (HTML default) and omitted when
 * unchecked; the server action coerces both to booleans. We rely on
 * `defaultChecked` so the form is fully uncontrolled and stays server-friendly.
 *
 * When `readOnly` is set (non-admin Pengguna), every field renders `disabled`
 * and no submit control is exposed.
 */
export interface FormPengaturanProps {
  values: ProfilDanPengaturanRow;
  readOnly?: boolean;
}

// Lowercase canonical values (DB CHECK constraint, see 0003_rombongan_belajar.sql);
// Bahasa labels are capitalized for display.
const SEMESTER_OPTIONS = [
  { value: "ganjil", label: "Ganjil" },
  { value: "genap", label: "Genap" },
] as const;
const PAPER_SIZE_OPTIONS = ["a4", "f4"] as const;

export function FormPengaturan({
  values,
  readOnly = false,
}: FormPengaturanProps) {
  return (
    <form action={simpanPengaturanSatuanPendidikanAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="pengaturan-tahunAjaran" className="text-sm font-medium">
            Tahun Ajaran Aktif
          </label>
          <input
            id="pengaturan-tahunAjaran"
            name="tahunAjaran"
            type="text"
            required
            placeholder="2026/2027"
            disabled={readOnly}
            defaultValue={values.tahunAjaranAktif ?? ""}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-offset-background transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pengaturan-semester" className="text-sm font-medium">
            Semester Aktif
          </label>
          <select
            id="pengaturan-semester"
            name="semester"
            disabled={readOnly}
            defaultValue={values.semesterAktif ?? "ganjil"}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-offset-background transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {SEMESTER_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pengaturan-zonaWaktu" className="text-sm font-medium">
            Zona Waktu
          </label>
          <input
            id="pengaturan-zonaWaktu"
            name="zonaWaktu"
            type="text"
            disabled={readOnly}
            defaultValue={values.zonaWaktu || "Asia/Jakarta"}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-offset-background transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="pengaturan-cetakPaperSize"
            className="text-sm font-medium"
          >
            Ukuran Kertas Cetak
          </label>
          <select
            id="pengaturan-cetakPaperSize"
            name="cetakPaperSize"
            disabled={readOnly}
            defaultValue={values.cetakPaperSize || "a4"}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm ring-offset-background transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {PAPER_SIZE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-center gap-2">
          <input
            id="pengaturan-cetakTampilkanLogo"
            name="cetakTampilkanLogo"
            type="checkbox"
            disabled={readOnly}
            defaultChecked={values.cetakTampilkanLogo}
            className="h-4 w-4 rounded border-input accent-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
          <label
            htmlFor="pengaturan-cetakTampilkanLogo"
            className="text-sm font-medium"
          >
            Tampilkan Logo di Cetak
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="pengaturan-cetakTampilkanHeader"
            name="cetakTampilkanHeader"
            type="checkbox"
            disabled={readOnly}
            defaultChecked={values.cetakTampilkanHeader}
            className="h-4 w-4 rounded border-input accent-accent disabled:cursor-not-allowed disabled:opacity-60"
          />
          <label
            htmlFor="pengaturan-cetakTampilkanHeader"
            className="text-sm font-medium"
          >
            Tampilkan Kop Surat di Cetak
          </label>
        </div>
      </div>

      {readOnly ? (
        <p className="text-xs italic text-muted-foreground">
          Anda hanya dapat melihat (Peran Akses tidak mengizinkan ubah).
        </p>
      ) : (
        <Button type="submit">Simpan Pengaturan</Button>
      )}
    </form>
  );
}
