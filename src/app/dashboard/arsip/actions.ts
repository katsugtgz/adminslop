"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Arsip page may hide a button for a `guru` client, but a
// determined client can construct a `fetch` + `FormData` and POST it directly
// to this action. That POST MUST still throw — the action is the boundary.
// The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (AC#5 — no SQL injection, strict table whitelist):
// The `tabel` field in formData is validated against TABEL_ARSIP_WHITELIST
// BEFORE it reaches the repo. The repo layer (queries/arsip.ts) ALSO validates
// via assertTabelArsip — defense in depth. The user-supplied string is NEVER
// interpolated into raw SQL; it is switch/case-mapped to a real drizzle table
// object. A tampered `tabel` (e.g. "satuan_pendidikan; drop table ptk") is
// rejected at the whitelist with /Tabel tidak didukung/i.
//
// SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY from
// `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered `tenantId`
// field in formData is deliberately NEVER read — it is ignored. Tenant scoping
// happens via `withTenant(db, orgId, ...)` which sets the RLS session GUC
// `app.tenant_id`.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import { arsipkan, aturRetensi, pulihkan, type TabelArsip } from "@/db/queries/arsip";
import { getAksesSaya } from "@/lib/auth/akses-saya";

const REVALIDATE_TARGET = "/dashboard/arsip";

const TABEL_ARSIP_WHITELIST: readonly TabelArsip[] = [
  "ptk",
  "penilaian",
  "beban_mengajar",
  "wali_kelas",
];

function isTabelArsip(t: string): t is TabelArsip {
  return (TABEL_ARSIP_WHITELIST as readonly string[]).includes(t);
}

// 1. arsipkanAction ------------------------------------------------------------

/**
 * Archive (soft-delete) a record. Requires `arsip:kelola`. AC#1: this is the
 * "delete" surface, but it NEVER hard-deletes — the repo sets `arsip_pada` +
 * `arsip_oleh` and the row persists for recovery. `tabel` is validated against
 * the whitelist (AC#5).
 */
export async function arsipkanAction(formData: FormData): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("arsip:kelola").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk mengelola Arsip.");
  }

  const tabelRaw = String(formData.get("tabel") ?? "").trim();
  if (!isTabelArsip(tabelRaw)) {
    throw new Error("Tabel tidak didukung.");
  }
  const tabel: TabelArsip = tabelRaw;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("ID wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const updated = await arsipkan(tx, tabel, id, akses.userId);
    if (updated === 0) {
      throw new Error("Data tidak ditemukan atau sudah diarsipkan.");
    }
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "arsipkan_record",
      target: `${tabel}:${id}`,
      beban: { tabel, id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 2. pulihkanAction ------------------------------------------------------------

/**
 * Recover an archived record. Requires `arsip:kelola`. AC#2: recovery with
 * accountability — the repo sets `arsip_pada` + `arsip_oleh` back to NULL, and
 * this action records a `pulihkan_record` audit entry so the recovery itself is
 * traceable. `tabel` is validated against the whitelist (AC#5).
 */
export async function pulihkanAction(formData: FormData): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("arsip:kelola").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk mengelola Arsip.");
  }

  const tabelRaw = String(formData.get("tabel") ?? "").trim();
  if (!isTabelArsip(tabelRaw)) {
    throw new Error("Tabel tidak didukung.");
  }
  const tabel: TabelArsip = tabelRaw;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("ID wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const updated = await pulihkan(tx, tabel, id);
    if (updated === 0) {
      throw new Error("Data tidak ditemukan atau tidak ada di arsip.");
    }
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "pulihkan_record",
      target: `${tabel}:${id}`,
      beban: { tabel, id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. aturRetensiAction ---------------------------------------------------------

/**
 * Set or update a retention policy for a table. Requires `arsip:kelola`.
 * AC#3: retention rules. `periodeBulan` must be a positive integer. `tabel` is
 * validated against the whitelist (AC#5).
 */
export async function aturRetensiAction(formData: FormData): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("arsip:kelola").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk mengelola Arsip.");
  }

  const tabelRaw = String(formData.get("tabel") ?? "").trim();
  if (!isTabelArsip(tabelRaw)) {
    throw new Error("Tabel tidak didukung.");
  }
  const tabel: TabelArsip = tabelRaw;
  const periodeRaw = String(formData.get("periodeBulan") ?? "").trim();
  if (!periodeRaw) throw new Error("Periode (Bulan) wajib diisi.");
  const periodeBulan = Number(periodeRaw);
  if (Number.isNaN(periodeBulan)) {
    throw new Error("Periode (Bulan) harus berupa angka.");
  }
  if (periodeBulan <= 0) {
    throw new Error("Periode (Bulan) harus lebih besar dari 0.");
  }
  const keteranganRaw = String(formData.get("keterangan") ?? "").trim();
  const keterangan = keteranganRaw || undefined;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await aturRetensi(tx, { tabel, periodeBulan, keterangan });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "atur_retensi",
      target: `retensi:${tabel}`,
      beban: { tabel, periodeBulan, keterangan: keterangan ?? null },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
