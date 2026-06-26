import Link from "next/link";

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
import { DaftarPerangkatAjar } from "@/components/perangkat-ajar/daftar-perangkat-ajar";
import {
  FormPerangkatAjar,
  LABEL_JENIS,
  PILIHAN_JENIS,
} from "@/components/perangkat-ajar/form-perangkat-ajar";

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
    return <PembatasanAkses />;
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
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Perangkat Ajar</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehBuat ? "" : " (hanya baca)"}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Filter Jenis">
        <Link
          href="/dashboard/perangkat-ajar"
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            jenisFilter === null
              ? "bg-primary text-primary-foreground"
              : "border border-input bg-background hover:bg-accent"
          }`}
        >
          Semua
        </Link>
        {PILIHAN_JENIS.map(({ slug, label }) => (
          <Link
            key={slug}
            href={`/dashboard/perangkat-ajar?jenis=${slug}`}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              jenisFilter === slug
                ? "bg-primary text-primary-foreground"
                : "border border-input bg-background hover:bg-accent"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {bolehBuat ? (
        <FormPerangkatAjar
          action={buatPerangkatAjarAction}
          daftarMapel={daftarMapel}
          daftarTingkat={daftarTingkat}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {jenisFilter ? LABEL_JENIS[jenisFilter] : "Daftar Perangkat Ajar"}
        </h2>
        <DaftarPerangkatAjar
          daftar={daftar}
          bolehUbah={bolehUbah}
          verifikasiAction={verifikasiDokumenAiAction}
        />
      </div>
    </section>
  );
}
