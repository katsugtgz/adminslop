import { getDb, withTenant } from "@/db/client";
import { listPengguna, listPtk, loadAksesPengguna } from "@/db/queries/akses";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarPengguna } from "@/components/akses/daftar-pengguna";
import { DaftarPtk } from "@/components/akses/daftar-ptk";
import { FormPtkBaru } from "@/components/akses/form-ptk-baru";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  aturIzinAksesAction,
  aturPembatasanAksesAction,
  hapusPtkAction,
  linkPtkPenggunaAction,
  simpanPtkBaruAction,
} from "./actions";

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
    return <PembatasanAkses />;
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
        for (const pengguna of daftarPengguna) {
          aksesPerPengguna.set(pengguna.id, await loadAksesPengguna(tx, pengguna.id));
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
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Manajemen Akses</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehKelola ? "" : " (hanya baca)"}
        </p>
      </header>

      {bolehKelola && <FormPtkBaru action={simpanPtkBaruAction} />}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Daftar PTK</h2>
        <DaftarPtk
          ptks={ptks}
          bolehKelola={bolehKelola}
          hapusAction={hapusPtkAction}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Daftar Pengguna</h2>
        <DaftarPengguna
          penggunas={penggunas}
          bolehKelola={bolehKelola}
          linkAction={linkPtkPenggunaAction}
          ptks={ptks}
          aksesMap={aksesMap}
          aturIzinAction={aturIzinAksesAction}
          aturPembatasanAction={aturPembatasanAksesAction}
        />
      </div>
    </section>
  );
}
