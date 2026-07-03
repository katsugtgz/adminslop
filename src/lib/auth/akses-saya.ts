import { getDb, withTenant } from "@/db/client";
import { cariPenggunaByUserId, loadAksesPengguna } from "@/db/queries/akses";
import type { Pengguna } from "@/db/schema";

import { evaluasiAkses, type KeputusanAkses } from "./otorisasi";
import {
  getActiveTenantContext,
  getAuthenticatedUserId,
  requireAuth,
} from "./server";
import type { IzinSlug, Membership } from "./types";

/**
 * The composed answer to "what can the current Pengguna do in the active
 * Satuan Pendidikan?". Mirrors {@linkcode TenantResolution} for the
 * `denied`/`choose` branches, and augments the `active` branch with the loaded
 * pengguna row, its izin/pembatasan slugs, and a `boleh()` evaluator closed
 * over them.
 *
 * `boleh()` is the AUTHORITATIVE authorization gate (identity doc §12 — hiding
 * UI is not authorization). Pages (T6) use it for visibility; server actions
 * (T5) re-invoke it server-side. Never trust client-supplied claims.
 */
export type AksesSaya =
  | { readonly status: "denied"; readonly authenticated: boolean }
  | {
      readonly status: "choose";
      readonly memberships: readonly Membership[];
    }
  | {
      readonly status: "active";
      readonly membership: Membership;
      readonly userId: string;
      /** null if no pengguna row has been synced for this (tenant, user) yet. */
      readonly pengguna: Pengguna | null;
      readonly izin: readonly IzinSlug[];
      readonly pembatasan: readonly IzinSlug[];
      /**
       * Evaluate whether the current Pengguna may perform `diminta` in the
       * active tenant. Closes over `membership.roleSlug` + `izin` +
       * `pembatasan` via {@linkcode evaluasiAkses}.
       */
      readonly boleh: (diminta: IzinSlug) => KeputusanAkses;
    };

/**
 * The active (tenant-resolved, pengguna-loaded) branch of {@linkcode AksesSaya}.
 * Extracted as a named alias so {@linkcode requireAksesAktif} and callers can
 * annotate the narrowed form without restating the full union.
 */
export type AksesAktif = Extract<AksesSaya, { status: "active" }>;

/**
 * Server-side authorization composition point (T4, Wave 3 of #6). Composes the
 * Wave 1-2 layers — tenant resolution + authenticated user + the akses
 * repository + the pure evaluator — into one answer consumed by server actions
 * (T5) and pages (T6).
 *
 * Tenant boundary: `orgId` comes ONLY from `ctx.membership.orgId` (the live
 * WorkOS Keanggotaan) — never from client input. All pengguna/izin/pembatasan
 * reads run inside `withTenant(db, orgId, ...)` so RLS scopes them via the
 * session GUC `app.tenant_id` (identity doc §13).
 */
export async function getAksesSaya(): Promise<AksesSaya> {
  const ctx = await getActiveTenantContext();
  if (ctx.status === "denied") {
    return { status: "denied", authenticated: ctx.authenticated };
  }
  if (ctx.status === "choose") {
    return { status: "choose", memberships: ctx.memberships };
  }

  // ctx.status === "active"
  const { membership } = ctx;

  const userId = await getAuthenticatedUserId();
  if (userId === null) {
    // Clock boundary: session vanished between getActiveTenantContext's
    // withAuth read and this one. Treat as denied (never a 500) and report
    // authenticated=false — the newer read wins, and offering "Keluar" for a
    // session that no longer exists would be a dead button.
    return { status: "denied", authenticated: false };
  }

  const { db } = getDb();

  // Load the pengguna record (if any) + its izin/pembatasan, scoped to the
  // active tenant via withTenant. RLS scopes every row to membership.orgId.
  const { pengguna, izin, pembatasan } = await withTenant(
    db,
    membership.orgId,
    async (tx) => {
      const p = await cariPenggunaByUserId(tx, userId);
      const akses = p
        ? await loadAksesPengguna(tx, p.id)
        : { izin: [], pembatasan: [] };
      return {
        pengguna: p,
        // loadAksesPengguna returns string[] (the DB stores text); the IzinSlug
        // union is a known closed vocabulary, so this narrowing cast is sound.
        izin: akses.izin as IzinSlug[],
        pembatasan: akses.pembatasan as IzinSlug[],
      };
    }
  );

  // SECURITY (identity doc §13): evaluate using `membership.roleSlug` — the
  // LIVE WorkOS Keanggotaan tenant_role — NOT `pengguna.peranAkses`.
  // `peranAkses` is a denormalized snapshot kept for display/audit only and
  // may lag the authoritative WorkOS membership; trusting it would let a stale
  // row grant elevated rights. The membership is the source of truth.
  const boleh = (diminta: IzinSlug): KeputusanAkses =>
    evaluasiAkses({
      roleSlug: membership.roleSlug,
      izinGrants: izin,
      pembatasan,
      diminta,
    });

  return {
    status: "active",
    membership,
    userId,
    pengguna,
    izin,
    pembatasan,
    boleh,
  };
}

/**
 * Server-action authorization prologue (Decision 6). Composes
 * {@linkcode requireAuth} + {@linkcode getAksesSaya} + the izin check, returning
 * the narrowed {@linkcode AksesAktif}. Throws on the two deny outcomes
 * (identity doc §12 — the action is the boundary, not the UI):
 *  - "Satuan Pendidikan Aktif belum dipilih." when status is `denied`/`choose`.
 *  - "Anda tidak memiliki izin untuk aksi ini." when `boleh(izin)` denies.
 *
 * Callers needing the {@linkcode KeputusanAkses} object (not just pass/fail)
 * call `akses.boleh(...)` on the returned value; `evaluasiAkses` is pure.
 */
export async function requireAksesAktif(izin: IzinSlug): Promise<AksesAktif> {
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh(izin).diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk aksi ini.");
  }
  return akses;
}
