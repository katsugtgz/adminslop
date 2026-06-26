import { getDb, withTenant } from "@/db/client";
import {
  getRetensi,
  listArsip,
  listRiwayatPerubahan,
} from "@/db/queries/arsip";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { DaftarArsip } from "@/components/arsip/daftar-arsip";
import { DaftarRetensi } from "@/components/arsip/daftar-retensi";
import { DaftarRiwayatPerubahan } from "@/components/arsip/daftar-riwayat-perubahan";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import { aturRetensiAction, pulihkanAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Manajemen Arsip — server-rendered archive / retention / change-history surface
 * for the active Satuan Pendidikan (#19).
 *
 * Three sections:
 *   1. Arsip Data — archived records across ptk / penilaian / beban_mengajar /
 *      wali_kelas, with a per-row Pulihkan button (AC#2 recovery).
 *   2. Retensi Data — per-table retention policy (periode bulan, keterangan)
 *      with inline set/update forms (AC#3).
 *   3. Riwayat Perubahan — catatan_audit entries (waktu, aktor, aksi, target)
 *      as the user-facing change trace (AC#4).
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T5 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` -> mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("arsip:baca")` -> PembatasanAkses, and NO tenant data is loaded
 *     (no leak). guru / wali_kelas have no arsip izin at all; they land here.
 *   - `boleh("arsip:baca")` (kepala_sekolah) -> read-only lists.
 *   - `boleh("arsip:kelola")` (admin / dev) -> management forms (recover, set
 *     retention).
 *
 * AC#1 (archive not hard-delete) is a property of `arsipkanAction`, not this
 * page; the page merely displays archived rows and offers recovery.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` — never from
 * formData (§13).
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

  if (!akses.boleh("arsip:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehKelola = akses.boleh("arsip:kelola").diizinkan;
  const { db } = getDb();

  const data = await withTenant(db, akses.membership.orgId, async (tx) => {
    const [arsip, retensi, riwayat] = await Promise.all([
      listArsip(tx),
      getRetensi(tx),
      listRiwayatPerubahan(tx, { limit: 50 }),
    ]);
    return { arsip, retensi, riwayat } as const;
  });

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Arsip</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehKelola ? "" : " (hanya baca)"}
        </p>
        <p className="text-xs text-muted-foreground">
          Data diarsipkan, tidak dihapus permanen.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Arsip Data</h2>
        <DaftarArsip
          baris={data.arsip}
          bolehKelola={bolehKelola}
          pulihkanAction={pulihkanAction}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Retensi Data</h2>
        <DaftarRetensi
          retensi={data.retensi}
          bolehKelola={bolehKelola}
          aturRetensiAction={aturRetensiAction}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Riwayat Perubahan
        </h2>
        <DaftarRiwayatPerubahan riwayat={data.riwayat} />
      </div>
    </section>
  );
}
