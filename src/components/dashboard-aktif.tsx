import { getDb, withTenant } from "@/db/client";
import * as schema from "@/db/schema";
import type { Membership } from "@/lib/auth/server";

import { DaftarModul } from "./dashboard-aktif/daftar-modul";
import { KepalaDashboard } from "./dashboard-aktif/kepala-dashboard";
import { RingkasanTenant } from "./dashboard-aktif/ringkasan-tenant";
import { hitungIzinReachability } from "./dashboard-aktif/izin-reachability";

/**
 * Active Satuan Pendidikan dashboard surface. Reads tenant-scoped data using a
 * tenant context derived from the authenticated membership (not the browser),
 * proving the #3 + #4 wiring end-to-end. DB access is optional/guarded.
 *
 * Komponen ini adalah orchestrator: data fetching + hitung reachability tetap
 * di sini (server component); presentasi di-delegasikan ke sub-komponen di
 * `./dashboard-aktif/` (KepalaDashboard, RingkasanTenant, DaftarModul).
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

  const reachability = hitungIzinReachability(membership.roleSlug);

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <KepalaDashboard
        orgName={membership.orgName}
        roleSlug={membership.roleSlug}
      />

      <RingkasanTenant
        bolehAtur={reachability.bolehAtur}
        jumlahCatatan={jumlahCatatan}
      />

      <DaftarModul reachability={reachability} />
    </div>
  );
}
