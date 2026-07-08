import Link from "next/link";
import { CalendarDays, Layers } from "lucide-react";

import { PageReveal } from "@/components/motion";
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
    return <PembatasanAkses authenticated={akses.authenticated} />;
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
  // SECURITY (cubic P1): the student roster is gated by its OWN slug,
  // peserta_didik:baca — not by rombongan_belajar:baca. An admin with a
  // pembatasan on peserta_didik:baca must NOT see any student data here, even
  // though they still hold rombongan_belajar:kelola_penempatan. When denied,
  // the roster is never loaded (no leak) and the placement / progression
  // controls — which need the roster — are hidden too.
  const bolehBacaPeserta = akses.boleh("peserta_didik:baca").diizinkan;

  const { db } = getDb();

  const { tingkat, rombel, taAktif, peserta } = await withTenant(
    db,
    akses.membership.orgId,
    async (tx) => {
      const [daftarTingkat, daftarRombel, ta, daftarPeserta] =
        await Promise.all([
          listTingkat(tx),
          listRombonganBelajar(tx, undefined, 500),
          getTahunAjaranAktif(tx),
          // Roster only when peserta_didik:baca is held; otherwise skip the
          // query entirely so no student row crosses the boundary.
          bolehBacaPeserta ? listPesertaDidik(tx, 500) : Promise.resolve([]),
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
    <div className="flex flex-col gap-10 md:gap-12">
      <PageReveal
        as="header"
        className="relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-2 select-none font-display text-[10rem] leading-none tracking-tighter text-foreground/[0.03] sm:text-[13rem] md:right-8 md:text-[16rem]"
        >
          02
        </span>
        <div className="relative px-5 py-8 sm:px-8 sm:py-10 md:px-10">
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Manajemen Satuan
          </p>
          <h1 className="mt-4 font-display text-3xl tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Rombongan Belajar
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-muted-foreground sm:text-base md:text-lg">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
            {bolehBuat ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      {bolehBuat && (
        <PageReveal
          id="form-rombongan-belajar"
          className="flex flex-col gap-4 lg:flex-row lg:flex-wrap"
        >
          <FormTingkatBaru action={simpanTingkatBaruAction} />
          <FormRombonganBelajarBaru
            action={simpanRombonganBelajarBaruAction}
            tingkat={tingkat}
          />
        </PageReveal>
      )}

      <PageReveal className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            01 — Tingkat
          </p>
          <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
            Daftar Tingkat
          </h2>
        </div>
        <DaftarTingkat tingkat={tingkat} bolehBuat={bolehBuat} />
      </PageReveal>

      <PageReveal className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            02 — Kelas
          </p>
          <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
            Daftar Rombongan Belajar
          </h2>
        </div>
        <DaftarRombonganBelajar rombel={rombel} bolehBuat={bolehBuat} />
      </PageReveal>

      {bolehKelola &&
        bolehBacaPeserta &&
        (taAktif ? (
          <PageReveal className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
                03 — Penempatan
              </p>
              <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
                Penempatan &amp; Progresi
              </h2>
            </div>
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
          </PageReveal>
        ) : (
          <PageReveal>
            <p className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/40 p-6 sm:flex-row sm:items-center sm:gap-4 sm:text-center">
              <CalendarDays
                className="h-5 w-5 shrink-0 text-accent"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">
                Aktifkan Tahun Ajaran terlebih dahulu.{" "}
                <Link
                  href="/dashboard/tahun-ajaran"
                  className="font-medium text-accent underline-offset-4 hover:underline"
                >
                  Kelola Tahun Ajaran
                </Link>
                .
              </span>
            </p>
          </PageReveal>
        ))}
    </div>
  );
}
