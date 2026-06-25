import { simpanProfilSatuanPendidikanAction } from "@/app/dashboard/pengaturan/actions";
import { Button } from "@/components/ui/button";
import type { ProfilDanPengaturanRow } from "@/db/queries/satuan-pendidikan";

/**
 * Form Profil Satuan Pendidikan — identitas resmi (nama, NPSN, jenjang,
 * alamat, Kepala Satuan Pendidikan, logo). Server-rendered (no "use client");
 * the form posts directly to {@link simpanProfilSatuanPendidikanAction}, which
 * re-validates tenancy + role server-side. Client-side validation is
 * intentionally omitted — zod handles it.
 *
 * When `readOnly` is set (non-admin Pengguna), every field renders `disabled`
 * so users still SEE the data (A11Y), and no submit control is exposed.
 */
export interface FormProfilProps {
  values: ProfilDanPengaturanRow;
  readOnly?: boolean;
}

const JENJANG_OPTIONS = ["SD", "SMP", "SMA", "SMK", "MA"] as const;

export function FormProfil({ values, readOnly = false }: FormProfilProps) {
  return (
    <form action={simpanProfilSatuanPendidikanAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="profil-nama" className="text-sm font-medium">
          Nama Satuan Pendidikan
        </label>
        <input
          id="profil-nama"
          name="nama"
          type="text"
          required
          disabled={readOnly}
          defaultValue={values.nama}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profil-npsn" className="text-sm font-medium">
          NPSN
        </label>
        <input
          id="profil-npsn"
          name="npsn"
          type="text"
          inputMode="numeric"
          maxLength={8}
          disabled={readOnly}
          defaultValue={values.npsn ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profil-jenjang" className="text-sm font-medium">
          Jenjang
        </label>
        <select
          id="profil-jenjang"
          name="jenjang"
          disabled={readOnly}
          defaultValue={values.jenjang ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {JENJANG_OPTIONS.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profil-alamat" className="text-sm font-medium">
          Alamat
        </label>
        <textarea
          id="profil-alamat"
          name="alamat"
          disabled={readOnly}
          defaultValue={values.alamat ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="profil-namaKepala"
          className="text-sm font-medium"
        >
          Nama Kepala Satuan Pendidikan
        </label>
        <input
          id="profil-namaKepala"
          name="namaKepala"
          type="text"
          disabled={readOnly}
          defaultValue={values.namaKepala ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="profil-logoUrl" className="text-sm font-medium">
          URL Logo
        </label>
        <input
          id="profil-logoUrl"
          name="logoUrl"
          type="url"
          disabled={readOnly}
          defaultValue={values.logoUrl ?? ""}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="text-xs text-muted-foreground">
          Cosongkan jika tidak ada.
        </p>
      </div>

      {readOnly ? (
        <p className="text-xs italic text-muted-foreground">
          Anda hanya dapat melihat (Peran Akses tidak mengizinkan ubah).
        </p>
      ) : (
        <Button type="submit">Simpan Profil</Button>
      )}
    </form>
  );
}
