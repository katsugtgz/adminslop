import { PageReveal } from "@/components/motion";
import { type StyleWithVars } from "@/lib/utils";

/**
 * Header modul Manajemen Penilaian. Menampilkan nomor modul (02 — Penilaian),
 * nama Satuan Pendidikan Aktif, periode aktif (Tahun Ajaran + Semester), peran
 * pengguna, dan indikator "hanya baca" bila pengguna tidak boleh menulis.
 *
 * Dekorasi latar (blur radial) dipertahankan persis seperti desain asli.
 */
export function HeaderPenilaian({
  orgName,
  taNama,
  semester,
  roleSlug,
  bolehTulis,
}: {
  orgName: string;
  taNama: string;
  semester: string;
  roleSlug: string;
  bolehTulis: boolean;
}) {
  return (
    <PageReveal
      as="header"
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
    >
      <div
        aria-hidden="true"
        className="hero-glow pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-40 blur-3xl"
        style={{ "--glow-opacity": 0.4, "--glow-extent": "70%" } as StyleWithVars}
      />
      <div className="relative">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
          02 — Penilaian
        </p>
        <h1 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
          Penilaian
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Satuan Pendidikan Aktif: {orgName} · Periode Aktif:{" "}
          {taNama} · Semester {semester} · Peran Anda:{" "}
          {roleSlug}
          {bolehTulis ? "" : " (hanya baca)"}
        </p>
      </div>
    </PageReveal>
  );
}
