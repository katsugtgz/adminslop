import { getDb, withTenant } from "@/db/client";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarPesertaDidik } from "@/components/peserta-didik/daftar-peserta-didik";
import { FormTambah } from "@/components/peserta-didik/form-tambah";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { PageReveal } from "@/components/motion";

import {
  simpanPesertaDidikBaruAction,
  ubahStatusPesertaDidikAction,
} from "./actions";
import { type StyleWithVars } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Peserta Didik — server-rendered student roster for the active Satuan
 * Pendidikan.
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T6 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` → mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("peserta_didik:baca")` → PembatasanAkses, and NO tenant data is
 *     loaded (no leak). Every teaching role (guru / wali_kelas /
 *     kepala_sekolah) has `peserta_didik:baca` by default.
 *   - `baca` but not `buat`+`ubah` (guru / wali_kelas / kepala_sekolah) →
 *     read-only list, no forms.
 *   - `buat` AND `ubah` (admin / dev) → full list + create form + per-row
 *     status form.
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
  // Page-level visibility gate: those without peserta_didik:baca see nothing.
  if (!akses.boleh("peserta_didik:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehTulis =
    akses.boleh("peserta_didik:buat").diizinkan &&
    akses.boleh("peserta_didik:ubah").diizinkan;

  const { db } = getDb();
  const peserta = await withTenant(db, akses.membership.orgId, async (tx) =>
    listPesertaDidik(tx)
  );

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageReveal
        as="header"
        className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div
          aria-hidden="true"
          className="hero-glow pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-40 blur-3xl"
          style={{ "--glow-opacity": 0.4, "--glow-extent": "70%" } as StyleWithVars}
        />
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
            01 — Peserta Didik
          </p>
          <h1 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Peserta Didik
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
            {bolehTulis ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      {bolehTulis && (
        <PageReveal delay={2}>
          <FormTambah action={simpanPesertaDidikBaruAction} />
        </PageReveal>
      )}

      <PageReveal delay={3} className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="font-mono text-[0.7rem] font-medium text-accent">
            02
          </span>
          <span aria-hidden="true" className="h-px w-6 bg-accent/30" />
          <h2 className="font-display text-lg tracking-tight text-foreground sm:text-xl">
            Daftar Peserta Didik
          </h2>
        </div>
        <DaftarPesertaDidik
          peserta={peserta}
          bolehTulis={bolehTulis}
          ubahStatusAction={ubahStatusPesertaDidikAction}
        />
      </PageReveal>
    </div>
  );
}
