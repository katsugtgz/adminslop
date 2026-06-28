import Link from "next/link";

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
import { FormNilai } from "@/components/penilaian/form-nilai";
import { FormPenilaian } from "@/components/penilaian/form-penilaian";
import { BreadcrumbPenilaian } from "@/components/penilaian/breadcrumb-penilaian";
import { HeaderPenilaian } from "@/components/penilaian/header-penilaian";
import { KosongTahunAjaran } from "@/components/penilaian/kosong-tahun-ajaran";
import { bangunLookupPenilaian } from "@/components/penilaian/lookup";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { PageReveal } from "@/components/motion";

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
      <KosongTahunAjaran
        orgName={akses.membership.orgName}
        roleSlug={akses.membership.roleSlug}
      />
    );
  }

  const {
    barisBeban,
    pesertaNama,
    nilaiMap,
    bebanTerpilih,
    komponenTerpilih,
    penilaianTerpilih,
    labelSemester,
    tampilkanBreadcrumb,
  } = bangunLookupPenilaian(data, sp);

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <HeaderPenilaian
        orgName={akses.membership.orgName}
        taNama={data.taAktif.nama}
        semester={labelSemester}
        roleSlug={akses.membership.roleSlug}
        bolehTulis={bolehTulis}
      />

      {tampilkanBreadcrumb && (
        <BreadcrumbPenilaian
          bebanTerpilih={bebanTerpilih}
          komponenTerpilih={komponenTerpilih}
          penilaianTerpilih={penilaianTerpilih}
          bebanId={sp.bebanId}
          isAdmin={isAdmin}
        />
      )}

      <PageReveal delay={2} className="flex flex-col gap-3">
        <SectionLabel nomor="01">
          {isGuruContext ? "Beban Mengajar Saya" : "Beban Mengajar"}
        </SectionLabel>
        {barisBeban.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-accent/30 bg-accent/[0.03] p-6 text-center text-sm text-muted-foreground">
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
                  className="group rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg aria-[current=true]:border-accent/50 aria-[current=true]:ring-2 aria-[current=true]:ring-accent/40 t-lift"
                >
                  <Link
                    href={`/dashboard/penilaian?bebanId=${encodeURIComponent(b.id)}`}
                    className="flex flex-col gap-0.5 hover:text-accent"
                  >
                    {isAdmin && (
                      <span className="text-sm font-semibold">
                        {b.ptkNama}
                      </span>
                    )}
                    <span
                      className={
                        isAdmin
                          ? "font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground"
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
      </PageReveal>

      {sp.bebanId && (
        <>
          {bolehTulis && (
            <PageReveal delay={3}>
              <FormKomponenNilai
                action={simpanKomponenNilaiBaruAction}
                bebanMengajarId={sp.bebanId}
              />
            </PageReveal>
          )}

          <PageReveal delay={3} className="flex flex-col gap-3">
            <SectionLabel nomor="02">Komponen Nilai</SectionLabel>
            <DaftarKomponenNilai
              komponen={data.komponen}
              bolehTulis={bolehTulis}
              selectedId={sp.komponenId}
              bebanId={sp.bebanId}
              hapusAction={hapusKomponenNilaiAction}
            />
          </PageReveal>

          <PageReveal delay={3} className="flex flex-col gap-3">
            <SectionLabel nomor="03">Nilai Akhir</SectionLabel>
            <DaftarNilaiAkhir
              nilaiAkhir={data.nilaiAkhir}
              pesertaNama={pesertaNama}
            />
          </PageReveal>
        </>
      )}

      {sp.bebanId && sp.komponenId && (
        <>
          {bolehTulis && (
            <PageReveal delay={4}>
              <FormPenilaian
                action={simpanPenilaianBaruAction}
                komponenNilaiId={sp.komponenId}
              />
            </PageReveal>
          )}

          <PageReveal delay={4} className="flex flex-col gap-3">
            <SectionLabel nomor="04">Penilaian</SectionLabel>
            <DaftarPenilaian
              penilaian={data.penilaian}
              bolehTulis={bolehTulis}
              selectedId={sp.penilaianId}
              bebanId={sp.bebanId}
              komponenId={sp.komponenId}
              hapusAction={hapusPenilaianAction}
            />
          </PageReveal>
        </>
      )}

      {sp.bebanId && sp.komponenId && sp.penilaianId && (
        <PageReveal delay={5} className="flex flex-col gap-3">
          <SectionLabel nomor="05">Input Nilai</SectionLabel>
          {bolehTulis ? (
            <FormNilai
              action={upsertNilaiAction}
              penilaianId={sp.penilaianId}
              peserta={data.peserta}
              nilaiMap={nilaiMap}
            />
          ) : (
            <p className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
              Anda hanya dapat membaca Penilaian. Peran Anda tidak dapat mengisi
              nilai.
            </p>
          )}
        </PageReveal>
      )}
    </div>
  );
}

function SectionLabel({
  nomor,
  children,
}: {
  nomor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="font-mono text-[0.7rem] font-medium text-accent">
        {nomor}
      </span>
      <span aria-hidden="true" className="h-px w-6 bg-accent/30" />
      <h2 className="font-display text-lg tracking-tight text-foreground sm:text-xl">
        {children}
      </h2>
    </div>
  );
}
