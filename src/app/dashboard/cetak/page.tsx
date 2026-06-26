import Link from "next/link";

import { getDb, withTenant } from "@/db/client";
import { listDokumenCetak, listTemplateCetak } from "@/db/queries/cetak";
import { listDrafEraport } from "@/db/queries/eraport";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { DaftarTemplateCetak } from "@/components/cetak/daftar-template";
import { FormTemplateCetak } from "@/components/cetak/form-template";
import { KontrolCetak, type OpsiEraport } from "@/components/cetak/kontrol-cetak";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { Button } from "@/components/ui/button";

import { buatDokumenCetakAction, buatTemplateCetakAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Cetak management surface (#14). Visibility is defense-in-depth UI — NOT
 * authorization (identity doc §12; the actions are the authoritative gate).
 * Resolution mirrors the other dashboard pages:
 *   - `denied` / `choose` -> mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("cetak:baca")` -> PembatasanAkses; NO tenant data loads.
 *   - otherwise the active membership scope drives a single `withTenant` block
 *     that loads templates, dokumen_cetak, the TERBIT E-Raports (printable), and
 *     the peserta_didik list (for printable-row labels).
 *
 * Capability flags gate the rendered UI (the actions re-check each server-side):
 *   - `bolehBuat` (`cetak:buat`) -> FormTemplateCetak + KontrolCetak.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` — never formData.
 */
export default async function Page() {
  const akses = await getAksesSaya();

  if (akses.status === "denied") {
    return <PembatasanAkses />;
  }
  if (akses.status === "choose") {
    return <PilihSatuanPendidikan memberships={[...akses.memberships]} />;
  }

  if (!akses.boleh("cetak:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehBuat = akses.boleh("cetak:buat").diizinkan;

  const { db } = getDb();
  const data = await withTenant(db, akses.membership.orgId, async (tx) => {
    const [templates, dokumen, eraportTerbit, daftarPesertaDidik] =
      await Promise.all([
        listTemplateCetak(tx),
        listDokumenCetak(tx),
        listDrafEraport(tx, { status: "terbit" }),
        listPesertaDidik(tx),
      ]);

    const pesertaMap = new Map(daftarPesertaDidik.map((p) => [p.id, p.nama]));
    const eraportOptions: OpsiEraport[] = eraportTerbit.map((e) => ({
      id: e.id,
      label: `${pesertaMap.get(e.pesertaDidikId) ?? e.pesertaDidikId} · ${e.semester}`,
    }));

    return { templates, dokumen, eraportTerbit, eraportOptions };
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Cetak</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehBuat ? "" : " (hanya baca)"}
        </p>
      </header>

      {bolehBuat ? <FormTemplateCetak action={buatTemplateCetakAction} /> : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Template Cetak</h2>
        <DaftarTemplateCetak templates={data.templates} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Pratinjau Cetak</h2>
        {data.eraportTerbit.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            Belum ada E-Raport Terbit untuk dicetak.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.eraportTerbit.map((e) => {
              const nama =
                data.eraportOptions.find((o) => o.id === e.id)?.label ?? e.id;
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
                >
                  <span className="text-sm font-medium">{nama}</span>
                  <Link href={`/dashboard/cetak/pratinjau/${e.id}`}>
                    <Button type="button" variant="outline" size="sm">
                      Pratinjau
                    </Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {bolehBuat ? (
        <KontrolCetak
          eraportOptions={data.eraportOptions}
          templateOptions={data.templates}
          action={buatDokumenCetakAction}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Dokumen Cetak</h2>
        {data.dokumen.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            Belum ada Dokumen Cetak.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.dokumen.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  Format: {d.format.toUpperCase()}
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {d.tandaTanganNama ?? "Tanpa Tanda Tangan"}
                  </span>
                </span>
                <Link href={`/dashboard/cetak/pratinjau/${d.drafEraportId}`}>
                  <Button type="button" variant="outline" size="sm">
                    Pratinjau
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
