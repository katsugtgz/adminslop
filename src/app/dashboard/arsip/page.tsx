import { Archive } from "lucide-react";

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
import { PageReveal } from "@/components/motion";
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
    return <PembatasanAkses authenticated={akses.authenticated} />;
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
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            Manajemen Arsip
          </p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Arsip
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            <span className="font-medium text-foreground">
              {akses.membership.roleSlug}
            </span>
            {bolehKelola ? "" : " (hanya baca)"}
          </p>
          <p className="text-xs text-muted-foreground">
            Data diarsipkan, tidak dihapus permanen.
          </p>
        </div>
      </PageReveal>

      <PageReveal delay={2} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
            01 — Pemulihan
          </p>
          <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
            Arsip Data
          </h2>
        </div>
        <DaftarArsip
          baris={data.arsip}
          bolehKelola={bolehKelola}
          pulihkanAction={pulihkanAction}
        />
      </PageReveal>

      <PageReveal delay={3} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
            02 — Kebijakan
          </p>
          <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
            Retensi Data
          </h2>
        </div>
        <DaftarRetensi
          retensi={data.retensi}
          bolehKelola={bolehKelola}
          aturRetensiAction={aturRetensiAction}
        />
      </PageReveal>

      <PageReveal delay={4} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
            03 — Jejak Audit
          </p>
          <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
            Riwayat Perubahan
          </h2>
        </div>
        <DaftarRiwayatPerubahan riwayat={data.riwayat} />
      </PageReveal>
    </section>
  );
}
