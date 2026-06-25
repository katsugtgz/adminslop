/**
 * App-side tenant_role slugs for a Keanggotaan Satuan Pendidikan.
 * Never `superuser` (per docs/architecture/identity-and-access.md §6).
 * `dev` is a local-only admin-equivalent shim enabled by DEV_MEMBERSHIP_ALL.
 */
export type RoleSlug =
  | "admin_satuan_pendidikan"
  | "guru"
  | "kepala_sekolah"
  | "dev";

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
