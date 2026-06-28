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
import { PageReveal } from "@/components/motion";

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
  const [{ id }, akses] = await Promise.all([params, getAksesSaya()]);

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
      <PageReveal
        as="section"
        className="relative mx-auto flex max-w-md flex-col items-center gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card p-8 text-center text-card-foreground shadow-warm md:p-10"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.16 42 / 0.3) 0%, transparent 70%)",
          }}
        />
        <p className="relative font-mono text-xs uppercase tracking-[0.22em] text-accent">
          404
        </p>
        <h1 className="relative font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Peserta Didik tidak ditemukan.
        </h1>
        <p className="relative text-sm text-muted-foreground">
          Peserta Didik mungkin tidak ada di Satuan Pendidikan Aktif ini.
        </p>
      </PageReveal>
    );
  }

  const { peserta, riwayat, wali, kontak, mutasi } = data;

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageReveal
        as="header"
        className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.16 42 / 0.4) 0%, transparent 70%)",
          }}
        />
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
            01 — Peserta Didik · Detail
          </p>
          <h1 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Detail Peserta Didik
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
            {bolehTulis ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      <PageReveal delay={2} className="flex flex-col gap-3">
        <SectionLabel nomor="01">Biodata</SectionLabel>
        {bolehTulis ? (
          <FormUbahBiodata action={ubahPesertaDidikAction} values={peserta} />
        ) : (
          <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                Nama
              </dt>
              <dd className="text-sm font-semibold">{peserta.nama}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                NISN
              </dt>
              <dd className="text-sm">{peserta.nisn ? peserta.nisn : "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                NIS
              </dt>
              <dd className="text-sm">{peserta.nis ? peserta.nis : "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                Tanggal Lahir
              </dt>
              <dd className="text-sm">{peserta.tanggalLahir}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted-foreground">
                Jenis Kelamin
              </dt>
              <dd className="text-sm">
                {labelJenisKelamin(peserta.jenisKelamin)}
              </dd>
            </div>
          </dl>
        )}
      </PageReveal>

      <PageReveal delay={3} className="flex flex-col gap-3">
        <SectionLabel nomor="02">Riwayat Status</SectionLabel>
        <DaftarRiwayatStatus riwayat={riwayat} />
      </PageReveal>

      <PageReveal delay={4} className="flex flex-col gap-3">
        <SectionLabel nomor="03">Wali</SectionLabel>
        {bolehTulis && (
          <FormWali action={tambahWaliAction} pesertaDidikId={peserta.id} />
        )}
        <DaftarWali
          wali={wali}
          bolehTulis={bolehTulis}
          hapusAction={hapusWaliAction}
        />
      </PageReveal>

      <PageReveal delay={5} className="flex flex-col gap-3">
        <SectionLabel nomor="04">Kontak Darurat</SectionLabel>
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
      </PageReveal>

      <PageReveal delay={6} className="flex flex-col gap-3">
        <SectionLabel nomor="05">Mutasi</SectionLabel>
        {bolehTulis && (
          <FormMutasi
            action={catatMutasiPesertaDidikAction}
            pesertaDidikId={peserta.id}
          />
        )}
        <DaftarMutasi mutasi={mutasi} />
      </PageReveal>
    </div>
  );
}

function SectionLabel({
  nomor,
  children,
}: {
  nomor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="font-mono text-[0.7rem] font-medium text-accent">
        {nomor}
      </span>
      <span aria-hidden="true" className="h-px w-6 bg-accent/30" />
      <h2 className="font-display text-lg tracking-tight text-foreground sm:text-xl">
        {children}
      </h2>
    </div>
  );
}
