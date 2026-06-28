import { getDb, withTenant } from "@/db/client";
import { listRevisiByEraport, listDrafEraport } from "@/db/queries/eraport";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { getSemesterAktif, getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { DaftarEraport } from "@/components/eraport/daftar-eraport";
import { FormDrafEraport } from "@/components/eraport/form-draf";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { PageReveal } from "@/components/motion";

import {
  buatDrafEraportAction,
  catatRevisiEraportAction,
  terbitkanEraportAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * E-Raport management surface (Wave 4 of #13).
 *
 * Visibility is defense-in-depth UI — NOT authorization (identity doc §12; the
 * actions are the authoritative gate). Resolution mirrors the other dashboard
 * pages:
 *   - `denied` / `choose` -> mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("eraport:baca")` -> PembatasanAkses; NO tenant data loads.
 *   - otherwise the active membership scope drives a single `withTenant` block
 *     that loads the active Tahun Ajaran / Semester, the peserta_didik list
 *     (for the create form), the draf_eraport list, and the revision history.
 *
 * Capability flags gate the rendered UI (the actions re-check each server-side):
 *   - `bolehBuat` (`eraport:buat`) -> guru + admin/dev: FormDrafEraport.
 *   - `bolehTerbit` (`eraport:terbit`) -> kepala_sekolah + admin/dev: the
 *     "Terbitkan" button on each non-terbit draf.
 *   - `bolehRevisi` (`eraport:revisi`) -> admin/dev: the Revisi form + detail.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` (the live WorkOS
 * Keanggotaan) — never from formData (identity doc §13).
 */
export default async function Page() {
  const akses = await getAksesSaya();

  if (akses.status === "denied") {
    return <PembatasanAkses />;
  }
  if (akses.status === "choose") {
    return <PilihSatuanPendidikan memberships={[...akses.memberships]} />;
  }

  if (!akses.boleh("eraport:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehBuat = akses.boleh("eraport:buat").diizinkan;
  const bolehTerbit = akses.boleh("eraport:terbit").diizinkan;
  const bolehRevisi = akses.boleh("eraport:revisi").diizinkan;

  const { db } = getDb();
  const data = await withTenant(db, akses.membership.orgId, async (tx) => {
    const ta = await getTahunAjaranAktif(tx);
    if (!ta) return null;

    const [semester, daftarPesertaDidik, daftarEraport] = await Promise.all([
      getSemesterAktif(tx),
      listPesertaDidik(tx),
      listDrafEraport(tx),
    ]);

    // peserta_didik id -> row map for name resolution in the list.
    const pesertaMap = new Map(daftarPesertaDidik.map((p) => [p.id, p]));

    // Revision history per eraport (append-only, newest-first). Only needed
    // for the detail expansion; load for every eraport in one pass.
    const revisiEntries = await Promise.all(
      daftarEraport.map(async (e) => [
        e.id,
        await listRevisiByEraport(tx, e.id),
      ] as const)
    );
    const revisiMap = new Map<
      string,
      { id: string; alasan: string; dibuatPada: Date; dibuatOleh: string | null }[]
    >();
    for (const [eraportId, rows] of revisiEntries) {
      revisiMap.set(
        eraportId,
        rows.map((r) => ({
          id: r.id,
          alasan: r.alasan,
          dibuatPada: r.dibuatPada,
          dibuatOleh: r.dibuatOleh,
        }))
      );
    }

    return { semester, daftarPesertaDidik, daftarEraport, pesertaMap, revisiMap };
  });

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
            03 — E-Raport
          </p>
          <h1 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            E-Raport
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
            {bolehBuat || bolehTerbit || bolehRevisi ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      {data === null ? (
        <PageReveal delay={2}>
          <p className="rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] p-6 text-center text-sm text-muted-foreground">
            Aktifkan Tahun Ajaran terlebih dahulu untuk mengelola E-Raport.
          </p>
        </PageReveal>
      ) : (
        <>
          {bolehBuat ? (
            <PageReveal delay={2}>
              <FormDrafEraport
                daftarPesertaDidik={data.daftarPesertaDidik}
                action={buatDrafEraportAction}
              />
            </PageReveal>
          ) : null}

          <PageReveal delay={3} className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="font-mono text-[0.7rem] font-medium text-accent">
                01
              </span>
              <span aria-hidden="true" className="h-px w-6 bg-accent/30" />
              <h2 className="font-display text-lg tracking-tight text-foreground sm:text-xl">
                Draf E-Raport
              </h2>
            </div>
            <DaftarEraport
              eraport={data.daftarEraport}
              pesertaMap={data.pesertaMap}
              revisiMap={data.revisiMap}
              bolehTerbit={bolehTerbit}
              bolehRevisi={bolehRevisi}
              terbitAction={terbitkanEraportAction}
              revisiAction={catatRevisiEraportAction}
            />
          </PageReveal>
        </>
      )}
    </div>
  );
}
