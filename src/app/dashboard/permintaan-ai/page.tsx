import { Sparkles } from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import { cariDrafAiByPermintaanBatch } from "@/db/queries/draf-ai";
import { getAtauBuatKuotaAi, type Semester } from "@/db/queries/kuota-ai";
import { listPermintaanAi } from "@/db/queries/permintaan-ai";
import { getSemesterAktif, getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { PageReveal } from "@/components/motion";
import { DaftarPermintaan } from "@/components/permintaan-ai/daftar-permintaan";
import { FormPermintaan } from "@/components/permintaan-ai/form-permintaan";
import { KartuKuota } from "@/components/permintaan-ai/kartu-kuota";

import {
  batalkanPermintaanAiAction,
  buatPermintaanAiAction,
  retryPermintaanAiAction,
  verifikasiDrafAiAction,
} from "./actions";
import { type StyleWithVars } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Permintaan AI + Draf AI management surface (T7, Wave 4 of #12).
 *
 * Visibility is defense-in-depth UI — NOT authorization (identity doc §12; the
 * T7 actions are the authoritative gate). Resolution mirrors the other
 * dashboard pages:
 *   - `denied` / `choose` -> mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("permintaan_ai:baca")` -> PembatasanAkses; NO tenant data loads.
 *   - otherwise the active membership scope drives a single `withTenant` block
 *     that loads the active Tahun Ajaran / Semester, the permintaan list, the
 *     linked drafts, and the kuota.
 *
 * Capability flags gate the rendered UI (the actions re-check each server-side):
 *   - `bolehBuat` (`permintaan_ai:buat`) -> guru + admin/dev: FormPermintaan,
 *     Cancel / Retry buttons.
 *   - `bolehVerifikasi` (`draf_ai:verifikasi`) -> kepala_sekolah + admin/dev:
 *     the AC#3 Setujui / Tolak gate on each menunggu draf.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` (the live WorkOS
 * Keanggotaan) — never from formData (identity doc §13).
 */
export default async function Page() {
  const akses = await getAksesSaya();

  if (akses.status === "denied") {
    return <PembatasanAkses authenticated={akses.authenticated} />;
  }
  if (akses.status === "choose") {
    return <PilihSatuanPendidikan memberships={[...akses.memberships]} />;
  }

  if (!akses.boleh("permintaan_ai:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehBuat = akses.boleh("permintaan_ai:buat").diizinkan;
  const bolehVerifikasi = akses.boleh("draf_ai:verifikasi").diizinkan;

  const { db } = getDb();
  const data = await withTenant(db, akses.membership.orgId, async (tx) => {
    const ta = await getTahunAjaranAktif(tx);
    if (!ta) return null;

    const [semester, permintaanList] = await Promise.all([
      getSemesterAktif(tx),
      listPermintaanAi(tx),
    ]);

    const selesaiIds: string[] = [];
    for (const p of permintaanList) {
      if (p.status === "selesai") selesaiIds.push(p.id);
    }
    // PERF-02: single batch query replaces the N+1 Promise.all loop that issued
    // one cariDrafAiByPermintaan per selesai permintaan.
    const drafMap = await cariDrafAiByPermintaanBatch(tx, selesaiIds);

    const kuota = await getAtauBuatKuotaAi(
      tx,
      ta.id,
      (semester ?? "ganjil") as Semester
    );

    return { permintaanList, drafMap, kuota };
  });

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <PageReveal
        as="section"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card shadow-warm"
      >
        <div
          aria-hidden="true"
          className="hero-glow pointer-events-none absolute -right-32 -top-24 h-72 w-72 rounded-full opacity-50 blur-3xl"
          style={{ "--glow-opacity": 0.5, "--glow-extent": "65%" } as StyleWithVars}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1 select-none font-display text-[9rem] leading-none tracking-tighter text-foreground/[0.03] sm:text-[13rem]"
        >
          12
        </span>
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <p className="inline-flex items-center gap-2 eyebrow-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Modul · Permintaan AI
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
            Permintaan AI
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-muted-foreground sm:text-base">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
            {bolehBuat || bolehVerifikasi ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      {data === null ? (
        <PageReveal as="section" delay={2}>
          <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Aktifkan Tahun Ajaran terlebih dahulu untuk mengelola Permintaan AI.
          </p>
        </PageReveal>
      ) : (
        <>
          <PageReveal as="section" delay={2}>
            <KartuKuota kuota={data.kuota} />
          </PageReveal>

          {bolehBuat ? (
            <PageReveal as="section" delay={2}>
              <FormPermintaan action={buatPermintaanAiAction} />
            </PageReveal>
          ) : null}

          <PageReveal as="section" delay={3} className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="eyebrow-accent"
              >
                01
              </span>
              <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
                Daftar Permintaan AI
              </h2>
            </div>
            <DaftarPermintaan
              permintaan={data.permintaanList}
              drafMap={data.drafMap}
              bolehBuat={bolehBuat}
              bolehVerifikasi={bolehVerifikasi}
              batalkanAction={batalkanPermintaanAiAction}
              retryAction={retryPermintaanAiAction}
              verifikasiAction={verifikasiDrafAiAction}
            />
          </PageReveal>
        </>
      )}
    </div>
  );
}
