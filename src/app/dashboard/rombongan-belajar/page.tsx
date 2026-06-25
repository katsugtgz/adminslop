import Link from "next/link";

import { getDb, withTenant } from "@/db/client";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { listRombonganBelajar } from "@/db/queries/rombongan-belajar";
import { getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import { listTingkat } from "@/db/queries/tingkat";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarRombonganBelajar } from "@/components/rombongan-belajar/daftar-rombongan-belajar";
import { DaftarTingkat } from "@/components/rombongan-belajar/daftar-tingkat";
import { FormRombonganBelajarBaru } from "@/components/rombongan-belajar/form-rombongan-belajar-baru";
import { FormTempatkanPesertaDidik } from "@/components/rombongan-belajar/form-tempatkan-peserta-didik";
import { FormTingkatBaru } from "@/components/rombongan-belajar/form-tingkat-baru";
import { KontrolProgresi } from "@/components/rombongan-belajar/kontrol-progresi";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  kenaikanTingkatAction,
  simpanRombonganBelajarBaruAction,
  simpanTingkatBaruAction,
  tempatkanPesertaDidikAction,
  tinggalTingkatAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Manajemen Rombongan Belajar — server-rendered management surface for the
 * active Satuan Pendidikan: tingkat (grade levels), rombongan belajar
 * (classes), penempatan (placement), and kenaikan/tinggal (progression).
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T9 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` → mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("rombongan_belajar:baca")` → PembatasanAkses, and NO tenant data
 *     is loaded (no leak). Every teaching role (guru / wali_kelas /
 *     kepala_sekolah) has `:baca` by default.
 *   - `:baca` but `!:buat` / `!:kelola_penempatan` (guru / wali_kelas /
 *     kepala_sekolah) → read-only lists, no forms.
 *   - `:buat` (admin / dev) → create forms (Tingkat + Rombongan Belajar).
 *   - `:kelola_penempatan` (admin / dev) + active TA → placement + progression
 *     controls. Without an active TA, a notice replaces them (placement needs a
 *     current class context — AC#4).
 *
 * AC#4 (derived context): the active Tahun Ajaran + semester are resolved
 * SERVER-SIDE by the actions; they are NEVER read from formData. Tenant scope
 * is derived ONLY from `akses.membership.orgId` — never from formData (§13).
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
  // Page-level visibility gate: those without `rombongan_belajar:baca` see
  // nothing — and crucially, NO tenant data is loaded (no leak).
  if (!akses.boleh("rombongan_belajar:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehBuat = akses.boleh("rombongan_belajar:buat").diizinkan;
  const bolehKelola = akses.boleh(
    "rombongan_belajar:kelola_penempatan"
  ).diizinkan;

  const { db } = getDb();

  const { tingkat, rombel, taAktif, peserta } = await withTenant(
    db,
    akses.membership.orgId,
    async (tx) => {
      const [daftarTingkat, daftarRombel, ta, daftarPeserta] =
        await Promise.all([
          listTingkat(tx),
          listRombonganBelajar(tx),
          getTahunAjaranAktif(tx),
          listPesertaDidik(tx),
        ]);
      return {
        tingkat: daftarTingkat,
        rombel: daftarRombel,
        taAktif: ta,
        peserta: daftarPeserta,
      };
    }
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Rombongan Belajar</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehBuat ? "" : " (hanya baca)"}
        </p>
      </header>

      {bolehBuat && (
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap">
          <FormTingkatBaru action={simpanTingkatBaruAction} />
          <FormRombonganBelajarBaru
            action={simpanRombonganBelajarBaruAction}
            tingkat={tingkat}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Daftar Tingkat</h2>
        <DaftarTingkat tingkat={tingkat} bolehBuat={bolehBuat} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Daftar Rombongan Belajar
        </h2>
        <DaftarRombonganBelajar rombel={rombel} bolehBuat={bolehBuat} />
      </div>

      {bolehKelola &&
        (taAktif ? (
          <div className="flex flex-col gap-6">
            <FormTempatkanPesertaDidik
              action={tempatkanPesertaDidikAction}
              peserta={peserta}
              rombel={rombel}
            />
            <KontrolProgresi
              kenaikanAction={kenaikanTingkatAction}
              tinggalAction={tinggalTingkatAction}
              peserta={peserta}
            />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            Aktifkan Tahun Ajaran terlebih dahulu.{" "}
            <Link
              href="/dashboard/tahun-ajaran"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Kelola Tahun Ajaran
            </Link>
            .
          </p>
        ))}
    </section>
  );
}
