import type { RoleSlug } from "./types";

const ADMIN_WRITE_ROLES: ReadonlySet<string> = new Set([
  "admin_satuan_pendidikan",
  "dev",
]);

const MEMBER_ROLES: ReadonlySet<string> = new Set([
  "admin_satuan_pendidikan",
  "dev",
  "guru",
  "kepala_sekolah",
]);

/**
 * Write predicate for Profil/Pengaturan Satuan Pendidikan. Type guard so
 * callers narrow to `RoleSlug` when guarding an admin action.
 */
export function canAdminSatuanPendidikan(
  roleSlug: string | undefined,
): roleSlug is RoleSlug {
  return !!roleSlug && ADMIN_WRITE_ROLES.has(roleSlug);
}

/** Read predicate — any active member may view their Satuan Pendidikan profil/pengaturan. */
export function canViewPengaturanSatuanPendidikan(
  roleSlug: string | undefined,
): boolean {
  return !!roleSlug && MEMBER_ROLES.has(roleSlug);
}
