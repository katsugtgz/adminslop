import Link from "next/link";

import { getDb, withTenant } from "@/db/client";
import { listDokumenCetak, listTemplateCetak } from "@/db/queries/cetak";
import { listDrafEraport } from "@/db/queries/eraport";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { DaftarTemplateCetak } from "@/components/cetak/daftar-template";
import { FormTemplateCetak } from "@/components/cetak/form-template";
import { KontrolCetak, type OpsiEraport } from "@/components/cetak/kontrol-cetak";
import { KosongDenganTautan } from "@/components/kosong-dengan-tautan";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { Button } from "@/components/ui/button";
import { PageReveal } from "@/components/motion";

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
    return <PembatasanAkses authenticated={akses.authenticated} />;
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
        listTemplateCetak(tx, { limit: 200 }),
        listDokumenCetak(tx, { limit: 500 }),
        listDrafEraport(tx, { status: "terbit", limit: 500 }),
        listPesertaDidik(tx, 500),
      ]);

    const pesertaMap = new Map(daftarPesertaDidik.map((p) => [p.id, p.nama]));
    const eraportOptions: OpsiEraport[] = eraportTerbit.map((e) => ({
      id: e.id,
      label: `${pesertaMap.get(e.pesertaDidikId) ?? e.pesertaDidikId} · ${e.semester}`,
    }));

    return { templates, dokumen, eraportTerbit, eraportOptions };
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
            04 — Cetak
          </p>
          <h1 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Cetak
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
            {bolehBuat ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      {bolehBuat ? (
        <PageReveal delay={2}>
          <FormTemplateCetak action={buatTemplateCetakAction} />
        </PageReveal>
      ) : null}

      <PageReveal delay={3} className="flex flex-col gap-3">
        <SectionLabel nomor="01">Template Cetak</SectionLabel>
        <DaftarTemplateCetak templates={data.templates} />
      </PageReveal>

      <PageReveal delay={3} className="flex flex-col gap-3">
        <SectionLabel nomor="02">Pratinjau Cetak</SectionLabel>
        {data.eraportTerbit.length === 0 ? (
          <KosongDenganTautan
            pesan="Belum ada E-Raport Terbit untuk dicetak."
            href="/dashboard/eraport"
            labelTautan="Buka E-Raport"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.eraportTerbit.map((e) => {
              const nama =
                data.eraportOptions.find((o) => o.id === e.id)?.label ?? e.id;
              return (
                <li
                  key={e.id}
                  className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 text-card-foreground shadow-warm transition-colors hover:border-accent/40 t-lift"
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
      </PageReveal>

      {bolehBuat ? (
        <PageReveal id="kontrol-cetak" delay={4}>
          <KontrolCetak
            eraportOptions={data.eraportOptions}
            templateOptions={data.templates}
            action={buatDokumenCetakAction}
          />
        </PageReveal>
      ) : null}

      <PageReveal delay={4} className="flex flex-col gap-3">
        <SectionLabel nomor="03">Dokumen Cetak</SectionLabel>
        {data.dokumen.length === 0 ? (
          <KosongDenganTautan
            pesan="Belum ada Dokumen Cetak."
            href={bolehBuat ? "#kontrol-cetak" : undefined}
            labelTautan={bolehBuat ? "Buat Dokumen Cetak" : undefined}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.dokumen.map((d) => (
              <li
                key={d.id}
                className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 text-card-foreground shadow-warm transition-colors hover:border-accent/40 t-lift"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  Format: {d.format.toUpperCase()}
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground ring-1 ring-inset ring-border">
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
