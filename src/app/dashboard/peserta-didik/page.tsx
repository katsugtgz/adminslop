import { getDb, withTenant } from "@/db/client";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarPesertaDidik } from "@/components/peserta-didik/daftar-peserta-didik";
import { FormTambah } from "@/components/peserta-didik/form-tambah";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  simpanPesertaDidikBaruAction,
  ubahStatusPesertaDidikAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Peserta Didik — server-rendered student roster for the active Satuan
 * Pendidikan.
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T6 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` → mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("peserta_didik:baca")` → PembatasanAkses, and NO tenant data is
 *     loaded (no leak). Every teaching role (guru / wali_kelas /
 *     kepala_sekolah) has `peserta_didik:baca` by default.
 *   - `baca` but not `buat`+`ubah` (guru / wali_kelas / kepala_sekolah) →
 *     read-only list, no forms.
 *   - `buat` AND `ubah` (admin / dev) → full list + create form + per-row
 *     status form.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` (the live WorkOS
 * Keanggotaan) — never from formData (§13).
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
  // Page-level visibility gate: those without peserta_didik:baca see nothing.
  if (!akses.boleh("peserta_didik:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehTulis =
    akses.boleh("peserta_didik:buat").diizinkan &&
    akses.boleh("peserta_didik:ubah").diizinkan;

  const { db } = getDb();
  const peserta = await withTenant(db, akses.membership.orgId, async (tx) =>
    listPesertaDidik(tx)
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Peserta Didik</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehTulis ? "" : " (hanya baca)"}
        </p>
      </header>

      {bolehTulis && <FormTambah action={simpanPesertaDidikBaruAction} />}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Daftar Peserta Didik</h2>
        <DaftarPesertaDidik
          peserta={peserta}
          bolehTulis={bolehTulis}
          ubahStatusAction={ubahStatusPesertaDidikAction}
        />
      </div>
    </section>
  );
}
