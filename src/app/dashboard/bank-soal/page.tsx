import Link from "next/link";

import { getDb, withTenant } from "@/db/client";
import { cariButirSoalById, listButirInPaket, listButirSoal, listPaketSoal } from "@/db/queries/bank-soal";
import { listMataPelajaran } from "@/db/queries/mata-pelajaran";
import { listTahunAjaran } from "@/db/queries/tahun-ajaran";
import { listTingkat } from "@/db/queries/tingkat";
import type { ButirSoal, MataPelajaran, PaketSoalButir } from "@/db/schema";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { DaftarButirPaket } from "@/components/bank-soal/daftar-butir-paket";
import { DaftarButirSoal } from "@/components/bank-soal/daftar-butir-soal";
import { DaftarPaketSoal } from "@/components/bank-soal/daftar-paket-soal";
import { FormButirSoal } from "@/components/bank-soal/form-butir-soal";
import { FormPaketSoal } from "@/components/bank-soal/form-paket-soal";
import { FormTambahButir } from "@/components/bank-soal/form-tambah-butir";

import {
  arsipkanButirSoalAction,
  buatButirSoalAction,
  buatPaketSoalAction,
  hapusButirDariPaketAction,
  tambahButirKePaketAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Bank Soal + Paket Soal management surface (#16, T7). Drill-down via
 * searchParams:
 *   - (no params) ........ list butir + paket; create forms (when permitted)
 *   - ?butirId=X ......... butir detail (preview) + paket list
 *   - ?paketId=X .......... paket assembly: list members + add/remove butir
 *
 * Visibility is defense-in-depth UI — NOT authorization (identity doc §12;
 * the T7 actions are the authoritative gate). Resolution mirrors the other
 * dashboard pages:
 *   - `denied` / `choose` -> mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("bank_soal:baca")` -> PembatasanAkses; NO tenant data loads.
 *   - otherwise the active membership scope drives a single `withTenant`
 *     block that loads mata pelajaran + tingkat + tahun ajaran for the form
 *     selects, the butir list (with optional `search` filter), the paket
 *     list, and (when drilled-in) the paket members + butir detail.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` (the live WorkOS
 * Keanggotaan) — never from formData (identity doc §13).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const akses = await getAksesSaya();

  if (akses.status === "denied") {
    return <PembatasanAkses />;
  }
  if (akses.status === "choose") {
    return <PilihSatuanPendidikan memberships={[...akses.memberships]} />;
  }

  if (!akses.boleh("bank_soal:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const bolehBuatButir = akses.boleh("bank_soal:buat").diizinkan;
  const bolehUbahButir = akses.boleh("bank_soal:ubah").diizinkan;
  const bolehBuatPaket = akses.boleh("paket_soal:buat").diizinkan;
  const bolehUbahPaket = akses.boleh("paket_soal:ubah").diizinkan;

  const sp = await searchParams;
  const spOne = (k: string): string | undefined => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const search = spOne("q")?.trim() || undefined;
  const butirIdFocus = spOne("butirId");
  const paketIdFocus = spOne("paketId");

  // GLOBAL mata pelajaran (no tenant scoping) — load outside withTenant.
  const { db } = getDb();
  const mataPelajaran = await listMataPelajaran(db);

  const data = await withTenant(db, akses.membership.orgId, async (tx) => {
    const [tingkatAll, tahunAjaranAll, butirList, paketList] =
      await Promise.all([
        listTingkat(tx),
        listTahunAjaran(tx),
        listButirSoal(tx, { search }),
        listPaketSoal(tx),
      ] as const);

    // Drill-down: paket assembly view.
    let paketMembers: readonly PaketSoalButir[] = [];
    const butirInPaketMap = new Map<string, ButirSoal>();
    let addCandidates: readonly ButirSoal[] = [];
    let nextUrutan = 1;
    if (paketIdFocus) {
      paketMembers = await listButirInPaket(tx, paketIdFocus);
      const memberButirIds = new Set(paketMembers.map((m) => m.butirSoalId));
      // Butir candidates = aktif butir NOT already in this paket.
      addCandidates = butirList.filter(
        (b) => b.status === "aktif" && !memberButirIds.has(b.id)
      );
      nextUrutan =
        paketMembers.reduce((max, m) => Math.max(max, m.urutan), 0) + 1;
      for (const m of paketMembers) {
        if (!butirInPaketMap.has(m.butirSoalId)) {
          const b = await cariButirSoalById(tx, m.butirSoalId);
          if (b) butirInPaketMap.set(m.butirSoalId, b);
        }
      }
    }

    // Drill-down: butir detail preview.
    let butirFocus: ButirSoal | null = null;
    if (butirIdFocus) {
      butirFocus = await cariButirSoalById(tx, butirIdFocus);
    }

    return {
      tingkatAll,
      tahunAjaranAll,
      butirList,
      paketList,
      paketMembers,
      butirInPaketMap,
      addCandidates,
      nextUrutan,
      butirFocus,
    };
  });

  const mapelMap = new Map<string, MataPelajaran>(
    mataPelajaran.map((m) => [m.id, m])
  );

  const baseHref = search ? `/dashboard/bank-soal?q=${encodeURIComponent(search)}` : "/dashboard/bank-soal";

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Bank Soal</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehBuatButir || bolehBuatPaket
            ? ""
            : " (hanya baca)"}
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="bank-search" className="text-xs font-medium text-muted-foreground">
            Cari
          </label>
          <input
            id="bank-search"
            name="q"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Cari pertanyaan..."
            className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
        >
          Cari
        </button>
        {(search || butirIdFocus || paketIdFocus) && (
          <Link
            href="/dashboard/bank-soal"
            className="ml-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            Reset
          </Link>
        )}
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Butir Soal</h2>
        {bolehBuatButir && !butirIdFocus && !paketIdFocus ? (
          <FormButirSoal
            action={buatButirSoalAction}
            mataPelajaran={mataPelajaran}
            tingkat={data.tingkatAll}
          />
        ) : null}

        {butirIdFocus && data.butirFocus ? (
          <ButirDetail butir={data.butirFocus} />
        ) : null}

        <DaftarButirSoal
          butir={data.butirList}
          bolehUbah={bolehUbahButir}
          arsipkanAction={arsipkanButirSoalAction}
          baseHref={baseHref}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-lg font-semibold tracking-tight">Paket Soal</h2>
        {bolehBuatPaket && !paketIdFocus ? (
          <FormPaketSoal
            action={buatPaketSoalAction}
            mataPelajaran={mataPelajaran}
            tingkat={data.tingkatAll}
            tahunAjaran={data.tahunAjaranAll}
          />
        ) : null}

        <DaftarPaketSoal
          paket={data.paketList}
          mapelMap={mapelMap}
          baseHref={baseHref}
        />

        {paketIdFocus ? (
          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <h3 className="text-base font-semibold tracking-tight">
              Rakit Paket
            </h3>
            {bolehUbahPaket ? (
              <FormTambahButir
                action={tambahButirKePaketAction}
                paketSoalId={paketIdFocus}
                candidates={data.addCandidates}
                nextUrutan={data.nextUrutan}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
                Anda hanya dapat membaca Paket Soal ini.
              </p>
            )}
            <DaftarButirPaket
              paketSoalId={paketIdFocus}
              members={data.paketMembers}
              butirMap={data.butirInPaketMap}
              bolehUbah={bolehUbahPaket}
              hapusAction={hapusButirDariPaketAction}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Inline read-only preview of a Butir Soal (drill-down target). */
function ButirDetail({ butir }: { butir: ButirSoal }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
      <span className="text-xs text-muted-foreground">Detail Butir Soal</span>
      <p className="text-sm font-semibold">{butir.pertanyaan}</p>
      <p className="text-xs text-muted-foreground">
        Kunci Jawaban: <span className="font-mono">{butir.kunciJawaban}</span>
      </p>
      {butir.pembahasan ? (
        <p className="text-xs text-muted-foreground">
          Pembahasan: {butir.pembahasan}
        </p>
      ) : null}
      {butir.drafAiId ? (
        <p className="text-xs text-muted-foreground">
          Bersumber dari Draf AI tervalidasi.
        </p>
      ) : null}
    </article>
  );
}
