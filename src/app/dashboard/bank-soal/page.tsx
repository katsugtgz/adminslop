import Link from "next/link";
import { LayoutGrid, Search } from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import { cariButirSoalById, listButirInPaket, listButirSoal, listPaketSoal } from "@/db/queries/bank-soal";
import { listMataPelajaran } from "@/db/queries/mata-pelajaran";
import { listTahunAjaran } from "@/db/queries/tahun-ajaran";
import { listTingkat } from "@/db/queries/tingkat";
import type { ButirSoal, MataPelajaran, PaketSoalButir } from "@/db/schema";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { PageReveal } from "@/components/motion";
import { DaftarButirPaket } from "@/components/bank-soal/daftar-butir-paket";
import { DaftarButirSoal } from "@/components/bank-soal/daftar-butir-soal";
import { DaftarPaketSoal } from "@/components/bank-soal/daftar-paket-soal";
import { FormButirSoal } from "@/components/bank-soal/form-butir-soal";
import { FormPaketSoal } from "@/components/bank-soal/form-paket-soal";
import { FormTambahButir } from "@/components/bank-soal/form-tambah-butir";
import { PromptAiEksternal } from "@/components/bank-soal/prompt-ai-eksternal";
import { TempelJsonButirSoal } from "@/components/bank-soal/tempel-json-butir-soal";

import {
  arsipkanButirSoalAction,
  buatButirSoalAction,
  buatPaketSoalAction,
  hapusButirDariPaketAction,
  imporButirSoalJsonAction,
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
  const [mataPelajaran, data] = await Promise.all([
    listMataPelajaran(db),
    withTenant(db, akses.membership.orgId, async (tx) => {
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
        // Fan out the unique butir lookups concurrently (each is an independent
        // indexed read under RLS).
        const uniqueButirIds = [...new Set(paketMembers.map((m) => m.butirSoalId))];
        const butirResults = await Promise.all(
          uniqueButirIds.map((id) => cariButirSoalById(tx, id))
        );
        for (const b of butirResults) {
          if (b) butirInPaketMap.set(b.id, b);
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
    }),
  ]);

  const mapelMap = new Map<string, MataPelajaran>(
    mataPelajaran.map((m) => [m.id, m])
  );

  const baseHref = search ? `/dashboard/bank-soal?q=${encodeURIComponent(search)}` : "/dashboard/bank-soal";

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <PageReveal
        as="section"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card shadow-warm"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.16 42 / 0.45) 0%, transparent 65%)",
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1 select-none font-display text-[9rem] leading-none tracking-tighter text-foreground/[0.03] sm:text-[13rem]"
        >
          16
        </span>
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <p className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-accent">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            Modul · Bank Soal
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-foreground sm:text-5xl">
            Bank Soal
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-muted-foreground sm:text-base">
            Satuan Pendidikan Aktif: {akses.membership.orgName} · Peran Anda:{" "}
            {akses.membership.roleSlug}
            {bolehBuatButir || bolehBuatPaket
              ? ""
              : " (hanya baca)"}
          </p>
        </div>
      </PageReveal>

      <PageReveal as="section" delay={2} className="flex flex-col gap-4">
        <form className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="bank-search"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              Cari
            </label>
            <input
              id="bank-search"
              name="q"
              type="search"
              defaultValue={search ?? ""}
              placeholder="Cari pertanyaan..."
              className="h-10 w-64 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:border-accent/40 hover:bg-accent hover:text-accent-foreground"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Cari
          </button>
          {(search || butirIdFocus || paketIdFocus) && (
            <Link
              href="/dashboard/bank-soal"
              className="ml-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
            >
              Reset
            </Link>
          )}
        </form>
      </PageReveal>

      <PageReveal as="section" delay={2} className="flex flex-col gap-5">
        <span
          aria-hidden="true"
          className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent"
        >
          01
        </span>
        <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Butir Soal
        </h2>
        {bolehBuatButir && !butirIdFocus && !paketIdFocus ? (
          <div id="form-butir-soal">
            <FormButirSoal
              action={buatButirSoalAction}
              mataPelajaran={mataPelajaran}
              tingkat={data.tingkatAll}
            />
          </div>
        ) : null}

        {bolehBuatButir ? (
          <section
            id="ai-eksternal"
            className="mt-8 flex flex-col gap-4 rounded-2xl border border-border/60 bg-muted/20 p-5"
          >
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-2xl tracking-tight text-foreground">
                AI Eksternal (Beta)
              </h2>
              <p className="text-xs text-muted-foreground">
                Buat prompt, salin, jalankan di ChatGPT/Gemini/Claude Anda
                sendiri, lalu tempel hasil JSON kembali ke sini. Platform tidak
                mengirim data ke layanan AI eksternal, Anda yang mengontrol
                transfer.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PromptAiEksternal
                mataPelajaran={mataPelajaran}
                tingkat={data.tingkatAll}
              />
              <TempelJsonButirSoal action={imporButirSoalJsonAction} />
            </div>
          </section>
        ) : null}

        {butirIdFocus && data.butirFocus ? (
          <ButirDetail butir={data.butirFocus} />
        ) : null}

        <DaftarButirSoal
          butir={data.butirList}
          bolehBuat={bolehBuatButir}
          bolehUbah={bolehUbahButir}
          arsipkanAction={arsipkanButirSoalAction}
          baseHref={baseHref}
        />
      </PageReveal>

      <PageReveal
        as="section"
        delay={3}
        className="flex flex-col gap-5 border-t border-border/60 pt-10"
      >
        <span
          aria-hidden="true"
          className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent"
        >
          02
        </span>
        <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Paket Soal
        </h2>
        {bolehBuatPaket && !paketIdFocus ? (
          <div id="form-paket-soal">
            <FormPaketSoal
              action={buatPaketSoalAction}
              mataPelajaran={mataPelajaran}
              tingkat={data.tingkatAll}
              tahunAjaran={data.tahunAjaranAll}
            />
          </div>
        ) : null}

        <DaftarPaketSoal
          paket={data.paketList}
          mapelMap={mapelMap}
          bolehBuat={bolehBuatPaket}
          baseHref={baseHref}
        />

        {paketIdFocus ? (
          <div className="flex flex-col gap-5 border-t border-border/60 pt-8">
            <h3 className="font-display text-xl tracking-tight text-foreground">
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
              <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-center text-xs text-muted-foreground">
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
      </PageReveal>
    </div>
  );
}

/** Inline read-only preview of a Butir Soal (drill-down target). */
function ButirDetail({ butir }: { butir: ButirSoal }) {
  return (
    <article className="bg-grain flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Detail Butir Soal
      </span>
      <p className="font-display text-lg tracking-tight text-foreground">
        {butir.pertanyaan}
      </p>
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
