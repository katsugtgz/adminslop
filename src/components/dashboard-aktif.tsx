import { Building2, CheckCircle2 } from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import * as schema from "@/db/schema";
import type { Membership } from "@/lib/auth/server";

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
            Peserta Didik, Nilai, E-Raport, dan modul lainnya akan aktif di
            dalam Satuan Pendidikan ini.
          </p>
        </div>
      </div>
    </section>
  );
}
