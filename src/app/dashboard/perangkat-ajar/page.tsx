import Link from "next/link";
import { Compass } from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import { listMataPelajaran } from "@/db/queries/mata-pelajaran";
import {
  listByJenis,
  listPerangkatAjar,
} from "@/db/queries/perangkat-ajar";
import type { JenisPerangkatAjar } from "@/db/queries/perangkat-ajar";
import { listTingkat } from "@/db/queries/tingkat";
import type { MataPelajaran, PerangkatAjar, Tingkat } from "@/db/schema";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { PageReveal } from "@/components/motion";
import { DaftarPerangkatAjar } from "@/components/perangkat-ajar/daftar-perangkat-ajar";
import { FormPerangkatAjar } from "@/components/perangkat-ajar/form-perangkat-ajar";
import { LABEL_JENIS, PILIHAN_JENIS } from "@/components/perangkat-ajar/jenis-perangkat";

import { verifikasiDokumenAiAction, buatPerangkatAjarAction } from "./actions";

export const dynamic = "force-dynamic";

const JENIS_VALID: readonly JenisPerangkatAjar[] = PILIHAN_JENIS.map(
  (j) => j.slug
);

function isJenisValid(v: string): v is JenisPerangkatAjar {
  return (JENIS_VALID as readonly string[]).includes(v);
}

/**
 * Perangkat Ajar management surface (#17 / T6).
 *
 * Visibility is defense-in-depth UI — NOT authorization (identity doc §12; the
 * actions are the authoritative gate). Resolution mirrors the other dashboard
 * pages:
 *   - `denied` / `choose` -> mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("perangkat_ajar:baca")` -> PembatasanAkses; NO tenant data loads.
 *   - otherwise the active membership scope drives a single `withTenant` block
 *     that loads the Mata Pelajaran (GLOBAL) + Tingkat selects and the
 *     perangkat_ajar list.
 *
 * AC#4 drill-down: `?jenis=<slug>` filters the list to one type via
 * `listByJenis`; otherwise all types are listed. Type-specific sections are
 * driven by `jenis`, not one monolithic format.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` (the live WorkOS
 * Keanggotaan) — never from formData (identity doc §13).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const akses = await getAksesSaya();

  if (akses.status === "denied") {
    return <PembatasanAkses authenticated={akses.authenticated} />;
  }
  if (akses.status === "choose") {
    return <PilihSatuanPendidikan memberships={[...akses.memberships]} />;
  }

  if (!akses.boleh("perangkat_ajar:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehBuat = akses.boleh("perangkat_ajar:buat").diizinkan;
  const bolehUbah = akses.boleh("perangkat_ajar:ubah").diizinkan;

  const sp = await searchParams;
  const jenisRaw = typeof sp.jenis === "string" ? sp.jenis : undefined;
  const jenisFilter = jenisRaw && isJenisValid(jenisRaw) ? jenisRaw : null;

  const { db } = getDb();
  const data = await withTenant(db, akses.membership.orgId, async (tx) => {
    const [daftarMapel, daftarTingkat] = await Promise.all([
      listMataPelajaran(tx),
      listTingkat(tx),
    ]);
    const daftar = jenisFilter
      ? await listByJenis(tx, jenisFilter)
      : await listPerangkatAjar(tx);
    return { daftarMapel, daftarTingkat, daftar };
  });

  const { daftarMapel, daftarTingkat, daftar } = data as {
    daftarMapel: MataPelajaran[];
    daftarTingkat: Tingkat[];
    daftar: PerangkatAjar[];
  };

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <PageReveal
        as="section"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card shadow-warm"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.16 42 / 0.45) 0%, transparent 65%)",
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1 select-none font-display text-[9rem] leading-none tracking-tighter text-foreground/[0.03] sm:text-[13rem]"
        >
          17
        </span>
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <p className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-accent">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            Modul · Perangkat Ajar
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
            Perangkat Ajar
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-muted-foreground sm:text-base">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
            {bolehBuat ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      <PageReveal as="section" delay={2} className="flex flex-col gap-4">
        <nav className="flex flex-wrap gap-2" aria-label="Filter Jenis">
          <Link
            href="/dashboard/perangkat-ajar"
            className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              jenisFilter === null
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-card text-foreground hover:border-accent/40 hover:text-accent"
            }`}
          >
            Semua
          </Link>
          {PILIHAN_JENIS.map(({ slug, label }) => (
            <Link
              key={slug}
              href={`/dashboard/perangkat-ajar?jenis=${slug}`}
              className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                jenisFilter === slug
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-card text-foreground hover:border-accent/40 hover:text-accent"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </PageReveal>

      {bolehBuat ? (
        <PageReveal as="section" delay={2}>
          <FormPerangkatAjar
            action={buatPerangkatAjarAction}
            daftarMapel={daftarMapel}
            daftarTingkat={daftarTingkat}
          />
        </PageReveal>
      ) : null}

      <PageReveal as="section" delay={3} className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent"
          >
            01
          </span>
          <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
            {jenisFilter ? LABEL_JENIS[jenisFilter] : "Daftar Perangkat Ajar"}
          </h2>
        </div>
        <DaftarPerangkatAjar
          daftar={daftar}
          bolehUbah={bolehUbah}
          verifikasiAction={verifikasiDokumenAiAction}
        />
      </PageReveal>
    </div>
  );
}
