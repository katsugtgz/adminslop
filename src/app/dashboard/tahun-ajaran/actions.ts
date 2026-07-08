"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Tahun Ajaran page may hide a button for a `kepala_sekolah`
// client, but a determined client can construct a `fetch` + `FormData` and POST
// it directly to this action. That POST MUST still throw — the action is the
// boundary, not the UI. The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (identity doc §13 — "no global superuser"):
// `orgId` comes ONLY from `akses.membership.orgId` (the live WorkOS
// Keanggotaan). A tampered `tenantId` field in formData is deliberately NEVER
// read — it is ignored. Tenant scoping happens via `withTenant(db, orgId, ...)`
// which sets the RLS session GUC `app.tenant_id`.
//
// SECURITY (identity doc §13 — pembatasan wins):
// `boleh()` returns `{diizinkan:false, sumber:"pembatasan"}` when an admin has
// a `pembatasan_akses` row for the requested slug. Even `admin_satuan_pendidikan`
// / `dev` cannot bypass a restriction — there is no superuser.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import {
  aktifkanTahunAjaran,
  buatTahunAjaran,
  ubahSemesterAktif,
  type Semester,
} from "@/db/queries/tahun-ajaran";
import { requireAksesAktif } from "@/lib/auth/akses-saya";

const REVALIDATE_TARGET = "/dashboard/tahun-ajaran";

/** True iff `s` is a valid Semester literal. */
function isValidSemester(s: string): s is Semester {
  return s === "ganjil" || s === "genap";
}

// 1. simpanTahunAjaranBaruAction --------------------------------------------

/**
 * Create a Tahun Ajaran (academic year) in the active Satuan Pendidikan.
 * Requires the `tahun_ajaran:kelola` izin. New rows are inactive by default;
 * use `aktifkanTahunAjaranAction` to mark one aktif.
 */
export async function simpanTahunAjaranBaruAction(
  formData: FormData
): Promise<void> {
  // 1. Resolve + authorize (SERVER-SIDE — this is the boundary, NOT the UI)
  const akses = await requireAksesAktif("tahun_ajaran:kelola", "Anda tidak memiliki izin untuk mengelola Tahun Ajaran.");

  // 2. Manual validation (no zod)
  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) throw new Error("Nama Tahun Ajaran wajib diisi.");

  // 3. Execute under tenant scope + audit. orgId from membership ONLY.
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const ta = await buatTahunAjaran(tx, { nama });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_tahun_ajaran",
      target: `tahun_ajaran:${ta.id}`,
      beban: { nama },
    });
  });

  // 4. Revalidate
  revalidatePath(REVALIDATE_TARGET);
}

// 2. aktifkanTahunAjaranAction ----------------------------------------------

/**
 * Atomically activate a Tahun Ajaran (at most one aktif per tenant — schema
 * partial unique index). Requires the `tahun_ajaran:kelola` izin. RLS scopes
 * the flip to the active tenant — a cross-tenant id is a silent no-op that
 * surfaces as "Tahun Ajaran tidak ditemukan" from the repo.
 */
export async function aktifkanTahunAjaranAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif("tahun_ajaran:kelola", "Anda tidak memiliki izin untuk mengelola Tahun Ajaran.");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("ID Tahun Ajaran wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const ta = await aktifkanTahunAjaran(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "aktifkan_tahun_ajaran",
      target: `tahun_ajaran:${ta.id}`,
      beban: { id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. ubahSemesterAktifAction ------------------------------------------------

/**
 * Set the active semester (`ganjil`/`genap`) for the active Satuan Pendidikan.
 * Requires the `tahun_ajaran:kelola` izin. The semester lives on
 * `satuan_pendidikan` (the tenant boundary row), so the audit target is the
 * tenant itself.
 */
export async function ubahSemesterAktifAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif("tahun_ajaran:kelola", "Anda tidak memiliki izin untuk mengelola Tahun Ajaran.");

  const semesterRaw = String(formData.get("semester") ?? "").trim();
  if (!isValidSemester(semesterRaw)) {
    throw new Error("Semester tidak valid.");
  }
  const semester: Semester = semesterRaw;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await ubahSemesterAktif(tx, { semester });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "ubah_semester_aktif",
      target: `satuan_pendidikan:${akses.membership.orgId}`,
      beban: { semester },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
