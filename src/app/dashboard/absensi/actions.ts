"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Absensi page (T6) may hide the form for a `wali_kelas`
// client, but a determined client can construct a `fetch` + `FormData` and
// POST it directly to this action. That POST MUST still throw — the action is
// the boundary, not the UI. The proof lives in `actions.test.ts` describe
// block "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY
// from `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered
// `tenantId` field in formData is deliberately NEVER read. Tenant scoping
// happens via `withTenant(db, orgId, ...)` which sets the RLS session GUC
// `app.tenant_id`, so every read is already scoped to the active tenant — a
// cross-tenant id simply resolves to "not found" (a deny).
//
// SECURITY (identity doc §13 — pembatasan wins): `boleh()` returns
// `{diizinkan:false, sumber:"pembatasan"}` when an admin / guru has a
// `pembatasan_akses` row for the requested slug. Even `admin_satuan_pendidikan`
// / `dev` cannot bypass a restriction — there is no superuser. The proof test
// for "guru WITH pembatasan['absensi:buat']" verifies this (AC#5).

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import { catatAbsensi, ubahAbsensi } from "@/db/queries/absensi";
import type { MetodeInput, StatusKehadiran } from "@/db/queries/absensi";
import { listPenempatanByPesertaDidik } from "@/db/queries/penempatan-rombongan-belajar";
import { requireAksesAktif } from "@/lib/auth/akses-saya";
import {
  assertPemilikRombongan,
  rombonganBelajarIdDariAbsensi,
} from "@/lib/auth/kepemilikan";
import { optionalString, requiredString, trimField } from "@/lib/form/parser";

const REVALIDATE_TARGET = "/dashboard/absensi";

/** Closed vocabulary: the four valid status_kehadiran literals. */
const STATUS_KEHADIRAN = ["hadir", "izin", "sakit", "alpa"] as const;

/** True iff `s` is one of the StatusKehadiran literals. */
function isValidStatus(s: string): s is StatusKehadiran {
  return (STATUS_KEHADIRAN as readonly string[]).includes(s);
}

/** Closed vocabulary: the two valid metode_input literals. */
const METODE_INPUT = ["manual", "qr"] as const;

/** True iff `s` is one of the MetodeInput literals. */
function isValidMetode(s: string): s is MetodeInput {
  return (METODE_INPUT as readonly string[]).includes(s);
}

/**
 * Quick ISO-date `YYYY-MM-DD` shape check. NOT a strict calendar validator —
 * it accepts the structure the action needs to reject obviously malformed
 * input (the schema `date` column rejects the rest server-side). Leap-day
 * and 30/31 day months are deferred to Postgres.
 */
