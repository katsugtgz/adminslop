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
 * The `denied` outcome carries an `authenticated` bit so the page layer can
 * disambiguate "no session" from "signed in but no Keanggotaan" without a
 * second `withAuth` round-trip.
 */
export async function getActiveTenantContext(): Promise<TenantResolution> {
  // cache()-wrapping was considered and rejected — see ADR 0008 Decision 1 (Shape A3 rejected).
  const auth = await withAuth();
  if (!auth.user) return { status: "denied", authenticated: false };

  const memberships = await listMembershipsForUser(auth.user.id);
  const requested =
    (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value ?? null;

  return resolveActiveTenant({
    memberships,
    requestedOrgId: requested,
    authenticated: true,
  });
}

/**
 * Thin session-only escape hatch — returns the authenticated Pengguna's WorkOS
 * user id, or null. Narrow scope: this is NOT an authorization resolver. It
 * does not touch Keanggotaan, tenant context, or izin. Use it only when you
 * need the bare authenticated identity outside the composed `getAksesSaya`
 * flow — e.g. the `signOutAction` audit row, a pre-tenant audit `aktor` field
 * before membership is resolved, or a "is this session even real?" check that
 * must not depend on tenant state. For any tenant-scoped decision, call
 * {@linkcode getAksesSaya} or {@linkcode getActiveTenantContext} instead.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const auth = await withAuth();
  return auth.user?.id ?? null;
}

/**
 * Authentication gate for server actions. Wraps WorkOS `withAuth` under a name
 * the `react-doctor/server-auth-actions` rule recognizes. This is the
 * AUTHENTICATION first line — the real AUTHORIZATION gate remains
 * `getAksesSaya().boleh(...)` (identity doc §12). Throws if no session.
 */
export async function requireAuth(): Promise<{ userId: string }> {
  const auth = await withAuth();
  if (!auth.user) throw new Error("Belum terautentikasi.");
  return { userId: auth.user.id };
}
