import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { DEMO_TENANTS } from "@/db/seed/tenant";
import * as schema from "@/db/schema";
import type { Membership, RoleSlug } from "./types";

/**
 * Closed vocabulary of recognized tenant_role slugs. Must stay in sync with the
 * `RoleSlug` union in ./types. Mirrors `PERAN_KE_IZIN_DEFAULT` keys.
 */
const KNOWN_ROLES: ReadonlySet<string> = new Set([
  "admin_satuan_pendidikan",
  "guru",
  "wali_kelas",
  "kepala_sekolah",
  "dev",
]);

/**
 * Runtime-validate a WorkOS `role.slug` (a free-form string at the API
 * boundary) into our closed `RoleSlug` union. Unrecognized slugs fall back to
 * `"guru"` — the least-privilege role (empty default izin) — rather than
 * bypassing the type system via `as RoleSlug`. This is defense-in-depth: an
 * unknown slug never silently gains admin powers. (Identity doc §6/§13.)
 */
function safeRoleSlug(slug: string | undefined | null): RoleSlug {
  if (slug && KNOWN_ROLES.has(slug)) return slug as RoleSlug;
  return "guru";
}

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
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DEV_MEMBERSHIP_ALL=true tidak boleh aktif di produksi — server berhenti."
      );
    }
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
    const rows = await db
      .select()
      .from(schema.satuanPendidikan)
      .where(inArray(schema.satuanPendidikan.id, DEMO_TENANTS.map((t) => t.id)));
    return rows.map((row) => ({
      orgId: row.id,
      orgName: row.nama,
      roleSlug: "dev",
    }));
  }
}
