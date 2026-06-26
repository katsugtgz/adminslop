import { notFound } from "next/navigation";

import { getDb, withTenant } from "@/db/client";
import { getKontenCetak } from "@/db/queries/cetak";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { PratinjauEraport } from "@/components/cetak/pratinjau-eraport";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

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
  const { drafEraportId } = await params;

  const akses = await getAksesSaya();

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
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Pratinjau Cetak</h1>
        <p className="text-sm text-muted-foreground">
          {akses.membership.orgName} · Semester: {konten.semester} · Status:{" "}
          {konten.status}
        </p>
      </header>

      <PratinjauEraport konten={konten} />
    </section>
  );
}
