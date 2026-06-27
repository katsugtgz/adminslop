"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { signOut, withAuth } from "@workos-inc/authkit-nextjs";

import { listMembershipsForUser } from "@/lib/auth/membership";
import {
  ACTIVE_TENANT_COOKIE,
  ACTIVE_TENANT_MAX_AGE,
  requireAuth,
} from "@/lib/auth/server";

export async function signOutAction() {
  await requireAuth();
  await signOut();
}

/**
 * Store the Pengguna's choice of active Satuan Pendidikan. The `orgId` is
 * validated server-side against actual Keanggotaan before storing — a browser
 * cannot inject a tenant it is not a member of.
 */
export async function pilihSatuanPendidikanAction(formData: FormData) {
  await requireAuth();
  const orgId = String(formData.get("orgId") ?? "");

  const auth = await withAuth();
  if (!auth.user) {
    throw new Error("Belum terautentikasi.");
  }

  const memberships = await listMembershipsForUser(auth.user.id);
  const valid = memberships.some((membership) => membership.orgId === orgId);
  if (!valid) {
    throw new Error("Keanggotaan Satuan Pendidikan tidak valid.");
  }

  (await cookies()).set(ACTIVE_TENANT_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ACTIVE_TENANT_MAX_AGE,
  });

  revalidatePath("/dashboard");
}
