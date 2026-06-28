import { getActiveTenantContext, getAuthenticatedUserId } from "@/lib/auth/server";

import { DashboardAktif } from "@/components/dashboard-aktif";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const context = await getActiveTenantContext();

  if (context.status === "denied") {
    const authenticated = (await getAuthenticatedUserId()) !== null;
    return <PembatasanAkses authenticated={authenticated} />;
  }
  if (context.status === "choose") {
    return <PilihSatuanPendidikan memberships={context.memberships} />;
  }
  return <DashboardAktif membership={context.membership} />;
}
