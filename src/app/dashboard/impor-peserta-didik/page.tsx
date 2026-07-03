import { Download, Upload, FileSpreadsheet } from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { formatEksporCsv, generateTemplateCsv } from "@/lib/impor/validasi-peserta-didik";

import { PageReveal } from "@/components/motion";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import { imporPesertaDidikAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Impor/Ekspor Peserta Didik — CSV bulk import + export for the active Satuan
 * Pendidikan.
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T6 action is the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` → mirror the dashboard resolution.
 *   - `!boleh("impor_peserta_didik:baca")` → PembatasanAkses, NO tenant data
 *     loaded (no leak). Every role with any impor/ekspor izin has `:baca`.
 *   - `impor_peserta_didik:kelola` (admin / dev) → Template download + Impor
 *     upload form + Ekspor download.
 *   - `impor:baca` without `kelola` (kepala_sekolah) → Ekspor download only.
 *
 * Template + export are server-generated CSV strings surfaced as `data:` URI
 * download links (no client JS). Tenant scope is derived ONLY from
 * `akses.membership.orgId` — never from formData (§13). Export data (AC#4) is
 * scoped by loading listPesertaDidik inside withTenant (RLS).
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
  if (!akses.boleh("impor_peserta_didik:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehKelola = akses.boleh("impor_peserta_didik:kelola").diizinkan;
  const bolehEkspor = akses.boleh("ekspor_peserta_didik:baca").diizinkan;

  // Load tenant-scoped peserta ONLY for export (AC#4 — scoped via RLS GUC).
  let peserta: Awaited<ReturnType<typeof listPesertaDidik>> = [];
  if (bolehEkspor) {
    const { db } = getDb();
    peserta = await withTenant(db, akses.membership.orgId, async (tx) =>
      listPesertaDidik(tx)
    );
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(generateTemplateCsv())}`;
  const exportHref = `data:text/csv;charset=utf-8,${encodeURIComponent(formatEksporCsv(peserta))}`;

  return (
    <section className="flex flex-col gap-10 md:gap-12">
      <PageReveal
        as="header"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.16 42 / 0.35) 0%, transparent 70%)",
          }}
        />
        <div className="relative flex flex-col gap-3">
          <p className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            Bergerak Data
          </p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Impor/Ekspor Peserta Didik
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            <span className="font-medium text-foreground">
              {akses.membership.roleSlug}
            </span>
            {bolehKelola ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      {bolehKelola && (
        <section aria-label="Template Impor">
          <PageReveal
            delay={2}
            className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
          >
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
                01 — Template
              </p>
              <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
                Template Impor
              </h2>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Unduh berkas CSV kosong dengan kolom yang benar, lalu isi data
                Peserta Didik.
              </p>
            </div>
            <a
              href={templateHref}
              download="template-peserta-didik.csv"
              className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-warm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Unduh Template
            </a>
          </PageReveal>
        </section>
      )}

      {bolehKelola && (
        <section aria-label="Impor Data">
          <PageReveal
            delay={3}
            className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
          >
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
                02 — Unggah
              </p>
              <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
                Impor Data
              </h2>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Unggah berkas CSV. Baris valid akan ditambahkan; baris dengan
                NISN/NIS ganda akan dilewati (tidak menimpa data lama).
              </p>
            </div>
            <form
              action={imporPesertaDidikAction}
              aria-label="Impor Data"
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="impor-file" className="text-sm font-medium">
                  Berkas CSV
                </label>
                <input
                  id="impor-file"
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  className="text-sm file:mr-3 file:inline-flex file:h-9 file:items-center file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-accent hover:file:text-accent-foreground"
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-warm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Impor
              </button>
            </form>
          </PageReveal>
        </section>
      )}

      {bolehEkspor && (
        <section aria-label="Ekspor Data">
          <PageReveal
            delay={4}
            className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
          >
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
                03 — Ekspor
              </p>
              <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
                Ekspor Data
              </h2>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Unduh seluruh Peserta Didik di Satuan Pendidikan Aktif sebagai
                berkas CSV.
              </p>
            </div>
            <a
              href={exportHref}
              download="peserta-didik.csv"
              className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-warm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Unduh Ekspor
            </a>
          </PageReveal>
        </section>
      )}
    </section>
  );
}
