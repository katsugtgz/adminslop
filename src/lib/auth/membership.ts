import { getWorkOS } from "@workos-inc/authkit-nextjs";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import type { Membership, RoleSlug } from "./types";

export interface MembershipProvider {
  listForUser(userId: string): Promise<Membership[]>;
}

/**
 * Pick the membership source. Production resolves Keanggotaan from WorkOS
 * (OrganizationMembership). The dev shim (DEV_MEMBERSHIP_ALL=true) treats the
 * signed-in Pengguna as a member of every seeded Satuan Pendidikan so the
 * active-tenant flow is exercisable locally without provisioning WorkOS
 * organizations. Both are server-side; neither trusts the browser.
 */
export function membershipProvider(): MembershipProvider {
  if (process.env.DEV_MEMBERSHIP_ALL === "true") {
    return new DevMembershipProvider();
  }
  return new WorkOSMembershipProvider();
}

export async function listMembershipsForUser(userId: string): Promise<Membership[]> {
  return membershipProvider().listForUser(userId);
}

class WorkOSMembershipProvider implements MembershipProvider {
  async listForUser(userId: string): Promise<Membership[]> {
    const workos = getWorkOS();
    const result = await workos.userManagement.listOrganizationMemberships({
      userId,
    });

    const out: Membership[] = [];
    for (const membership of result.data) {
      if (membership.status !== "active") continue;
      out.push({
        orgId: membership.organizationId,
        orgName: membership.organizationName,
        // WorkOS `role.slug` is a free-form string at the API boundary; cast
        // to our closed RoleSlug union here so the rest of the codebase gets
        // compile-time safety. Unknown slugs become "guru" below.
        roleSlug: (membership.role?.slug ?? "guru") as RoleSlug,
      });
    }
    return out;
  }
}

class DevMembershipProvider implements MembershipProvider {
  async listForUser(): Promise<Membership[]> {
    const { db } = getDb();
    const rows = await db.select().from(schema.satuanPendidikan);
    return rows.map((row) => ({
      orgId: row.id,
      orgName: row.nama,
      roleSlug: "dev",
    }));
  }
}
