import { getDb, withTenant } from "@/db/client";
import { cariDrafAiByPermintaan } from "@/db/queries/draf-ai";
import { getAtauBuatKuotaAi, type Semester } from "@/db/queries/kuota-ai";
import { listPermintaanAi } from "@/db/queries/permintaan-ai";
import { getSemesterAktif, getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import type { DrafAi } from "@/db/schema";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { DaftarPermintaan } from "@/components/permintaan-ai/daftar-permintaan";
import { FormPermintaan } from "@/components/permintaan-ai/form-permintaan";
import { KartuKuota } from "@/components/permintaan-ai/kartu-kuota";

import {
  batalkanPermintaanAiAction,
  buatPermintaanAiAction,
  retryPermintaanAiAction,
  verifikasiDrafAiAction,
} from "./actions";

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
    return <PembatasanAkses />;
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

    const semester = await getSemesterAktif(tx);
    const permintaanList = await listPermintaanAi(tx);

    const drafMap = new Map<string, DrafAi>();
    for (const p of permintaanList) {
      if (p.status === "selesai") {
        const draf = await cariDrafAiByPermintaan(tx, p.id);
        if (draf) drafMap.set(p.id, draf);
      }
    }

    const kuota = await getAtauBuatKuotaAi(
      tx,
      ta.id,
      (semester ?? "ganjil") as Semester
    );

    return { permintaanList, drafMap, kuota };
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Permintaan AI</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehBuat || bolehVerifikasi ? "" : " (hanya baca)"}
        </p>
      </header>

      {data === null ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Aktifkan Tahun Ajaran terlebih dahulu untuk mengelola Permintaan AI.
        </p>
      ) : (
        <>
          <KartuKuota kuota={data.kuota} />

          {bolehBuat ? <FormPermintaan action={buatPermintaanAiAction} /> : null}

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Daftar Permintaan AI
            </h2>
            <DaftarPermintaan
              permintaan={data.permintaanList}
              drafMap={data.drafMap}
              bolehBuat={bolehBuat}
              bolehVerifikasi={bolehVerifikasi}
              batalkanAction={batalkanPermintaanAiAction}
              retryAction={retryPermintaanAiAction}
              verifikasiAction={verifikasiDrafAiAction}
            />
          </div>
        </>
      )}
    </section>
  );
}
