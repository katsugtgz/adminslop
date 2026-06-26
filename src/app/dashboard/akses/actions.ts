"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Akses page (T6) may hide a button for a `guru` client, but a
// determined client can construct a `fetch` + `FormData` and POST it directly
// to this action. That POST MUST still throw — the action is the boundary, not
// the UI. The proof lives in `actions.test.ts` describe block
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
// / `dev` cannot bypass a restriction — there is no superuser. The proof test
// for "admin WITH pembatasan['ptk:hapus']" verifies this.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import {
  aturIzin,
  aturPembatasan,
  buatPtk,
  hapusPtk,
  linkPtk,
} from "@/db/queries/akses";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import type { IzinSlug } from "@/lib/auth/types";

/** Closed vocabulary of valid IzinSlug literals (single source of truth). */
const IZIN_SLUGS: readonly IzinSlug[] = [
  "ptk:baca",
  "ptk:buat",
  "ptk:hapus",
  "akses:baca",
  "akses:kelola",
  "peserta_didik:baca",
  "peserta_didik:buat",
  "peserta_didik:ubah",
  "tahun_ajaran:baca",
  "tahun_ajaran:kelola",
  "rombongan_belajar:baca",
  "rombongan_belajar:buat",
  "rombongan_belajar:ubah",
  "rombongan_belajar:kelola_penempatan",
  "kurikulum:baca",
  "beban_mengajar:baca",
  "beban_mengajar:buat",
  "beban_mengajar:ubah",
  "wali_kelas:baca",
  "wali_kelas:buat",
  "wali_kelas:ubah",
  "penilaian:baca",
  "penilaian:buat",
  "penilaian:ubah",
  "permintaan_ai:baca",
  "permintaan_ai:buat",
  "draf_ai:baca",
  "draf_ai:verifikasi",
];

/** True iff `slug` is one of the IzinSlug literals. */
function isValidIzinSlug(slug: string): slug is IzinSlug {
  return (IZIN_SLUGS as readonly string[]).includes(slug);
}

const REVALIDATE_TARGET = "/dashboard/akses";

// 1. simpanPtkBaruAction ----------------------------------------------------

/**
 * Create a PTK (Tenaga Kependidikan / Pendidik) in the active Satuan
 * Pendidikan. Requires the `ptk:buat` izin. Creates the PTK row only — no
 * Pengguna side-effect (AC#1).
 */
export async function simpanPtkBaruAction(formData: FormData): Promise<void> {
  // 1. Resolve + authorize (SERVER-SIDE — this is the boundary, NOT the UI)
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanBuat = akses.boleh("ptk:buat");
  if (!keputusanBuat.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk menambah PTK.");
  }

  // 2. Manual validation (no zod)
  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) throw new Error("Nama PTK wajib diisi.");
  const nip = String(formData.get("nip") ?? "").trim() || null;
  const jenisRaw = String(formData.get("jenis") ?? "");
  if (jenisRaw !== "pendidik" && jenisRaw !== "tenaga_kependidikan") {
    throw new Error("Jenis PTK tidak valid.");
  }
  const jenis: "pendidik" | "tenaga_kependidikan" = jenisRaw;

  // 3. Execute under tenant scope + audit. orgId from membership ONLY.
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const ptk = await buatPtk(tx, { nama, nip, jenis });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_ptk",
      target: `ptk:${ptk.id}`,
      beban: { nama, nip, jenis },
    });
  });

  // 4. Revalidate
  revalidatePath(REVALIDATE_TARGET);
}

// 2. hapusPtkAction ---------------------------------------------------------

/**
 * Delete a PTK by id. Requires the `ptk:hapus` izin. RLS scopes the delete to
 * the active tenant — a cross-tenant ptkId is a silent no-op.
 */
export async function hapusPtkAction(formData: FormData): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanHapus = akses.boleh("ptk:hapus");
  if (!keputusanHapus.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk menghapus PTK.");
  }

  const ptkId = String(formData.get("ptkId") ?? "").trim();
  if (!ptkId) throw new Error("ID PTK tidak valid.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await hapusPtk(tx, ptkId);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "hapus_ptk",
      target: `ptk:${ptkId}`,
      beban: { ptkId },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. linkPtkPenggunaAction --------------------------------------------------

/**
 * Link (or unlink) a PTK to a Pengguna. Requires `akses:kelola`. An empty
 * `ptkId` unlinks (sets ptk_id = null).
 */
export async function linkPtkPenggunaAction(formData: FormData): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanKelola = akses.boleh("akses:kelola");
  if (!keputusanKelola.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk mengelola akses.");
  }

  const penggunaId = String(formData.get("penggunaId") ?? "").trim();
  if (!penggunaId) throw new Error("ID Pengguna wajib diisi.");
  const ptkIdRaw = String(formData.get("ptkId") ?? "").trim();
  const ptkId = ptkIdRaw || null;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await linkPtk(tx, penggunaId, ptkId);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "link_ptk_pengguna",
      target: `pengguna:${penggunaId}`,
      beban: { ptkId },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 4. aturIzinAksesAction ----------------------------------------------------

/**
 * Grant or revoke an izin slug for a Pengguna. Requires `akses:kelola`. The
 * `aktif` checkbox: `formData.get("aktif") === "on"` → grant; otherwise revoke.
 */
export async function aturIzinAksesAction(formData: FormData): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanKelola = akses.boleh("akses:kelola");
  if (!keputusanKelola.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk mengelola akses.");
  }

  const penggunaId = String(formData.get("penggunaId") ?? "").trim();
  if (!penggunaId) throw new Error("ID Pengguna wajib diisi.");
  const slugRaw = String(formData.get("slug") ?? "").trim();
  if (!isValidIzinSlug(slugRaw)) {
    throw new Error("Slug izin tidak valid.");
  }
  const slug: IzinSlug = slugRaw;
  const aktif = formData.get("aktif") === "on";

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await aturIzin(tx, penggunaId, slug, aktif);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "atur_izin",
      target: `pengguna:${penggunaId}`,
      beban: { slug, aktif },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 5. aturPembatasanAksesAction ----------------------------------------------

/**
 * Add or remove a pembatasan slug for a Pengguna. Requires `akses:kelola`.
 * Carries an optional `alasan` (reason) string on add.
 */
export async function aturPembatasanAksesAction(
  formData: FormData
): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanKelola = akses.boleh("akses:kelola");
  if (!keputusanKelola.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk mengelola akses.");
  }

  const penggunaId = String(formData.get("penggunaId") ?? "").trim();
  if (!penggunaId) throw new Error("ID Pengguna wajib diisi.");
  const slugRaw = String(formData.get("slug") ?? "").trim();
  if (!isValidIzinSlug(slugRaw)) {
    throw new Error("Slug izin tidak valid.");
  }
  const slug: IzinSlug = slugRaw;
  const aktif = formData.get("aktif") === "on";
  const alasanRaw = String(formData.get("alasan") ?? "").trim();
  const alasan = alasanRaw || null;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await aturPembatasan(tx, penggunaId, slug, aktif, alasan);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "atur_pembatasan",
      target: `pengguna:${penggunaId}`,
      beban: { slug, aktif, alasan },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
