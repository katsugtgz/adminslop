import Link from "next/link";

import { getDb, withTenant } from "@/db/client";
import {
  getBebanMengajarSaya,
  listBebanMengajar,
} from "@/db/queries/beban-mengajar";
import type { Semester } from "@/db/queries/beban-mengajar";
import { listMataPelajaran } from "@/db/queries/mata-pelajaran";
import { listPtk } from "@/db/queries/akses";
import { listRombonganBelajar } from "@/db/queries/rombongan-belajar";
import {
  getSemesterAktif,
  getTahunAjaranAktif,
} from "@/db/queries/tahun-ajaran";
import { listTingkat } from "@/db/queries/tingkat";
import {
  getWaliKelasSaya,
  listWaliKelas,
} from "@/db/queries/wali-kelas";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarBebanMengajar, type BarisBebanMengajar } from "@/components/beban-mengajar/daftar-beban-mengajar";
import { DaftarWaliKelas, type BarisWaliKelas } from "@/components/beban-mengajar/daftar-wali-kelas";
import { FormBebanMengajarBaru } from "@/components/beban-mengajar/form-beban-mengajar-baru";
import { FormWaliKelas } from "@/components/beban-mengajar/form-wali-kelas";
import { KonteksGuru } from "@/components/beban-mengajar/konteks-guru";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  hapusBebanMengajarAction,
  hapusWaliKelasAction,
  simpanBebanMengajarBaruAction,
  upsertWaliKelasAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Manajemen Beban Mengajar + Wali Kelas — server-rendered management surface
 * for the active Satuan Pendidikan.
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T5 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` → mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("beban_mengajar:baca")` → PembatasanAkses, and NO tenant data is
 *     loaded (no leak). (`beban_mengajar:baca` is universal across teaching
 *     roles — AC#4.)
 *   - admin / dev (`boleh("beban_mengajar:buat")`) → full management: forms +
 *     school-wide lists with Hapus.
 *   - AC#4 guru with a linked PTK (`pengguna.ptkId` set, `!bolehKelola`) →
 *     read-only KonteksGuru: ONLY their own Beban Mengajar + Wali Kelas for the
 *     active period, resolved via `getBebanMengajarSaya` / `getWaliKelasSaya`.
 *   - guru without a linked PTK → read-only school-wide list + a "Hubungi
 *     admin" prompt to link the PTK (AC#4 requires a ptkId to resolve "mine").
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` (the live WorkOS
 * Keanggotaan) — never from formData (§13). The active Tahun Ajaran + Semester
 * are resolved server-side inside `withTenant` (AC#4 — never from the client).
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
  // Page-level visibility gate: beban_mengajar:baca is universal across teaching
  // roles (AC#4). Anyone without it sees nothing.
  if (!akses.boleh("beban_mengajar:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehKelola = akses.boleh("beban_mengajar:buat").diizinkan;
  const myPtkId = akses.pengguna?.ptkId ?? null;
  // AC#4: a linked PTK + no kelola izin → personalized read-only guru context.
  const isGuruContext = myPtkId !== null && !bolehKelola;
  const { db } = getDb();

  const data = await withTenant(db, akses.membership.orgId, async (tx) => {
    const [taAktif, semester] = await Promise.all([
      getTahunAjaranAktif(tx),
      getSemesterAktif(tx),
    ]);

    // No active period → bail before any further reads.
    if (!taAktif || !semester) {
      return {
        taAktif: null,
        semester: null,
        beban: [],
        wali: [],
        ptks: [],
        mapel: [],
        rombels: [],
        tingkats: [],
      } as const;
    }

    // AC#4: guru context resolves ONLY their own beban + wali for the active
    // period. Everyone else (admin / read-only viewers) sees the school-wide
    // lists. Both branches share the lookup lists below to resolve display
    // names for the enriched view rows.
    const [bebanRows, waliRows, ptks, mapel, rombels, tingkats] =
      await Promise.all([
        isGuruContext
          ? getBebanMengajarSaya(tx, myPtkId, taAktif.id, semester)
          : listBebanMengajar(tx, {
              tahunAjaranId: taAktif.id,
              semester,
            }),
        isGuruContext
          ? getWaliKelasSaya(tx, myPtkId, taAktif.id, semester)
          : listWaliKelas(tx, {
              tahunAjaranId: taAktif.id,
              semester,
            }),
        listPtk(tx),
        listMataPelajaran(tx),
        listRombonganBelajar(tx, taAktif.id),
        listTingkat(tx),
      ]);

    return {
      taAktif,
      semester,
      beban: bebanRows,
      wali: waliRows,
      ptks,
      mapel,
      rombels,
      tingkats,
    } as const;
  });

  // No active period → friendly notice + link to enable one.
  if (!data.taAktif || !data.semester) {
    return (
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Beban Mengajar</h1>
          <p className="text-sm text-muted-foreground">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
          </p>
        </header>
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Aktifkan Tahun Ajaran terlebih dahulu.{" "}
          <Link
            href="/dashboard/tahun-ajaran"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Buka Pengaturan Tahun Ajaran
          </Link>
        </p>
      </section>
    );
  }

  // Build name-resolution lookup maps from the loaded lists (display names for
  // the enriched view rows). Falls back to "—" when a foreign row is absent
  // (should not happen under referential integrity, but never crash the render).
  const ptkNama = new Map(data.ptks.map((p) => [p.id, p.nama]));
  const mapelNama = new Map(data.mapel.map((m) => [m.id, m.nama]));
  const rombelNama = new Map(data.rombels.map((r) => [r.id, r.nama]));
  const tingkatNama = new Map(data.tingkats.map((t) => [t.id, t.nama]));

  const barisBeban: BarisBebanMengajar[] = data.beban.map((b) => ({
    id: b.id,
    ptkNama: ptkNama.get(b.ptkId) ?? "—",
    mataPelajaranNama: mapelNama.get(b.mataPelajaranId) ?? "—",
    targetNama: b.rombonganBelajarId
      ? rombelNama.get(b.rombonganBelajarId) ?? "—"
      : b.tingkatId
        ? tingkatNama.get(b.tingkatId) ?? "—"
        : "—",
    semester: data.semester as Semester,
  }));

  const barisWali: BarisWaliKelas[] = data.wali.map((w) => ({
    id: w.id,
    ptkNama: ptkNama.get(w.ptkId) ?? "—",
    rombonganBelajarNama: rombelNama.get(w.rombonganBelajarId) ?? "—",
  }));

  const labelSemester = data.semester === "ganjil" ? "Ganjil" : "Genap";

  // AC#4: guru with a linked PTK → read-only personalized context.
  if (isGuruContext) {
    return (
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Beban Mengajar</h1>
          <p className="text-sm text-muted-foreground">
            Periode Aktif: {data.taAktif.nama} · Semester {labelSemester} ·
            Peran Anda: {akses.membership.roleSlug} (konteks saya)
          </p>
        </header>
        <KonteksGuru beban={barisBeban} wali={barisWali} />
      </section>
    );
  }

  // Admin / dev (bolehKelola) → full management. Read-only viewers
  // (kepala_sekolah / guru-without-ptk) → same lists, no forms.
  const butuhPtk =
    !bolehKelola &&
    myPtkId === null &&
    (akses.membership.roleSlug === "guru" ||
      akses.membership.roleSlug === "wali_kelas");

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Beban Mengajar</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Periode Aktif:{" "}
          {data.taAktif.nama} · Semester {labelSemester} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehKelola ? "" : " (hanya baca)"}
        </p>
      </header>

      {butuhPtk && (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Hubungi admin untuk menghubungkan akun PTK Anda agar dapat melihat
          Beban Mengajar dan Wali Kelas milik Anda.
        </p>
      )}

      {bolehKelola && (
        <FormBebanMengajarBaru
          action={simpanBebanMengajarBaruAction}
          ptks={data.ptks}
          mapel={data.mapel}
          rombels={data.rombels}
          tingkats={data.tingkats}
        />
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Daftar Beban Mengajar
        </h2>
        <DaftarBebanMengajar
          beban={barisBeban}
          bolehKelola={bolehKelola}
          hapusAction={hapusBebanMengajarAction}
        />
      </div>

      {bolehKelola && (
        <FormWaliKelas
          action={upsertWaliKelasAction}
          ptks={data.ptks}
          rombels={data.rombels}
        />
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Daftar Wali Kelas
        </h2>
        <DaftarWaliKelas
          wali={barisWali}
          bolehKelola={bolehKelola}
          hapusAction={hapusWaliKelasAction}
        />
      </div>
    </section>
  );
}
