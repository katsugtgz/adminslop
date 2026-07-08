import { KeyRound } from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import { listPengguna, listPtk, loadAksesPengguna } from "@/db/queries/akses";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarPengguna } from "@/components/akses/daftar-pengguna";
import { DaftarPtk } from "@/components/akses/daftar-ptk";
import { FormPtkBaru } from "@/components/akses/form-ptk-baru";
import { PageReveal } from "@/components/motion";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  aturIzinAksesAction,
  aturPembatasanAksesAction,
  hapusPtkAction,
  linkPtkPenggunaAction,
  simpanPtkBaruAction,
} from "./actions";
import { type StyleWithVars } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Manajemen Akses — server-rendered management surface for the active Satuan
 * Pendidikan.
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T5 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` → mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("akses:baca")` (guru / wali_kelas) → PembatasanAkses, and NO
 *     tenant data is loaded (no leak).
 *   - `boleh("akses:baca")` but `!boleh("akses:kelola")` (kepala_sekolah) →
 *     read-only lists, no management forms.
 *   - `boleh("akses:kelola")` (admin / dev) → full management forms.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` (the live WorkOS
 * Keanggotaan) — never from formData (§13).
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
  // Page-level visibility gate: those without `akses:baca` see nothing.
  if (!akses.boleh("akses:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehKelola = akses.boleh("akses:kelola").diizinkan;
  const { db } = getDb();

  const { ptks, penggunas, aksesMap } = await withTenant(
    db,
    akses.membership.orgId,
    async (tx) => {
      const [daftarPtk, daftarPengguna] = await Promise.all([
        listPtk(tx),
        listPengguna(tx),
      ]);
      // izin/pembatasan per pengguna are only needed to render the management
      // matrix; skip the N reads for read-only viewers.
      const aksesPerPengguna = new Map<
        string,
        { izin: string[]; pembatasan: string[] }
      >();
      if (bolehKelola) {
        const entries = await Promise.all(
          daftarPengguna.map(async (pengguna) => [
            pengguna.id,
            await loadAksesPengguna(tx, pengguna.id),
          ] as const)
        );
        for (const [id, aksesRow] of entries) {
          aksesPerPengguna.set(id, aksesRow);
        }
      }
      return {
        ptks: daftarPtk,
        penggunas: daftarPengguna,
        aksesMap: aksesPerPengguna,
      };
    }
  );

  return (
    <section className="flex flex-col gap-10 md:gap-12">
      <PageReveal
        as="header"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div
          aria-hidden="true"
          className="hero-glow pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{ "--glow-opacity": 0.35, "--glow-extent": "70%" } as StyleWithVars}
        />
        <div className="relative flex flex-col gap-3">
          <p className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            Modul Akses
          </p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Manajemen Akses
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            <span className="font-medium text-foreground">
              {akses.membership.roleSlug}
            </span>
            {bolehKelola ? "" : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      {bolehKelola && (
        <PageReveal delay={2}>
          <FormPtkBaru action={simpanPtkBaruAction} />
        </PageReveal>
      )}

      <PageReveal delay={2} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
            01 — Personel
          </p>
          <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
            Daftar PTK
          </h2>
        </div>
        <DaftarPtk
          ptks={ptks}
          bolehKelola={bolehKelola}
          hapusAction={hapusPtkAction}
        />
      </PageReveal>

      <PageReveal delay={3} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
            02 — Pengguna &amp; Izin
          </p>
          <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
            Daftar Pengguna
          </h2>
        </div>
        <DaftarPengguna
          penggunas={penggunas}
          bolehKelola={bolehKelola}
          linkAction={linkPtkPenggunaAction}
          ptks={ptks}
          aksesMap={aksesMap}
          aturIzinAction={aturIzinAksesAction}
          aturPembatasanAction={aturPembatasanAksesAction}
        />
      </PageReveal>
    </section>
  );
}
