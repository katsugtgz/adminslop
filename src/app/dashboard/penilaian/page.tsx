import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import {
  getBebanMengajarSaya,
  listBebanMengajar,
} from "@/db/queries/beban-mengajar";
import { listKomponenNilai } from "@/db/queries/komponen-nilai";
import { listNilaiByPenilaian, getNilaiAkhir } from "@/db/queries/nilai-peserta-didik";
import type { NilaiAkhirPesertaDidik } from "@/db/queries/nilai-peserta-didik";
import { listPtk } from "@/db/queries/akses";
import { listPenilaian } from "@/db/queries/penilaian";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { listMataPelajaran } from "@/db/queries/mata-pelajaran";
import { listRombonganBelajar } from "@/db/queries/rombongan-belajar";
import {
  getSemesterAktif,
  getTahunAjaranAktif,
} from "@/db/queries/tahun-ajaran";
import { listTingkat } from "@/db/queries/tingkat";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import type {
  KomponenNilai,
  NilaiPesertaDidik,
  Penilaian,
  PesertaDidik,
} from "@/db/schema";

import { DaftarKomponenNilai } from "@/components/penilaian/daftar-komponen-nilai";
import { DaftarNilaiAkhir } from "@/components/penilaian/daftar-nilai-akhir";
import { DaftarPenilaian } from "@/components/penilaian/daftar-penilaian";
import { FormKomponenNilai } from "@/components/penilaian/form-komponen-nilai";
import { FormNilai, type NilaiExisting } from "@/components/penilaian/form-nilai";
import { FormPenilaian } from "@/components/penilaian/form-penilaian";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  hapusKomponenNilaiAction,
  hapusPenilaianAction,
  simpanKomponenNilaiBaruAction,
  simpanPenilaianBaruAction,
  upsertNilaiAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Manajemen Penilaian — server-rendered grading surface for the active Satuan
 * Pendidikan: komponen_nilai -> penilaian -> nilai entry, with the AC#3 Nilai
 * Akhir derivation on display.
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T5 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` -> mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("penilaian:baca")` -> PembatasanAkses, and NO tenant data is
 *     loaded (no leak). (`penilaian:baca` is universal across teaching roles.)
 *   - `boleh("penilaian:buat")` (guru / admin / dev) -> management forms.
 *   - read-only viewers (kepala_sekolah / wali_kelas) -> lists only, no forms.
 *
 * AC#4 (guru sees ONLY their own beban_mengajar): a guru with a linked PTK
 * (`pengguna.ptkId` set, `!akses:kelola`) resolves their beban via
 * `getBebanMengajarSaya(tx, ptkId, …)`. Admin / dev (`akses:kelola`) manage
 * school-wide and resolve via `listBebanMengajar`. The actions re-enforce
 * ownership server-side (gate 2) regardless of what this UI shows.
 *
 * Drill-down is driven by `searchParams` (progressive disclosure, like #9):
 *   ?bebanId=X                 -> expand beban: Komponen Nilai + Nilai Akhir
 *   ?bebanId=X&komponenId=Y    -> expand komponen: Penilaian list
 *   ?bebanId=X&komponenId=Y&penilaianId=Z -> expand penilaian: per-student Nilai
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` — never from
 * formData (§13). The active Tahun Ajaran + Semester are resolved server-side
 * inside `withTenant` (AC#4 — never from the client).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    bebanId?: string;
    komponenId?: string;
    penilaianId?: string;
  }>;
}) {
  const akses = await getAksesSaya();

  if (akses.status === "denied") {
    return <PembatasanAkses />;
  }
  if (akses.status === "choose") {
    return (
      <PilihSatuanPendidikan memberships={[...akses.memberships]} />
    );
  }

  if (!akses.boleh("penilaian:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const sp = await searchParams;
  const bolehTulis = akses.boleh("penilaian:buat").diizinkan;
  const myPtkId = akses.pengguna?.ptkId ?? null;
  // Admin / dev manage school-wide and BYPASS ownership at the action layer.
  const isAdmin = akses.boleh("akses:kelola").diizinkan;
  // AC#4: a linked PTK + no kelola -> guru sees ONLY their own beban.
  const isGuruContext = myPtkId !== null && !isAdmin;
  const { db } = getDb();

  const data = await withTenant(db, akses.membership.orgId, async (tx) => {
    const [taAktif, semester] = await Promise.all([
      getTahunAjaranAktif(tx),
      getSemesterAktif(tx),
    ]);

    if (!taAktif || !semester) {
      return {
        taAktif: null,
        semester: null,
        beban: [],
        ptks: [],
        mapel: [],
        rombels: [],
        tingkats: [],
        komponen: [],
        penilaian: [],
        peserta: [],
        nilaiRows: [],
        nilaiAkhir: [],
      } as const;
    }

    const [bebanRows, ptks, mapel, rombels, tingkats] = await Promise.all([
      isGuruContext
        ? getBebanMengajarSaya(tx, myPtkId, taAktif.id, semester)
        : listBebanMengajar(tx, { tahunAjaranId: taAktif.id, semester }),
      listPtk(tx),
      listMataPelajaran(tx),
      listRombonganBelajar(tx, taAktif.id),
      listTingkat(tx),
    ]);

    let komponen: KomponenNilai[] = [];
    let penilaianRows: Penilaian[] = [];
    let peserta: PesertaDidik[] = [];
    let nilaiRows: NilaiPesertaDidik[] = [];
    let nilaiAkhir: NilaiAkhirPesertaDidik[] = [];

    if (sp.bebanId) {
      [komponen, nilaiAkhir, peserta] = await Promise.all([
        listKomponenNilai(tx, sp.bebanId),
        getNilaiAkhir(tx, sp.bebanId),
        listPesertaDidik(tx),
      ]);

      if (sp.komponenId) {
        penilaianRows = await listPenilaian(tx, sp.komponenId);

        if (sp.penilaianId) {
          nilaiRows = await listNilaiByPenilaian(tx, sp.penilaianId);
        }
      }
    }

    return {
      taAktif,
      semester,
      beban: bebanRows,
      ptks,
      mapel,
      rombels,
      tingkats,
      komponen,
      penilaian: penilaianRows,
      peserta,
      nilaiRows,
      nilaiAkhir,
    } as const;
  });

  if (!data.taAktif || !data.semester) {
    return (
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Penilaian</h1>
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

  const ptkNama = new Map(data.ptks.map((p) => [p.id, p.nama]));
  const mapelNama = new Map(data.mapel.map((m) => [m.id, m.nama]));
  const rombelNama = new Map(data.rombels.map((r) => [r.id, r.nama]));
  const tingkatNama = new Map(data.tingkats.map((t) => [t.id, t.nama]));
  const pesertaNama = new Map(data.peserta.map((p) => [p.id, p.nama]));
  const nilaiMap = new Map<string, NilaiExisting>(
    data.nilaiRows.map((n) => [
      n.pesertaDidikId,
      { nilai: n.nilai, catatan: n.catatan },
    ])
  );

  const barisBeban = data.beban.map((b) => ({
    id: b.id,
    ptkNama: ptkNama.get(b.ptkId) ?? "—",
    mataPelajaranNama: mapelNama.get(b.mataPelajaranId) ?? "—",
    targetNama: b.rombonganBelajarId
      ? rombelNama.get(b.rombonganBelajarId) ?? "—"
      : b.tingkatId
        ? tingkatNama.get(b.tingkatId) ?? "—"
        : "—",
  }));

  const bebanTerpilih = sp.bebanId
    ? barisBeban.find((b) => b.id === sp.bebanId)
    : undefined;
  const komponenTerpilih = sp.komponenId
    ? data.komponen.find((k) => k.id === sp.komponenId)
    : undefined;
  const penilaianTerpilih = sp.penilaianId
    ? data.penilaian.find((p) => p.id === sp.penilaianId)
    : undefined;

  const labelSemester = data.semester === "ganjil" ? "Ganjil" : "Genap";
  const tampilkanBreadcrumb = Boolean(
    bebanTerpilih || komponenTerpilih || penilaianTerpilih
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Penilaian</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Periode Aktif:{" "}
          {data.taAktif.nama} · Semester {labelSemester} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehTulis ? "" : " (hanya baca)"}
        </p>
      </header>

      {tampilkanBreadcrumb && (
        <nav
          aria-label="breadcrumb"
          className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          <Link
            href="/dashboard/penilaian"
            className="font-medium text-foreground hover:text-primary"
          >
            Penilaian
          </Link>
          {bebanTerpilih && (
            <>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <Link
                href={`/dashboard/penilaian?bebanId=${encodeURIComponent(bebanTerpilih.id)}`}
                className="hover:text-primary"
              >
                {isAdmin
                  ? `${bebanTerpilih.ptkNama} · ${bebanTerpilih.mataPelajaranNama}`
                  : bebanTerpilih.mataPelajaranNama}
              </Link>
            </>
          )}
          {komponenTerpilih && (
            <>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <Link
                href={`/dashboard/penilaian?bebanId=${encodeURIComponent(sp.bebanId!)}&komponenId=${encodeURIComponent(komponenTerpilih.id)}`}
                className="hover:text-primary"
              >
                {komponenTerpilih.nama}
              </Link>
            </>
          )}
          {penilaianTerpilih && (
            <>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <span
                className="font-medium text-foreground"
                aria-current="page"
              >
                {penilaianTerpilih.nama}
              </span>
            </>
          )}
        </nav>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {isGuruContext ? "Beban Mengajar Saya" : "Beban Mengajar"}
        </h2>
        {barisBeban.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
            Belum ada Beban Mengajar.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {barisBeban.map((b) => {
              const selected = b.id === sp.bebanId;
              return (
                <li
                  key={b.id}
                  aria-current={selected ? "true" : undefined}
                  className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm aria-[current=true]:ring-2 aria-[current=true]:ring-primary"
                >
                  <Link
                    href={`/dashboard/penilaian?bebanId=${encodeURIComponent(b.id)}`}
                    className="flex flex-col gap-0.5 hover:text-primary"
                  >
                    {isAdmin && (
                      <span className="text-sm font-semibold">
                        {b.ptkNama}
                      </span>
                    )}
                    <span
                      className={
                        isAdmin
                          ? "text-xs text-muted-foreground"
                          : "text-sm font-semibold"
                      }
                    >
                      {b.mataPelajaranNama} · {b.targetNama}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {sp.bebanId && (
        <>
          {bolehTulis && (
            <FormKomponenNilai
              action={simpanKomponenNilaiBaruAction}
              bebanMengajarId={sp.bebanId}
            />
          )}

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Komponen Nilai
            </h2>
            <DaftarKomponenNilai
              komponen={data.komponen}
              bolehTulis={bolehTulis}
              selectedId={sp.komponenId}
              bebanId={sp.bebanId}
              hapusAction={hapusKomponenNilaiAction}
            />
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Nilai Akhir
            </h2>
            <DaftarNilaiAkhir
              nilaiAkhir={data.nilaiAkhir}
              pesertaNama={pesertaNama}
            />
          </div>
        </>
      )}

      {sp.bebanId && sp.komponenId && (
        <>
          {bolehTulis && (
            <FormPenilaian
              action={simpanPenilaianBaruAction}
              komponenNilaiId={sp.komponenId}
            />
          )}

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Penilaian</h2>
            <DaftarPenilaian
              penilaian={data.penilaian}
              bolehTulis={bolehTulis}
              selectedId={sp.penilaianId}
              bebanId={sp.bebanId}
              komponenId={sp.komponenId}
              hapusAction={hapusPenilaianAction}
            />
          </div>
        </>
      )}

      {sp.bebanId && sp.komponenId && sp.penilaianId && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Input Nilai</h2>
          {bolehTulis ? (
            <FormNilai
              action={upsertNilaiAction}
              penilaianId={sp.penilaianId}
              peserta={data.peserta}
              nilaiMap={nilaiMap}
            />
          ) : (
            <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Anda hanya dapat membaca Penilaian. Peran Anda tidak dapat mengisi
              nilai.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