function isIsoDateShape(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// 1. catatAbsensiAction -----------------------------------------------------

/**
 * Record an Absensi Harian (one row per peserta_didik per tanggal per
 * rombongan_belajar). Requires the `absensi:buat` izin (AC#1: guru records;
 * admin/dev manage school-wide). Audit row is appended inside the same
 * transaction.
 *
 * `metodeInput` is optional and defaults to `'manual'` in the repo. When the
 * caller supplies `'qr'`, an optional `sumberQr` (QR session token) is
 * carried through. AC#3: a QR-captured row is still correctable via
 * `ubahAbsensiAction` — `sumberQr` presence does NOT lock the record.
 */
export async function catatAbsensiAction(formData: FormData): Promise<void> {
  // 1. Resolve + authorize (SERVER-SIDE — this is the boundary, NOT the UI).
  const akses = await requireAksesAktif("absensi:buat", "Anda tidak memiliki izin untuk mencatat Absensi.");

  // 2. Manual validation (no zod).
  const pesertaDidikId = requiredString(formData, "pesertaDidikId", "ID Peserta Didik wajib diisi.");
  const rombonganBelajarId = requiredString(formData, "rombonganBelajarId", "ID Rombongan Belajar wajib diisi.");
  const tanggal = requiredString(formData, "tanggal", "Tanggal wajib diisi.");
  if (!isIsoDateShape(tanggal)) {
    throw new Error("Tanggal harus berformat YYYY-MM-DD.");
  }
  const statusRaw = trimField(formData, "statusKehadiran");
  if (!isValidStatus(statusRaw)) {
    throw new Error("Status Kehadiran tidak valid.");
  }
  const statusKehadiran: StatusKehadiran = statusRaw;
  const metodeRaw = trimField(formData, "metodeInput");
  // metodeInput is OPTIONAL; default 'manual' in the repo. When provided, it
  // must be in the closed vocabulary.
  let metodeInput: MetodeInput | undefined;
  if (metodeRaw !== "") {
    if (!isValidMetode(metodeRaw)) {
      throw new Error("Metode Input tidak valid.");
    }
    metodeInput = metodeRaw;
  }
  const catatan = optionalString(formData, "catatan") ?? undefined;
  const sumberQr = optionalString(formData, "sumberQr") ?? undefined;

  // Task #15 guardrail (AC#3 audit-trail integrity): a row marked
  // `metode_input='qr'` MUST carry a non-empty `sumber_qr` session token.
  // Without this invariant, a hostile client could persist a row as
  // "qr-captured" with no provenance — defeating the AC#3 audit trail that
  // `ubahAbsensi` preserves. The future live-camera scanner UI will supply
  // both fields together (Task #15); until then, manual entry simply omits
  // `metodeInput` (defaults to 'manual' in the repo). NOTE: `sumberQr` is
  // NEVER used to derive tenant scope (identity doc §13) — `withTenant`
  // below uses `akses.membership.orgId` regardless of this value, so a
  // tenant-B QR token posted to tenant-A's action resolves to a tenant-A
  // row carrying a meaningless string, never a cross-tenant leak.
  if (metodeInput === "qr" && !sumberQr) {
    throw new Error("Token Sesi QR wajib diisi untuk metode input 'qr'.");
  }

  // 3. Execute under tenant scope + audit. orgId from membership ONLY.
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // C3 gate 2: ownership of the target Rombongan Belajar (admin bypasses;
    // guru must own the rombel via beban_mengajar / wali_kelas).
    // react-doctor-disable-next-line async-parallel: catatAbsensi depends on ownership gate; audit depends on row.id, react-doctor/async-parallel
    await assertPemilikRombongan(tx, akses, async () => rombonganBelajarId);
    const penempatan = await listPenempatanByPesertaDidik(tx, pesertaDidikId);
    if (!penempatan.some((p) => p.rombonganBelajarId === rombonganBelajarId)) {
      throw new Error("Peserta Didik tidak terdaftar di Rombongan Belajar ini.");
    }
    const row = await catatAbsensi(tx, {
      pesertaDidikId,
      rombonganBelajarId,
      tanggal,
      statusKehadiran,
      metodeInput,
      catatan,
      sumberQr,
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "catat_absensi",
      target: `absensi:${row.id}`,
      beban: {
        pesertaDidikId,
        rombonganBelajarId,
        tanggal,
        statusKehadiran,
        metodeInput: metodeInput ?? "manual",
      },
    });
  });

  // 4. Revalidate.
  revalidatePath(REVALIDATE_TARGET);
}

// 2. ubahAbsensiAction ------------------------------------------------------

/**
 * Update the `statusKehadiran` and/or `catatan` on an existing Absensi row.
 * Requires `absensi:ubah`. AC#3 (load-bearing): correctable EVEN IF the row
 * was originally QR-captured — `metode_input` + `sumber_qr` are preserved by
 * the repo, and `diperbarui_pada` advances. `catatan` is optional; an empty
 * string clears it (null). Audit row appended inside the transaction.
 */
export async function ubahAbsensiAction(formData: FormData): Promise<void> {
  const akses = await requireAksesAktif("absensi:ubah", "Anda tidak memiliki izin untuk mengubah Absensi.");

  const id = requiredString(formData, "id", "ID Absensi wajib diisi.");

  // Either statusKehadiran OR catatan (or both) must be present. Build a
  // partial update so a caller can correct ONE field without forcing the
  // other to be re-submitted.
  const perubahan: {
    statusKehadiran?: StatusKehadiran;
    catatan?: string;
  } = {};

  if (formData.has("statusKehadiran")) {
    const statusRaw = trimField(formData, "statusKehadiran");
    if (statusRaw !== "") {
      if (!isValidStatus(statusRaw)) {
        throw new Error("Status Kehadiran tidak valid.");
      }
      perubahan.statusKehadiran = statusRaw;
    }
  }
  if (formData.has("catatan")) {
    const catatanRaw = trimField(formData, "catatan");
    // An empty catatan CLEARS the note (writes null) — a corrected row can
    // both add and remove a note.
    perubahan.catatan = catatanRaw;
  }

  if (perubahan.statusKehadiran === undefined && !formData.has("catatan")) {
    throw new Error("Tidak ada perubahan untuk disimpan.");
  }

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // C3 gate 2: ownership — resolve absensi(id) -> rombongan_belajar, then
    // confirm the active guru owns that rombel (admin bypasses).
    // react-doctor-disable-next-line async-parallel: ubahAbsensi depends on ownership gate; audit depends on row.id, react-doctor/async-parallel
    await assertPemilikRombongan(tx, akses, () =>
      rombonganBelajarIdDariAbsensi(tx, id)
    );
    const row = await ubahAbsensi(tx, id, perubahan);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "ubah_absensi",
      target: `absensi:${row.id}`,
      beban: { id, perubahan },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
