"use server";

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import {
  updatePengaturanSatuanPendidikan,
  updateProfilSatuanPendidikan,
} from "@/db/queries/satuan-pendidikan";
import { canAdminSatuanPendidikan } from "@/lib/auth/otorisasi";
import {
  getActiveTenantContext,
  getAuthenticatedUserId,
  requireAuth,
} from "@/lib/auth/server";
import {
  PengaturanSatuanPendidikanSchema,
  ProfilSatuanPendidikanSchema,
} from "./schemas";

const PENGATURAN_PATH = "/dashboard/pengaturan";

/**
 * Persist edits to the Profil Satuan Pendidikan (official identity of the
 * tenant school). The active Satuan Pendidikan is re-validated server-side and
 * the `tenant_role` is checked via `canAdminSatuanPendidikan`. The tenant id is
 * ALWAYS taken from the authenticated membership — any forged `orgId` /
 * `tenantId` field in `formData` is ignored.
 */
export async function simpanProfilSatuanPendidikanAction(
  formData: FormData,
): Promise<void> {
  await requireAuth();
  const ctx = await getActiveTenantContext();
  if (ctx.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const { membership } = ctx;
  if (!canAdminSatuanPendidikan(membership.roleSlug)) {
    throw new Error("Anda tidak memiliki izin mengubah Profil Satuan Pendidikan.");
  }

  const parsed = ProfilSatuanPendidikanSchema.safeParse({
    nama: String(formData.get("nama") ?? ""),
    npsn: formData.get("npsn")?.toString().trim() || undefined,
    jenjang: String(formData.get("jenjang") ?? ""),
    alamat: String(formData.get("alamat") ?? ""),
    namaKepala: String(formData.get("namaKepala") ?? ""),
    logoUrl: String(formData.get("logoUrl") ?? ""),
  });
  if (!parsed.success) {
    throw new Error(`Data Profil tidak valid: ${parsed.error.message}`);
  }

  const aktor = await getAuthenticatedUserId();
  if (!aktor) throw new Error("Sesi tidak terautentikasi.");

  const { db } = getDb();
  await withTenant(db, membership.orgId, async (tx) => {
    await updateProfilSatuanPendidikan(tx, membership.orgId, parsed.data);
    await catatAudit(tx, {
      aktor,
      aksi: "perbarui_profil_satuan",
      target: `satuan_pendidikan:${membership.orgId}`,
      beban: parsed.data,
    });
  });

  revalidatePath(PENGATURAN_PATH);
}

/**
 * Persist edits to the Pengaturan Satuan Pendidikan (operational defaults for
 * the tenant). Same authorization + tenant-isolation contract as the Profil
 * action. HTML checkboxes are sent as `"on"` when checked and absent when
 * unchecked; both are coerced to a real boolean before validation.
 */
export async function simpanPengaturanSatuanPendidikanAction(
  formData: FormData,
): Promise<void> {
  await requireAuth();
  const ctx = await getActiveTenantContext();
  if (ctx.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const { membership } = ctx;
  if (!canAdminSatuanPendidikan(membership.roleSlug)) {
    throw new Error(
      "Anda tidak memiliki izin mengubah Pengaturan Satuan Pendidikan.",
    );
  }

  const parsed = PengaturanSatuanPendidikanSchema.safeParse({
    tahunAjaran: String(formData.get("tahunAjaran") ?? ""),
    semester: String(formData.get("semester") ?? ""),
    zonaWaktu: String(formData.get("zonaWaktu") ?? ""),
    cetakPaperSize: String(formData.get("cetakPaperSize") ?? ""),
    cetakTampilkanLogo: formData.get("cetakTampilkanLogo") === "on",
    cetakTampilkanHeader: formData.get("cetakTampilkanHeader") === "on",
  });
  if (!parsed.success) {
    throw new Error(`Data Pengaturan tidak valid: ${parsed.error.message}`);
  }

  const aktor = await getAuthenticatedUserId();
  if (!aktor) throw new Error("Sesi tidak terautentikasi.");

  const { db } = getDb();
  await withTenant(db, membership.orgId, async (tx) => {
    await updatePengaturanSatuanPendidikan(tx, membership.orgId, parsed.data);
    await catatAudit(tx, {
      aktor,
      aksi: "perbarui_pengaturan_satuan",
      target: `satuan_pendidikan:${membership.orgId}`,
      beban: parsed.data,
    });
  });

  revalidatePath(PENGATURAN_PATH);
}
