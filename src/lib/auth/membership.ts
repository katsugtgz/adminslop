import { getWorkOS } from "@workos-inc/authkit-nextjs";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import type { Membership, RoleSlug } from "./types";

export interface MembershipProvider {
  listForUser(userId: string): Promise<Membership[]>;
}

/**
 * Validate a WorkOS `role.slug` (free-form string at the API boundary) against
 * our closed `RoleSlug` set before narrowing. Unknown/absent → "guru"
 * (least-privilege). SECURITY: the `as RoleSlug` below is justified by the
 * `KNOWN_ROLES.has(...)` guard — it is NOT a blind cast of an untrusted string
 * (this is the exact pattern cubic P1-1 required replacing the old blind cast).
 */
const KNOWN_ROLES = new Set<RoleSlug>([
  "admin_satuan_pendidikan",
  "guru",
  "wali_kelas",
  "kepala_sekolah",
  "dev",
]);

function safeRoleSlug(slug: string | undefined): RoleSlug {
  if (slug && KNOWN_ROLES.has(slug as RoleSlug)) return slug as RoleSlug;
  return "guru";
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
        roleSlug: safeRoleSlug(membership.role?.slug),
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
