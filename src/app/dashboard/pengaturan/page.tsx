import Link from "next/link";

import { FormPengaturan } from "@/components/pengaturan-satuan/form-pengaturan";
import { FormProfil } from "@/components/pengaturan-satuan/form-profil";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { Button } from "@/components/ui/button";
import { getDb, withTenant } from "@/db/client";
import { getProfilDanPengaturan } from "@/db/queries/satuan-pendidikan";
import {
  canAdminSatuanPendidikan,
  canViewPengaturanSatuanPendidikan,
} from "@/lib/auth/otorisasi";
import { getActiveTenantContext } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const ctx = await getActiveTenantContext();

  if (ctx.status === "denied") {
    return <PembatasanAkses />;
  }

  if (ctx.status === "choose") {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">
          Pilih Satuan Pendidikan
        </h1>
        <p className="text-sm text-muted-foreground">
          Anda belum memilih Satuan Pendidikan aktif. Silakan pilih Satuan
          Pendidikan dari Dashboard untuk mengelola pengaturan.
        </p>
        <Button asChild>
          <Link href="/dashboard">Kembali ke Dashboard</Link>
        </Button>
      </section>
    );
  }

  const { membership } = ctx;
  const { db } = getDb();
  const row = await withTenant(db, membership.orgId, (tx) =>
    getProfilDanPengaturan(tx, membership.orgId),
  );

  if (!row) {
    return (
      <section className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">Pengaturan Sekolah</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Data Satuan Pendidikan belum tersedia. Hubungi admin.
        </p>
      </section>
    );
  }

  if (!canViewPengaturanSatuanPendidikan(membership.roleSlug)) {
    return <PembatasanAkses />;
  }

  const readOnly = !canAdminSatuanPendidikan(membership.roleSlug);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Pengaturan Sekolah</h1>
        <p className="text-sm text-muted-foreground">
          {membership.orgName} — peran: {membership.roleSlug}
        </p>
      </header>

      <div className="space-y-6">
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Profil Satuan Pendidikan</h2>
          <FormProfil values={row} readOnly={readOnly} />
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold">Pengaturan Satuan Pendidikan</h2>
          <FormPengaturan values={row} readOnly={readOnly} />
        </div>
      </div>
    </section>
  );
}
