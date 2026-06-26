import { getDb, withTenant } from "@/db/client";
import { listRevisiByEraport, listDrafEraport } from "@/db/queries/eraport";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { getSemesterAktif, getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { DaftarEraport } from "@/components/eraport/daftar-eraport";
import { FormDrafEraport } from "@/components/eraport/form-draf";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

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

    const semester = await getSemesterAktif(tx);
    const daftarPesertaDidik = await listPesertaDidik(tx);
    const daftarEraport = await listDrafEraport(tx);

    // peserta_didik id -> row map for name resolution in the list.
    const pesertaMap = new Map(daftarPesertaDidik.map((p) => [p.id, p]));

    // Revision history per eraport (append-only, newest-first). Only needed
    // for the detail expansion; load for every eraport in one pass.
    const revisiMap = new Map<
      string,
      { alasan: string; dibuatPada: Date; dibuatOleh: string | null }[]
    >();
    for (const e of daftarEraport) {
      const rows = await listRevisiByEraport(tx, e.id);
      revisiMap.set(
        e.id,
        rows.map((r) => ({
          alasan: r.alasan,
          dibuatPada: r.dibuatPada,
          dibuatOleh: r.dibuatOleh,
        }))
      );
    }

    return { semester, daftarPesertaDidik, daftarEraport, pesertaMap, revisiMap };
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">E-Raport</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehBuat || bolehTerbit || bolehRevisi ? "" : " (hanya baca)"}
        </p>
      </header>

      {data === null ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Aktifkan Tahun Ajaran terlebih dahulu untuk mengelola E-Raport.
        </p>
      ) : (
        <>
          {bolehBuat ? (
            <FormDrafEraport
              daftarPesertaDidik={data.daftarPesertaDidik}
              action={buatDrafEraportAction}
            />
          ) : null}

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Draf E-Raport</h2>
            <DaftarEraport
              eraport={data.daftarEraport}
              pesertaMap={data.pesertaMap}
              revisiMap={data.revisiMap}
              bolehTerbit={bolehTerbit}
              bolehRevisi={bolehRevisi}
              terbitAction={terbitkanEraportAction}
              revisiAction={catatRevisiEraportAction}
            />
          </div>
        </>
      )}
    </section>
  );
}
