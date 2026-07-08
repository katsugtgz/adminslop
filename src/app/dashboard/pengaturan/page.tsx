import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";

import { FormPengaturan } from "@/components/pengaturan-satuan/form-pengaturan";
import { FormProfil } from "@/components/pengaturan-satuan/form-profil";
import { PageReveal } from "@/components/motion";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { Button } from "@/components/ui/button";
import { getDb, withTenant } from "@/db/client";
import { getProfilDanPengaturan } from "@/db/queries/satuan-pendidikan";
import {
  canAdminSatuanPendidikan,
  canViewPengaturanSatuanPendidikan,
} from "@/lib/auth/otorisasi";
import { getActiveTenantContext } from "@/lib/auth/server";
import { type StyleWithVars } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const ctx = await getActiveTenantContext();

  if (ctx.status === "denied") {
    return <PembatasanAkses authenticated={ctx.authenticated} />;
  }

  if (ctx.status === "choose") {
    return (
      <PageReveal
        as="section"
        className="bg-grain relative isolate mx-auto flex max-w-md flex-col items-center gap-5 overflow-hidden rounded-2xl border border-border/60 bg-card p-8 text-center text-card-foreground shadow-warm"
      >
        <div
          aria-hidden="true"
          className="hero-glow pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl"
          style={{ "--glow-opacity": 0.3, "--glow-extent": "70%" } as StyleWithVars}
        />
        <div className="relative flex flex-col items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"
          >
            <Settings className="h-6 w-6" />
          </span>
          <h1 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
            Pilih Satuan Pendidikan
          </h1>
          <p className="text-sm text-muted-foreground">
            Anda belum memilih Satuan Pendidikan aktif. Silakan pilih Satuan
            Pendidikan dari Beranda untuk mengelola pengaturan.
          </p>
          <Button asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Kembali ke Beranda
            </Link>
          </Button>
        </div>
      </PageReveal>
    );
  }

  const { membership } = ctx;
  const { db } = getDb();
  const row = await withTenant(db, membership.orgId, (tx) =>
    getProfilDanPengaturan(tx, membership.orgId),
  );

  if (!row) {
    return (
      <PageReveal
        as="section"
        className="bg-grain relative isolate mx-auto max-w-md overflow-hidden rounded-2xl border border-border/60 bg-card p-8 text-center text-card-foreground shadow-warm"
      >
        <h1 className="font-display text-2xl tracking-tight text-foreground">
          Pengaturan Sekolah
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Data Satuan Pendidikan belum tersedia. Hubungi admin.
        </p>
      </PageReveal>
    );
  }

  if (!canViewPengaturanSatuanPendidikan(membership.roleSlug)) {
    return <PembatasanAkses />;
  }

  const readOnly = !canAdminSatuanPendidikan(membership.roleSlug);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-8 md:gap-10">
      <PageReveal
        as="header"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div
          aria-hidden="true"
          className="hero-glow pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{ "--glow-opacity": 0.35, "--glow-extent": "70%" } as StyleWithVars}
        />
        <div className="relative flex flex-col gap-3">
          <p className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Konfigurasi Satuan
          </p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Pengaturan Sekolah
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {membership.orgName} — peran:{" "}
            <span className="font-medium text-foreground">
              {membership.roleSlug}
            </span>
          </p>
        </div>
      </PageReveal>

      <div className="flex flex-col gap-6">
        <PageReveal
          delay={2}
          className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
        >
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
              01 — Identitas
            </p>
            <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
              Profil Satuan Pendidikan
            </h2>
          </div>
          <FormProfil values={row} readOnly={readOnly} />
        </PageReveal>

        <PageReveal
          delay={3}
          className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
        >
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
              02 — Operasional
            </p>
            <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
              Pengaturan Satuan Pendidikan
            </h2>
          </div>
          <FormPengaturan values={row} readOnly={readOnly} />
        </PageReveal>
      </div>
    </section>
  );
}
