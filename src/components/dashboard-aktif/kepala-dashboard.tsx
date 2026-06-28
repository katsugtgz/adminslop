import Link from "next/link";
import { Building2, CheckCircle2, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageReveal } from "@/components/motion";
import { IndikatorOffline } from "@/components/offline/indikator-offline";

const LABEL_PERAN: Record<string, string> = {
  admin_satuan_pendidikan: "Admin Satuan Pendidikan",
  wali_kelas: "Wali Kelas",
  kepala_sekolah: "Kepala Sekolah",
  guru: "Guru",
  dev: "Pengembang",
};

/**
 * Kepala (header) dashboard Satuan Pendidikan aktif. Menampilkan nama Satuan
 * Pendidikan, peran pengguna, indikator Mode Offline, dan tombol Pusat
 * Bantuan. Dekorasi latar (blur radial + watermark "00") tetap dipertahankan
 * sesuai desain asli.
 */
export function KepalaDashboard({
  orgName,
  roleSlug,
}: {
  orgName: string;
  roleSlug: string;
}) {
  const labelPeran = LABEL_PERAN[roleSlug] ?? roleSlug;

  return (
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
            {orgName}
          </h1>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />
            Peran Anda: {labelPeran}
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
  );
}
