import Link from "next/link";

import { getDb, withTenant } from "@/db/client";
import {
  getAbsensiByTanggal,
  getRekapByRombonganBelajar,
  type RekapAbsensi,
} from "@/db/queries/absensi";
import { listRombonganBelajar } from "@/db/queries/rombongan-belajar";
import { listAnggotaRombonganBelajar } from "@/db/queries/penempatan-rombongan-belajar";
import { listPesertaDidik } from "@/db/queries/peserta-didik";
import { getSemesterAktif, getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import type { PesertaDidik, RombonganBelajar } from "@/db/schema";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarRombonganBelajarAbsensi } from "@/components/absensi/daftar-rombongan-belajar";
import { FormAbsensi } from "@/components/absensi/form-absensi";
import type { AbsensiExisting } from "@/components/absensi/types";
import { RekapAbsensiTable } from "@/components/absensi/rekap-absensi";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import { catatAbsensiAction, ubahAbsensiAction } from "./actions";

export const dynamic = "force-dynamic";

/** ISO date `YYYY-MM-DD` shape check — used to validate sp.tanggal. */
function isIsoDateShape(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Resolved page data (after tenant-scoped reads). */
interface PageData {
  readonly taAktif: { id: string; nama: string } | null;
  readonly semester: "ganjil" | "genap" | null;
  readonly rombel: readonly RombonganBelajar[];
  readonly peserta: readonly PesertaDidik[];
  readonly existing: ReadonlyMap<string, AbsensiExisting>;
  readonly rekap: ReadonlyMap<string, RekapAbsensi>;
  /** Set only when a (rombonganBelajarId, tanggal) drill-down resolved. */
  readonly tanggal?: string;
}

/**
 * Absensi Harian — server-rendered daily attendance surface for the active
 * Satuan Pendidikan: pick a Rombongan Belajar + tanggal, then mark attendance
 * per student (Hadir / Izin / Sakit / Alpa) with a per-student recap.
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T5 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` -> mirror the dashboard resolution (Pembatasan /
 *     Pilih).
 *   - `!boleh("absensi:baca")` -> PembatasanAkses, and NO tenant data is
 *     loaded (no leak). Every teaching role has `:baca` by default.
 *   - `:baca` but `!:buat` / `!:ubah` (wali_kelas / kepala_sekolah) -> read-
 *     only view (roster + recap, no form).
 *   - `:buat` (guru / admin / dev) -> per-student entry form. The form posts
 *     to catatAbsensiAction for new rows, ubahAbsensiAction for existing
 *     (AC#3: correctable even when QR-captured).
 *
 * Drill-down is driven by `searchParams` (progressive disclosure, like #9):
 *   ?rombonganBelajarId=X                    -> rombel selected; if no tanggal,
 *                                                default to today (server-side).
 *   ?rombonganBelajarId=X&tanggal=YYYY-MM-DD -> roster + per-student form
 *                                                (existing prefilled) + recap.
 *
 * Tenant scope is derived ONLY from `akses.membership.orgId` — never from
 * formData (§13). The active Tahun Ajaran + Semester are resolved server-side
 * inside `withTenant` (the roster comes from listAnggotaRombonganBelajar for
 * the active TA+semester, AC#4 derived-context — never from the client).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    rombonganBelajarId?: string;
    tanggal?: string;
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

  // Page-level visibility gate: those without `absensi:baca` see nothing —
  // and crucially, NO tenant data is loaded (no leak).
  if (!akses.boleh("absensi:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const sp = await searchParams;
  const bolehTulis = akses.boleh("absensi:buat").diizinkan;
  const { db } = getDb();

  const data: PageData = await withTenant(
    db,
    akses.membership.orgId,
    async (tx) => {
      const [taAktif, semester] = await Promise.all([
        getTahunAjaranAktif(tx),
        getSemesterAktif(tx),
      ]);

      const empty: PageData = {
        taAktif: null,
        semester: null,
        rombel: [],
        peserta: [],
        existing: new Map(),
        rekap: new Map(),
      };

      if (!taAktif || !semester) return empty;

      const rombel = await listRombonganBelajar(tx, taAktif.id);

      // No drill-down: just the rombel list.
      if (!sp.rombonganBelajarId) {
        return {
          taAktif: { id: taAktif.id, nama: taAktif.nama },
          semester,
          rombel,
          peserta: [],
          existing: new Map(),
          rekap: new Map(),
        } satisfies PageData;
      }

      // Drill-down: roster + attendance for a tanggal.
      const [anggota, allPeserta] = await Promise.all([
        listAnggotaRombonganBelajar(
          tx,
          sp.rombonganBelajarId,
          taAktif.id,
          semester
        ),
        listPesertaDidik(tx),
      ]);

      // Roster is the set of peserta_didik ids placed in this rombel for the
      // active context; resolved to PesertaDidik rows for name display.
      const anggotaIds = new Set(anggota.map((a) => a.pesertaDidikId));
      const peserta = allPeserta.filter((p) => anggotaIds.has(p.id));

      // Default tanggal to today (server-side) when absent or malformed.
      const tanggal =
        sp.tanggal && isIsoDateShape(sp.tanggal)
          ? sp.tanggal
          : new Date().toISOString().slice(0, 10);

      const [existingRows, rekap] = await Promise.all([
        getAbsensiByTanggal(tx, sp.rombonganBelajarId, tanggal),
        getRekapByRombonganBelajar(tx, sp.rombonganBelajarId),
      ]);

      const existing = new Map<string, AbsensiExisting>(
        existingRows.map((r) => [
          r.pesertaDidikId,
          {
            id: r.id,
            statusKehadiran: r.statusKehadiran as AbsensiExisting["statusKehadiran"],
            catatan: r.catatan,
            metodeInput: r.metodeInput as AbsensiExisting["metodeInput"],
            sumberQr: r.sumberQr,
          },
        ])
      );

      return {
        taAktif: { id: taAktif.id, nama: taAktif.nama },
        semester,
        rombel,
        peserta,
        existing,
        rekap,
        tanggal,
      } satisfies PageData;
    }
  );

  if (!data.taAktif || !data.semester) {
    return (
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Absensi Harian</h1>
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

  const tanggalAktif = data.tanggal;
  const rombelTerpilih = sp.rombonganBelajarId
    ? data.rombel.find((r) => r.id === sp.rombonganBelajarId)
    : undefined;
  const labelSemester = data.semester === "ganjil" ? "Ganjil" : "Genap";
  const pesertaNama = new Map(data.peserta.map((p) => [p.id, p.nama]));

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Absensi Harian</h1>
        <p className="text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {akses.membership.orgName} · Periode Aktif:{" "}
          {data.taAktif.nama} · Semester {labelSemester} · Peran Anda:{" "}
          {akses.membership.roleSlug}
          {bolehTulis ? "" : " (hanya baca)"}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Pilih Rombongan Belajar
        </h2>
        <DaftarRombonganBelajarAbsensi
          rombonganBelajar={data.rombel}
          selectedId={sp.rombonganBelajarId}
          tanggal={tanggalAktif}
        />
      </div>

      {rombelTerpilih && tanggalAktif && (
        <>
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              {rombelTerpilih.nama} · Tanggal {tanggalAktif}
            </h2>

            {bolehTulis ? (
              <FormAbsensi
                action={catatAbsensiAction}
                actionUbah={ubahAbsensiAction}
                rombonganBelajarId={rombelTerpilih.id}
                tanggal={tanggalAktif}
                peserta={data.peserta}
                existing={data.existing}
              />
            ) : data.peserta.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                Belum ada Peserta Didik.
              </p>
            ) : (
              <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                Anda hanya dapat membaca Absensi. Peran Anda tidak dapat mengisi
                kehadiran.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Rekap Absensi
            </h2>
            <RekapAbsensiTable rekap={data.rekap} pesertaNama={pesertaNama} />
          </div>
        </>
      )}
    </section>
  );
}
