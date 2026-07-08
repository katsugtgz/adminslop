"use server";

import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { catatAudit, getDb, withTenant } from "@/db/client";
import * as schema from "@/db/schema";
import { listMembershipsForUser } from "@/lib/auth/membership";
import {
  ACTIVE_TENANT_COOKIE,
  ACTIVE_TENANT_MAX_AGE,
  requireAuth,
} from "@/lib/auth/server";
import { OnboardingSatuanPendidikanSchema } from "./schemas";

/**
 * Provisioning role for the first Pengguna of a new Satuan Pendidikan. The
 * creator always becomes `admin_satuan_pendidikan` — subsequent members join
 * via WorkOS-managed membership creation (identity doc §14), never via this
 * self-service flow.
 */
const ROLE_PEMBUAT = "admin_satuan_pendidikan" as const;

/**
 * Self-service Satuan Pendidikan provisioning (identity doc §14, implemented
 * Phase 2). An authenticated Pengguna with NO existing Keanggotaan creates a
 * new WorkOS Organization + the matching `satuan_pendidikan` tenant row +
 * their own `pengguna` row, then lands on `/dashboard` with the new org active.
 *
 * SYNC INVARIANT: `satuan_pendidikan.id === WorkOS organization.id`. The WorkOS
 * org is created first (it mints the id), then the DB row mirrors it.
 *
 * WorkOS resource creation is NOT transactional with the app DB — WorkOS calls
 * run outside `withTenant`. On DB failure the WorkOS org/membership already
 * exist; the user sees a Bahasa error and can retry safely (a duplicate
 * `satuan_pendidikan.id` insert would surface the conflict). Full compensating
 * rollback is deferred (identity doc §14 is provisional).
 */
export async function buatSatuanPendidikanBaruAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ ok: false; error: string } | void> {
  await requireAuth();

  const auth = await withAuth();
  if (!auth.user) {
    return { ok: false, error: "Belum terautentikasi." };
  }
  const user = auth.user;

  // Onboarding gate: reject if the Pengguna already belongs to any Satuan
  // Pendidikan. The page redirects pre-emptively, but the action must defend
  // itself — a user could POST the action directly while holding memberships.
  const existing = await listMembershipsForUser(user.id);
  if (existing.length > 0) {
    return {
      ok: false,
      error:
        "Anda sudah memiliki Satuan Pendidikan. Onboarding tidak tersedia.",
    };
  }

  const parsed = OnboardingSatuanPendidikanSchema.safeParse({
    nama: String(formData.get("nama") ?? ""),
    jenjang: String(formData.get("jenjang") ?? ""),
    alamat: String(formData.get("alamat") ?? ""),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: `Data tidak valid: ${parsed.error.issues
        .map((i) => i.message)
        .join("; ")}`,
    };
  }
  const { nama, jenjang, alamat } = parsed.data;

  const workos = getWorkOS();

  // 1. Create the WorkOS Organization — this mints the canonical tenant id.
  const org = await workos.organizations.createOrganization({
    name: nama,
    metadata: {
      jenjang,
      ...(alamat ? { alamat } : {}),
    },
  });

  // 2. Grant the creator an administrative Keanggotaan in the new org. Done
  //    before the DB writes so a membership always backs the tenant row; if
  //    this throws, no DB row is created and the org is an orphan (surfaced
  //    as a Bahasa error — see function-level note on deferred rollback).
  await workos.userManagement.createOrganizationMembership({
    organizationId: org.id,
    userId: user.id,
    roleSlug: ROLE_PEMBUAT,
  });

  const namaPengguna = [user.firstName, user.lastName]
    .filter((part) => typeof part === "string" && part.length > 0)
    .join(" ");

  // 3. Mirror the org into the app DB (satuan_pendidikan is NOT RLS'd — the id
  //    filter is the isolation gate) and provision the creator's pengguna row
  //    + audit, scoped to the new tenant via withTenant.
  const { db } = getDb();
  await withTenant(db, org.id, async (tx) => {
    await tx.insert(schema.satuanPendidikan).values({
      id: org.id,
      nama,
      jenjang,
      alamat: alamat || null,
    });

    await tx.insert(schema.pengguna).values({
      tenantId: org.id,
      userId: user.id,
      peranAkses: ROLE_PEMBUAT,
      nama: namaPengguna || null,
    });

    await catatAudit(tx, {
      aktor: user.id,
      aksi: "buat_satuan_pendidikan",
      target: `satuan_pendidikan:${org.id}`,
      beban: { nama, jenjang, alamat: alamat ?? null },
    });
  });

  // 4. Set the new org as the active tenant cookie (same contract as
  //    pilihSatuanPendidikanAction — the orgId is server-validated against the
  //    membership we just created, never from client input).
  (await cookies()).set(ACTIVE_TENANT_COOKIE, org.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ACTIVE_TENANT_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
