/** A Keanggotaan Satuan Pendidikan (mirrors a WorkOS OrganizationMembership). */
export interface Membership {
  /** WorkOS Organization.id — the tenant boundary (= Satuan Pendidikan). */
  orgId: string;
  orgName: string;
  /** tenant_role slug (never superuser). */
  roleSlug: string;
}

/**
 * Outcome of resolving the active Satuan Pendidikan for an authenticated
 * Pengguna.
 */
export type TenantResolution =
  | { status: "denied" }
  | { status: "choose"; memberships: Membership[] }
  | { status: "active"; membership: Membership };
