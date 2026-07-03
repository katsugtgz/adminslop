import { getActiveTenantContext } from "@/lib/auth/server";

import { DashboardAktif } from "@/components/dashboard-aktif";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const context = await getActiveTenantContext();

  if (context.status === "denied") {
    // The composed resolver already paid for the withAuth round-trip; read the
    // authenticated bit straight off the denied branch instead of firing a
    // second getAuthenticatedUserId() call.
    return <PembatasanAkses authenticated={context.authenticated} />;
  }
  if (context.status === "choose") {
    return <PilihSatuanPendidikan memberships={context.memberships} />;
  }
  return <DashboardAktif membership={context.membership} />;
}
