import { withAuth } from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";

import { listMembershipsForUser } from "./membership";
import { resolveActiveTenant } from "./resolve-active-tenant";
import type { Membership, TenantResolution } from "./types";

export type { Membership, TenantResolution };

/** httpOnly cookie holding the Pengguna's chosen active Satuan Pendidikan. */
export const ACTIVE_TENANT_COOKIE = "eapp_active_org";
export const ACTIVE_TENANT_MAX_AGE = 60 * 60 * 24 * 30; // 30 hari

/**
 * Resolve the active Satuan Pendidikan for the current request. Reads the
 * authenticated session server-side, fetches Keanggotaan from the membership
 * provider, and re-validates the stored choice against real memberships. The
 * tenant boundary is never derived from the browser.
 *
 * Must run on a route covered by `src/middleware.ts` (so `withAuth` works).
 */
export async function getActiveTenantContext(): Promise<TenantResolution> {
  const auth = await withAuth();
  if (!auth.user) return { status: "denied" };

  const memberships = await listMembershipsForUser(auth.user.id);
  const requested =
    (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value ?? null;

  return resolveActiveTenant({ memberships, requestedOrgId: requested });
}

/** The authenticated Pengguna's WorkOS user id, or null. */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const auth = await withAuth();
  return auth.user?.id ?? null;
}
