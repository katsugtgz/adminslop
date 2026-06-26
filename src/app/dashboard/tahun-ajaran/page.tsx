import { getDb, withTenant } from "@/db/client";
import { getSemesterAktif, listTahunAjaran } from "@/db/queries/tahun-ajaran";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarTahunAjaran } from "@/components/tahun-ajaran/daftar-tahun-ajaran";
import { FormTahunAjaranBaru } from "@/components/tahun-ajaran/form-tahun-ajaran-baru";
import { KontrolSemester } from "@/components/tahun-ajaran/kontrol-semester";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  aktifkanTahunAjaranAction,
  simpanTahunAjaranBaruAction,
  ubahSemesterAktifAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Manajemen Tahun Ajaran — server-rendered management surface for the active
 * Satuan Pendidikan.
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T8 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` → mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("tahun_ajaran:baca")` (guru / wali_kelas) → PembatasanAkses, and
 *     NO tenant data is loaded (no leak).
 *   - `boleh("tahun_ajaran:baca")` but `!boleh("tahun_ajaran:kelola")`
 *     (kepala_sekolah) → read-only list, no management forms.
 *   - `boleh("tahun_ajaran:kelola")` (admin / dev) → full management forms.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` (the live WorkOS
 * Keanggotaan) — never from formData (§13).
 */
export default async function Page() {
  const akses = await getAksesSaya();

  if (akses.status === "denied") {
    return <PembatasanAkses />;
  }
  if (akses.status === "choose") {
    return (
      <PilihSatuanPendidikan memberships={[...akses.memberships]} />
    );
  }

  // akses.status === "active"
  // Page-level visibility gate: those without `tahun_ajaran:baca` see nothing.
  if (!akses.boleh("tahun_ajaran:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehKelola = akses.boleh("tahun_ajaran:kelola").diizinkan;
  const { db } = getDb();

  const { tahunAjaran, semester } = await withTenant(
    db,
    akses.membership.orgId,
    async (tx) => {
      const [daftarTa, sem] = await Promise.all([
        listTahunAjaran(tx),
        getSemesterAktif(tx),
      ]);
      return { tahunAjaran: daftarTa, semester: sem };
    }
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Tahun Ajaran</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehKelola ? "" : " (hanya baca)"}
        </p>
      </header>

      {bolehKelola && (
        <>
          <FormTahunAjaranBaru action={simpanTahunAjaranBaruAction} />
          <KontrolSemester
            action={ubahSemesterAktifAction}
            semesterAktif={semester}
          />
        </>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Daftar Tahun Ajaran</h2>
        <DaftarTahunAjaran
          tahunAjaran={tahunAjaran}
          bolehKelola={bolehKelola}
          action={aktifkanTahunAjaranAction}
        />
      </div>
    </section>
  );
}
