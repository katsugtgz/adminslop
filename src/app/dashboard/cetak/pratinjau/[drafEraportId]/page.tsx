import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import { getKontenCetak } from "@/db/queries/cetak";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { PratinjauEraport } from "@/components/cetak/pratinjau-eraport";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";
import { Button } from "@/components/ui/button";
import { PageReveal } from "@/components/motion";

export const dynamic = "force-dynamic";

/**
 * Pratinjau Cetak (#14 AC#3 golden visual target) — renders a TERBIT (or any)
 * E-Raport's konten in print-ready HTML. The paper size (A4 / F4) comes from
 * the Satuan Pendidikan preferensi, layered with the default Template Cetak
 * pengaturan. School identity (nama, NPSN, alamat, logo) renders in the header;
 * Tanda Tangan + Stempel placeholders render at the bottom.
 *
 * AC#4: the Tanda Tangan and Stempel areas are PRINT ELEMENTS for document
 * formatting only — NOT legal signatures or approval proof.
 *
 * Visibility is defense-in-depth UI (identity doc §12) — `cetak:baca` gates
 * the page; tenant scope comes ONLY from `akses.membership.orgId` (§13). The
 * `drafEraportId` route param is resolved under `withTenant` so a cross-tenant
 * id simply resolves to null (404), never a leak.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ drafEraportId: string }>;
}) {
  const [{ drafEraportId }, akses] = await Promise.all([
    params,
    getAksesSaya(),
  ]);

  if (akses.status === "denied") {
    return <PembatasanAkses />;
  }
  if (akses.status === "choose") {
    return <PilihSatuanPendidikan memberships={[...akses.memberships]} />;
  }

  if (!akses.boleh("cetak:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const { db } = getDb();
  const konten = await withTenant(db, akses.membership.orgId, async (tx) =>
    getKontenCetak(tx, drafEraportId)
  );

  if (!konten) {
    notFound();
  }

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
              "radial-gradient(circle, oklch(0.68 0.16 42 / 0.4) 0%, transparent 70%)",
          }}
        />
        <div className="relative">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
            04 — Cetak · Pratinjau
          </p>
          <h1 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Pratinjau Cetak
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {akses.membership.orgName} · Semester: {konten.semester} · Status:{" "}
            {konten.status}
          </p>
          {/*
            Two print paths: (1) the on-screen Pratinjau below + browser print
            dialog is the AC#3 golden target; (2) this "Unduh PDF" link is the
            Task 14 server-rendered PDF vertical slice. The link is convenience
            UI only — the GET route handler is the authz boundary (identity doc
            §12; "hiding UI is not authorization").
          */}
          <Link
            href={`/dashboard/cetak/pratinjau/${drafEraportId}/pdf`}
            download
            className="no-print mt-4 inline-flex w-fit"
          >
            <Button type="button" variant="outline" size="sm">
              <Download className="h-4 w-4" aria-hidden="true" />
              Unduh PDF
            </Button>
          </Link>
        </div>
      </PageReveal>

      <PageReveal delay={2}>
        <PratinjauEraport konten={konten} />
      </PageReveal>
    </div>
  );
}
