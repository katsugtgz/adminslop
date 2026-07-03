import type { Membership, TenantResolution } from "./types";

/**
 * Pure resolver for the active Satuan Pendidikan. The membership list is always
 * server-derived; `requestedOrgId` is the user's previously stored choice
 * (httpOnly cookie), re-validated against actual memberships on every call —
 * never trusted blindly.
 *
 * `authenticated` is threaded straight through to the `denied` branch — the
 * resolver itself is pure and has no I/O, so the caller (which already ran
 * `withAuth`) supplies the bit. This keeps the "no session" vs "no Keanggotaan"
 * disambiguation free of a second auth round-trip.
 *
 * Rules:
 *   - no memberships            -> denied (Pembatasan Akses)
 *   - exactly one membership    -> active (auto-select)
 *   - many + valid request      -> active (that membership)
 *   - many + missing/invalid    -> choose (prompt the Pengguna)
 */
export function resolveActiveTenant(input: {
  memberships: Membership[];
  requestedOrgId?: string | null;
  authenticated: boolean;
}): TenantResolution {
  const { memberships, requestedOrgId, authenticated } = input;

  if (memberships.length === 0) {
    return { status: "denied", authenticated };
  }

  if (memberships.length === 1) {
    return { status: "active", membership: memberships[0] };
  }

  if (requestedOrgId) {
    const match = memberships.find((m) => m.orgId === requestedOrgId);
    if (match) {
      return { status: "active", membership: match };
    }
  }

  return { status: "choose", memberships };
}
