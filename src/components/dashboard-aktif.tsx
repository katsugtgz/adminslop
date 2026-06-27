import Link from "next/link";
import {
  Archive,
  Bell,
  BookMarked,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  FileText,
  GraduationCap,
  Printer,
  CloudOff,
  HelpCircle,
  KeyRound,
  Settings,
  Upload,
  Users,
} from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import * as schema from "@/db/schema";
import {
  canAdminSatuanPendidikan,
  dapatMelihatAkses,
  PERAN_KE_IZIN_DEFAULT,
} from "@/lib/auth/otorisasi";
import type { Membership } from "@/lib/auth/server";

import { Button } from "@/components/ui/button";
import { CardHover, PageReveal } from "@/components/motion";
import { IndikatorOffline } from "@/components/offline/indikator-offline";

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

  // Pengaturan nav link (#5): visible only to admin roles. The linked PAGE
  // re-checks authorization server-side; this is convenience reachability.
  const bolehAtur = canAdminSatuanPendidikan(membership.roleSlug);

  // Akses management reachability link (#6 / T6). Visible when the peran's
  // defaults include `akses:baca` (admin / kepala_sekolah / dev). The linked
  // PAGE re-checks `boleh("akses:baca")` server-side; this is convenience
  // reachability, not authorization (identity doc §12).
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

  // Reachability link to Kurikulum (#9). Every member role receives
  // `kurikulum:baca` — curriculum reference data is universal read-only. The
  // page re-checks `boleh("kurikulum:baca")` server-side (§12).
  const bolehLihatKurikulum = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("kurikulum:baca");

  // Reachability link to Beban Mengajar (#10). All member roles receive
  // `beban_mengajar:baca` — teaching load is core data for every role. The
  // page re-checks `boleh("beban_mengajar:baca")` server-side (§12).
  const bolehLihatBebanMengajar = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("beban_mengajar:baca");

  // Reachability link to Penilaian (#11). All member roles receive
  // `penilaian:baca` — grades are core data for every role. The page
  // re-checks `boleh("penilaian:baca")` server-side (§12) and applies
  // ownership-scoped gating for writes.
  const bolehLihatPenilaian = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("penilaian:baca");

  // Reachability link to Permintaan AI (#12). All member roles receive
  // `permintaan_ai:baca` — AI requests are visible to every role. The
  // page re-checks `boleh("permintaan_ai:baca")` server-side (§12) and
  // applies AC#3 DUAL authz (verification gate) for draf_ai writes.
  const bolehLihatPermintaanAi = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("permintaan_ai:baca");

  // Reachability link to Absensi (#15). Every member role receives
  // `absensi:baca` — daily attendance is core teaching data for every role
  // (kepala_sekolah reads for oversight). The page re-checks
  // `boleh("absensi:baca")` server-side (§12); writes apply AC#4 ownership.
  const bolehLihatAbsensi = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("absensi:baca");

  // Reachability link to Sinkronisasi Data (#21 Mode Offline). Every member
  // role receives `offline:baca` — each user may see their own pending drafts.
  // The page is a client shell over localStorage; no server data is loaded.
  const bolehLihatSinkronisasi = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("offline:baca");

  // Reachability link to Impor/Ekspor Peserta Didik (#18). admin /
  // kepala_sekolah / dev receive `impor_peserta_didik:baca` — bulk data
  // movement is admin-only with kepala_sekolah read oversight. The page
  // re-checks `boleh("impor_peserta_didik:baca")` server-side (§12).
  const bolehLihatImporPesertaDidik = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("impor_peserta_didik:baca");

  // Reachability link to Notifikasi (#20). Every member role receives
  // `notifikasi:baca` by default — each user manages their own in-app inbox.
  // The page re-checks `boleh("notifikasi:baca")` server-side (§12).
  const bolehLihatNotifikasi = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("notifikasi:baca");

  // Reachability link to E-Raport (#13). All member roles receive
  // `eraport:baca` — report drafts/terbit/revisi are visible to every role.
  // The page re-checks `boleh("eraport:baca")` server-side (§12) and applies
  // AC#2/AC#3 DUAL authz (no double-terbit, revisi append-only) for writes.
  const bolehLihatEraport = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("eraport:baca");

  // Reachability link to Bank Soal (#16). All member roles receive
  // `bank_soal:baca` — the question bank is core teaching reference data. The
  // page re-checks `boleh("bank_soal:baca")` server-side (§12) and applies
  // AC#2 DUAL authz (verification gate) for AI-generated butir soal writes.
  const bolehLihatBankSoal = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("bank_soal:baca");

  // Reachability link to Perangkat Ajar (#17). All member roles receive
  // `perangkat_ajar:baca` — teaching documents are core data for every role.
  // The page re-checks `boleh("perangkat_ajar:baca")` server-side (§12) and
  // applies AC#3 DUAL authz (verification gate) for dokumen_ai content.
  const bolehLihatPerangkatAjar = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("perangkat_ajar:baca");

  // Reachability link to Arsip (#19). admin / kepala_sekolah / dev receive
  // `arsip:baca` — archive/recovery/retention/history is admin/oversight
  // scope, NOT core teaching data. guru / wali_kelas do NOT see it. The page
  // re-checks `boleh("arsip:baca")` server-side (§12).
  const bolehLihatArsip = PERAN_KE_IZIN_DEFAULT[membership.roleSlug].includes(
    "arsip:baca",
  );

  // Reachability link to Cetak (#14). All member roles receive `cetak:baca` —
  // report preview/print is visible to every role; template + dokumen writes
  // are admin/dev/kepala_sekolah scoped. The page re-checks server-side (§12).
  const bolehLihatCetak = PERAN_KE_IZIN_DEFAULT[
    membership.roleSlug
  ].includes("cetak:baca");

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageReveal
        as="header"
        className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.16 42 / 0.45) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-3 select-none font-display text-[8rem] leading-none tracking-tighter text-foreground/[0.03] sm:text-[10rem]"
        >
          00
        </div>
        <div className="relative flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-warm"
            aria-hidden="true"
          >
            <Building2 className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
              Satuan Pendidikan Aktif
            </p>
            <h1 className="mt-2 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
              {membership.orgName}
            </h1>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
              Peran Anda: {membership.roleSlug}
            </p>
            <div className="mt-3">
              <IndikatorOffline />
            </div>
          </div>
          <Button asChild variant="outline" size="icon" aria-label="Pusat Bantuan">
            <Link href="/dashboard/bantuan">
              <HelpCircle aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </PageReveal>

      {bolehAtur && (
        <PageReveal delay={2}>
          <Link
            href="/dashboard/pengaturan"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-4 text-sm font-medium shadow-warm transition-colors hover:border-accent/40 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Pengaturan Sekolah
          </Link>
        </PageReveal>
      )}

      <PageReveal delay={3} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CardHover className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm hover:border-accent/40">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            Data contoh (tenant)
          </p>
          <p className="mt-2 font-display text-3xl text-foreground">
            {jumlahCatatan === null ? "—" : jumlahCatatan}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Jumlah catatan yang terisolasi per Satuan Pendidikan.
          </p>
        </CardHover>
        <div className="rounded-2xl border border-dashed border-border bg-accent/[0.03] p-5">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-accent/80">
            Segera hadir
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">
            Modul tambahan
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nilai, E-Raport, dan modul lainnya akan aktif di dalam Satuan
            Pendidikan ini.
          </p>
        </div>
      </PageReveal>

      <nav aria-label="Modul Satuan Pendidikan" className="flex flex-col gap-4">
      {bolehLihatSinkronisasi && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <CloudOff className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Sinkronisasi Data (Mode Offline)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Lihat draf tertunda dan sinkronkan saat tersambung kembali.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/sinkronisasi">Buka Sinkronisasi Data</Link>
          </Button>
        </div>
      )}

      {bolehLihatCetak && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <Printer className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Cetak E-Raport</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pratinjau dan cetak E-Raport dengan Template Cetak.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/cetak">Buka Cetak</Link>
          </Button>
        </div>
      )}

      {bolehLihatAbsensi && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <CalendarCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Absensi Harian</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Catat kehadiran harian Peserta Didik.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/absensi">Buka Absensi Harian</Link>
          </Button>
        </div>
      )}

      {bolehLihatPermintaanAi && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Permintaan AI</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Buat permintaan AI dan verifikasi draf.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/permintaan-ai">Buka Permintaan AI</Link>
          </Button>
        </div>
      )}

      {bolehLihatNotifikasi && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <Bell className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Notifikasi</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Lihat pengingat tugas tertunda dan kelola preferensi notifikasi.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/notifikasi">Buka Notifikasi</Link>
          </Button>
        </div>
      )}

      {bolehLihatEraport && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">E-Raport</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Kelola Draf, Terbit, dan Revisi E-Raport.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/eraport">Buka E-Raport</Link>
          </Button>
        </div>
      )}

      {bolehLihatBankSoal && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <FileQuestion className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Bank Soal</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Kelola Butir Soal dan rakit Paket Soal.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/bank-soal">Buka Bank Soal</Link>
          </Button>
        </div>
      )}

      {bolehLihatPerangkatAjar && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <BookMarked className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Perangkat Ajar</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Buat dan kelola Modul Ajar, RPP, Silabus, dan dokumen ajar
                lainnya.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/perangkat-ajar">Buka Perangkat Ajar</Link>
          </Button>
        </div>
      )}

      {bolehLihatPesertaDidik && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
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

      {bolehLihatImporPesertaDidik && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <Upload className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Impor/Ekspor Peserta Didik</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Impor dan ekspor data Peserta Didik.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/impor-peserta-didik">
              Buka Impor/Ekspor
            </Link>
          </Button>
        </div>
      )}

      {bolehLihatRombonganBelajar && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
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
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <Calendar className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Tahun Ajaran</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Kelola Tahun Ajaran aktif dan riwayat.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/tahun-ajaran">Buka Tahun Ajaran</Link>
          </Button>
        </div>
      )}

      {bolehLihatAkses && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
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

      {bolehLihatBebanMengajar && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <Briefcase className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Beban Mengajar</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Lihat Beban Mengajar dan Wali Kelas untuk periode aktif.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/beban-mengajar">Buka Beban Mengajar</Link>
          </Button>
        </div>
      )}

      {bolehLihatPenilaian && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Penilaian</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Kelola Komponen Nilai, Penilaian, dan lihat Nilai Akhir.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/penilaian">Buka Penilaian</Link>
          </Button>
        </div>
      )}

      {bolehLihatArsip && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <Archive className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Arsip Data</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Kelola arsip, pemulihan data, retensi, dan riwayat perubahan.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/arsip">Buka Arsip Data</Link>
          </Button>
        </div>
      )}

      {bolehLihatKurikulum && (
        <div       className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg sm:flex-row sm:items-center sm:justify-between t-lift">
          <div className="flex items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
              aria-hidden="true"
            >
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Kurikulum</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Jelajahi Kurikulum Merdeka: Mata Pelajaran, Fase, Capaian, dan
                Tujuan Pembelajaran.
              </p>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/kurikulum">Buka Kurikulum</Link>
          </Button>
        </div>
      )}
      </nav>
    </div>
  );
}
