import { getDb, withTenant } from "@/db/client";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { formatEksporCsv, generateTemplateCsv } from "@/lib/impor/validasi-peserta-didik";

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
    return <PembatasanAkses />;
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
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">
          Impor/Ekspor Peserta Didik
        </h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehKelola ? "" : " (hanya baca)"}
        </p>
      </header>

      {bolehKelola && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
          aria-label="Template Impor"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">Template Impor</h2>
            <p className="text-xs text-muted-foreground">
              Unduh berkas CSV kosong dengan kolom yang benar, lalu isi data
              Peserta Didik.
            </p>
          </div>
          <a
            href={templateHref}
            download="template-peserta-didik.csv"
            className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Unduh Template
          </a>
        </section>
      )}

      {bolehKelola && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
          aria-label="Impor Data"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">Impor Data</h2>
            <p className="text-xs text-muted-foreground">
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
                className="text-sm"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Impor
            </button>
          </form>
        </section>
      )}

      {bolehEkspor && (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
          aria-label="Ekspor Data"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">Ekspor Data</h2>
            <p className="text-xs text-muted-foreground">
              Unduh seluruh Peserta Didik di Satuan Pendidikan Aktif sebagai
              berkas CSV.
            </p>
          </div>
          <a
            href={exportHref}
            download="peserta-didik.csv"
            className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Unduh Ekspor
          </a>
        </section>
      )}
    </section>
  );
}
