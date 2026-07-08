"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Notifikasi page (T6) may hide a button for a client, but a
// determined client can construct a `fetch` + `FormData` and POST it directly
// to this action. That POST MUST still throw — the action is the boundary, not
// the UI. The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY — SELF-OWNERSHIP (AC#3/#5 of #20, the core invariant):
// Notifikasi is addressed to ONE Pengguna (recipient). A user holds
// `notifikasi:baca` (role-level gate 1, universal across all roles), but may
// ONLY act on their OWN notifications (ownership gate 2). This composes:
//
//   1. ROLE GATE     — `akses.boleh("notifikasi:baca")`. Every role passes
//                      (notifikasi:baca is universal). A pembatasan row can
//                      still deny (no global superuser, §13).
//   2. SELF-OWNERSHIP — the requested notifikasi.penggunaId MUST equal
//                      `akses.pengguna.id`. A hostile client passing another
//                      user's notifikasiId (tandaiDibacaAction) or a tampered
//                      penggunaId in formData (aturPreferensi) is DENIED.
//
// `tandaiSemuaDibacaAction` takes NO penggunaId arg — it uses
// `akses.pengguna.id` directly, so cross-user targeting is impossible by
// construction.
//
// SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY from
// `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered `tenantId`
// field in formData is deliberately NEVER read. Tenant scoping happens via
// `withTenant(db, orgId, ...)` which sets the RLS session GUC `app.tenant_id`.
//
// MVP SCOPE (AC#5 of #20 — no external delivery): this module MUST NOT import
// or invoke any email / WhatsApp / SMS / push library. `buatNotifikasi` is NOT
// exposed as a server action here (system-only, called from scheduled jobs).
// The proof lives in `actions.test.ts` describe block "AC#5: no external
// delivery — in-app ONLY".

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import {
  aturPreferensiNotifikasi,
  cariNotifikasiById,
  tandaiDibaca,
  tandaiSemuaDibaca,
  TIPE_NOTIFIKASI,
  type TipeNotifikasi,
} from "@/db/queries/notifikasi";
import { requireAksesAktif } from "@/lib/auth/akses-saya";
import { checkboxField, trimField } from "@/lib/form/parser";

const REVALIDATE_TARGET = "/dashboard/notifikasi";

/** True iff `tipe` is one of the MVP TipeNotifikasi literals. */
function isValidTipe(tipe: string): tipe is TipeNotifikasi {
  return (TIPE_NOTIFIKASI as readonly string[]).includes(tipe);
}

// 1. tandaiDibacaAction ------------------------------------------------------

/**
 * Mark ONE notifikasi as read. Requires `notifikasi:baca`. SELF-OWNERSHIP
 * (AC#3/#5): resolves the row by id and verifies `row.penggunaId ===
 * akses.pengguna.id` BEFORE the update — a hostile client passing another
 * user's notifikasiId is denied. RLS scopes the resolve to the active tenant,
 * so a cross-tenant id simply resolves to "not found" (a deny).
 */
export async function tandaiDibacaAction(notifikasiId: string): Promise<void> {
  const akses = await requireAksesAktif("notifikasi:baca", "Anda tidak memiliki izin untuk Notifikasi.");
  const myPenggunaId = akses.pengguna?.id;
  if (!myPenggunaId) {
    throw new Error("Akun Anda belum terdaftar sebagai Pengguna.");
  }

  const notifikasiIdTrimmed = notifikasiId.trim();
  if (!notifikasiIdTrimmed) throw new Error("ID Notifikasi tidak valid.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // AC#3/#5 gate 2: SELF-OWNERSHIP. Resolve the row, then confirm it belongs
    // to the active pengguna. A cross-recipient id (another user's
    // notifikasiId) is a deny — the requesting user cannot mark someone else's
    // notification as read.
    const row = await cariNotifikasiById(tx, notifikasiIdTrimmed);
    if (!row) {
      throw new Error("Notifikasi tidak ditemukan.");
    }
    if (row.penggunaId !== myPenggunaId) {
      throw new Error("Anda tidak memiliki izin untuk Notifikasi ini.");
    }
    await tandaiDibaca(tx, row.id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "tandai_dibaca_notifikasi",
      target: `notifikasi:${row.id}`,
      beban: { notifikasiId: row.id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 2. tandaiSemuaDibacaAction -------------------------------------------------

/**
 * Mark ALL of the active Pengguna's unread notifikasi as read. Requires
 * `notifikasi:baca`. Takes NO penggunaId arg — uses `akses.pengguna.id`
 * directly, so cross-user targeting is impossible by construction (AC#5).
 */
export async function tandaiSemuaDibacaAction(): Promise<void> {
  const akses = await requireAksesAktif("notifikasi:baca", "Anda tidak memiliki izin untuk Notifikasi.");
  const myPenggunaId = akses.pengguna?.id;
  if (!myPenggunaId) {
    throw new Error("Akun Anda belum terdaftar sebagai Pengguna.");
  }

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // SELF-OWNERSHIP by construction: penggunaId comes from akses, never an
    // arg. tandaiSemuaDibaca is recipient-scoped at the repo level.
    const affected = await tandaiSemuaDibaca(tx, myPenggunaId);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "tandai_semua_dibaca_notifikasi",
      target: `pengguna:${myPenggunaId}`,
      beban: { jumlah: affected },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. aturPreferensiNotifikasiAction ------------------------------------------

/**
 * Toggle a per-tipe preferensi for the active Pengguna (self-service).
 * Requires `notifikasi:baca`. The `penggunaId` is taken from
 * `akses.pengguna.id` — a tampered `penggunaId` field in formData is
 * deliberately NEVER read (AC#5 tenant/recipient tamper-proofing). `tipe` must
 * be one of the MVP TipeNotifikasi literals; `aktif` is `formData.get("aktif")
 * === "on"` (checkbox semantics).
 */
export async function aturPreferensiNotifikasiAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif("notifikasi:baca", "Anda tidak memiliki izin untuk Notifikasi.");
  const myPenggunaId = akses.pengguna?.id;
  if (!myPenggunaId) {
    throw new Error("Akun Anda belum terdaftar sebagai Pengguna.");
  }

  const tipeRaw = trimField(formData, "tipe");
  if (!isValidTipe(tipeRaw)) {
    throw new Error("Tipe Notifikasi tidak valid.");
  }
  const tipe: TipeNotifikasi = tipeRaw;
  const aktif = checkboxField(formData, "aktif");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // SELF-OWNERSHIP by construction: penggunaId comes from akses, never
    // formData. The repo upserts on UNIQUE(tenant, pengguna, tipe).
    await aturPreferensiNotifikasi(tx, {
      penggunaId: myPenggunaId,
      tipe,
      aktif,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "atur_preferensi_notifikasi",
      target: `pengguna:${myPenggunaId}`,
      beban: { tipe, aktif },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
