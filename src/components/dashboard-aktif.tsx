import Link from "next/link";
import {
  Building2,
  Calendar,
  CheckCircle2,
  GraduationCap,
  KeyRound,
  Users,
} from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import * as schema from "@/db/schema";
import { dapatMelihatAkses, PERAN_KE_IZIN_DEFAULT } from "@/lib/auth/otorisasi";
import type { Membership } from "@/lib/auth/server";

import { Button } from "@/components/ui/button";

/**
 * Active Satuan Pendidikan dashboard surface. Reads tenant-scoped data using a
 * tenant context derived from the authenticated membership (not the browser),
 * proving the #3 + #4 wiring end-to-end. DB access is optional/guarded.
 */
export async function DashboardAktif({
  membership,
}: {
  membership: Membership;
}) {
  let jumlahCatatan: number | null = null;
  try {
    const { db } = getDb();
    jumlahCatatan = await withTenant(db, membership.orgId, async (tx) => {
      const rows = await tx.select().from(schema.contohCatatan);
      return rows.length;
    });
  } catch {
    jumlahCatatan = null; // database not configured in this environment
  }

  // Reachability link to the Akses management surface (#6 / T6). Visible when
  // the peran's defaults include `akses:baca` (admin / kepala_sekolah / dev).
  // The linked PAGE re-checks `boleh("akses:baca")` server-side; this is
  // convenience reachability, not authorization (identity doc §12).
  const bolehLihatAkses = dapatMelihatAkses(membership.roleSlug);

  // Reachability link to Peserta Didik (#7). All member roles receive
  // `peserta_didik:baca` by default (students are core teaching data). The
  // page re-checks `boleh("peserta_didik:baca")` server-side (§12).
  const bolehLihatPesertaDidik = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("peserta_didik:baca");

  // Reachability link to Tahun Ajaran (#8). admin / kepala_sekolah / dev
  // receive `tahun_ajaran:baca`. The page re-checks server-side (§12).
  const bolehLihatTahunAjaran = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("tahun_ajaran:baca");

  // Reachability link to Rombongan Belajar (#8). All member roles receive
  // `rombongan_belajar:baca` (classes are core teaching data). The page
  // re-checks `boleh("rombongan_belajar:baca")` server-side (§12).
  const bolehLihatRombonganBelajar = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("rombongan_belajar:baca");

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          <Building2 className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">Satuan Pendidikan Aktif</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {membership.orgName}
          </h1>
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Peran Anda: {membership.roleSlug}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">Data contoh (tenant)</p>
          <p className="mt-1 text-2xl font-semibold">
            {jumlahCatatan === null ? "—" : jumlahCatatan}
          </p>
          <p className="text-xs text-muted-foreground">
            Jumlah catatan yang terisolasi per Satuan Pendidikan.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-5">
          <p className="text-sm font-medium">Modul segera hadir</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nilai, E-Raport, dan modul lainnya akan aktif di dalam Satuan
            Pendidikan ini.
          </p>
        </div>
      </div>

      {bolehLihatPesertaDidik && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Peserta Didik</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Kelola data Peserta Didik, Wali, Kontak Darurat, dan Mutasi.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/peserta-didik">Buka Peserta Didik</Link>
          </Button>
        </div>
      )}

      {bolehLihatRombonganBelajar && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Rombongan Belajar</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Kelola Tingkat, Rombongan Belajar, Penempatan, dan Kenaikan
                Tingkat.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/rombongan-belajar">Buka Rombongan Belajar</Link>
          </Button>
        </div>
      )}

      {bolehLihatTahunAjaran && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Calendar className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Tahun Ajaran</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Kelola Tahun Ajaran dan Semester Aktif untuk Satuan Pendidikan
                ini.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/tahun-ajaran">Buka Tahun Ajaran</Link>
          </Button>
        </div>
      )}

      {bolehLihatAkses && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Manajemen Akses</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Kelola PTK, Pengguna, Izin, dan Pembatasan untuk Satuan
                Pendidikan ini.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/akses">Buka Manajemen Akses</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
