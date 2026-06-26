import { getDb, withTenant } from "@/db/client";
import { listKontakDarurat, listWali } from "@/db/queries/kontak-peserta-didik";
import { listMutasi } from "@/db/queries/mutasi-peserta-didik";
import {
  cariPesertaDidikById,
  listRiwayatStatus,
} from "@/db/queries/peserta-didik";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarKontakDarurat } from "@/components/peserta-didik/daftar-kontak-darurat";
import { DaftarMutasi } from "@/components/peserta-didik/daftar-mutasi";
import { DaftarRiwayatStatus } from "@/components/peserta-didik/daftar-riwayat-status";
import { DaftarWali } from "@/components/peserta-didik/daftar-wali";
import { FormKontakDarurat } from "@/components/peserta-didik/form-kontak-darurat";
import { FormMutasi } from "@/components/peserta-didik/form-mutasi";
import { FormUbahBiodata } from "@/components/peserta-didik/form-ubah-biodata";
import { FormWali } from "@/components/peserta-didik/form-wali";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  catatMutasiPesertaDidikAction,
  hapusKontakDaruratAction,
  hapusWaliAction,
  tambahKontakDaruratAction,
  tambahWaliAction,
  ubahPesertaDidikAction,
} from "../actions";

export const dynamic = "force-dynamic";

/** Bahasa label for a jenis-kelamin slug (L|P). */
function labelJenisKelamin(jenisKelamin: string): string {
  return jenisKelamin === "L" ? "Laki-laki" : "Perempuan";
}

/**
 * Detail Peserta Didik — server-rendered management surface for a single
 * student. Biodata edit + append-only status history + wali / kontak darurat
 * contact management + mutasi records.
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T6 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` → mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("peserta_didik:baca")` → PembatasanAkses (no tenant data leaks).
 *   - `!boleh("peserta_didik:ubah")` (guru / wali_kelas / kepala_sekolah) →
 *     read-only biodata + lists visible; NO tambah/hapus forms. The riwayat is
 *     audit data and stays visible even to read-only viewers.
 *   - `boleh("peserta_didik:ubah")` (admin / dev) → full edit forms.
 *
 * A missing / cross-tenant-invisible id (`cariPesertaDidikById` returns null
 * under RLS) renders a "tidak ditemukan" message rather than the detail surface.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` (the live WorkOS
 * Keanggotaan) — never from the client (§13). Next.js 15: `params` is a Promise.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
  if (!akses.boleh("peserta_didik:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehTulis = akses.boleh("peserta_didik:ubah").diizinkan;
  const { db } = getDb();

  const data = await withTenant(db, akses.membership.orgId, async (tx) => {
    const peserta = await cariPesertaDidikById(tx, id);
    if (!peserta) return null;
    const [riwayat, wali, kontak, mutasi] = await Promise.all([
      listRiwayatStatus(tx, id),
      listWali(tx, id),
      listKontakDarurat(tx, id),
      listMutasi(tx, id),
    ]);
    return { peserta, riwayat, wali, kontak, mutasi };
  });

  if (!data) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">
          Peserta Didik tidak ditemukan.
        </h1>
        <p className="text-sm text-muted-foreground">
          Peserta Didik mungkin tidak ada di Satuan Pendidikan Aktif ini.
        </p>
      </section>
    );
  }

  const { peserta, riwayat, wali, kontak, mutasi } = data;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Detail Peserta Didik</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehTulis ? "" : " (hanya baca)"}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Biodata</h2>
        {bolehTulis ? (
          <FormUbahBiodata action={ubahPesertaDidikAction} values={peserta} />
        ) : (
          <dl className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                Nama
              </dt>
              <dd className="text-sm font-semibold">{peserta.nama}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                NISN
              </dt>
              <dd className="text-sm">{peserta.nisn ? peserta.nisn : "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                NIS
              </dt>
              <dd className="text-sm">{peserta.nis ? peserta.nis : "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                Tanggal Lahir
              </dt>
              <dd className="text-sm">{peserta.tanggalLahir}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                Jenis Kelamin
              </dt>
              <dd className="text-sm">
                {labelJenisKelamin(peserta.jenisKelamin)}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Riwayat Status</h2>
        <DaftarRiwayatStatus riwayat={riwayat} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Wali</h2>
        {bolehTulis && (
          <FormWali action={tambahWaliAction} pesertaDidikId={peserta.id} />
        )}
        <DaftarWali
          wali={wali}
          bolehTulis={bolehTulis}
          hapusAction={hapusWaliAction}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Kontak Darurat</h2>
        {bolehTulis && (
          <FormKontakDarurat
            action={tambahKontakDaruratAction}
            pesertaDidikId={peserta.id}
          />
        )}
        <DaftarKontakDarurat
          kontak={kontak}
          bolehTulis={bolehTulis}
          hapusAction={hapusKontakDaruratAction}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Mutasi</h2>
        {bolehTulis && (
          <FormMutasi
            action={catatMutasiPesertaDidikAction}
            pesertaDidikId={peserta.id}
          />
        )}
        <DaftarMutasi mutasi={mutasi} />
      </div>
    </section>
  );
}
