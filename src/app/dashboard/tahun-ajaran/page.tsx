import { CalendarDays } from "lucide-react";

import { PageReveal } from "@/components/motion";
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
    return <PembatasanAkses authenticated={akses.authenticated} />;
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
        listTahunAjaran(tx, 200),
        getSemesterAktif(tx),
      ]);
      return { tahunAjaran: daftarTa, semester: sem };
    }
  );

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <PageReveal
        as="header"
        className="relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-2 select-none font-display text-[10rem] leading-none tracking-tighter text-foreground/[0.03] sm:text-[13rem] md:right-8 md:text-[16rem]"
        >
          03
        </span>
        <div className="relative px-5 py-8 sm:px-8 sm:py-10 md:px-10">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Kalender Akademik
          </p>
          <h1 className="mt-4 font-display text-3xl tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Tahun Ajaran
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-muted-foreground sm:text-base md:text-lg">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
            {bolehKelola ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      {bolehKelola && (
        <PageReveal className="flex flex-col gap-4 lg:flex-row lg:flex-wrap">
          <FormTahunAjaranBaru action={simpanTahunAjaranBaruAction} />
          <KontrolSemester
            action={ubahSemesterAktifAction}
            semesterAktif={semester}
          />
        </PageReveal>
      )}

      <PageReveal className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="eyebrow-accent">
            01 — Riwayat
          </p>
          <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
            Daftar Tahun Ajaran
          </h2>
        </div>
        <DaftarTahunAjaran
          tahunAjaran={tahunAjaran}
          bolehKelola={bolehKelola}
          action={aktifkanTahunAjaranAction}
        />
      </PageReveal>
    </div>
  );
}
