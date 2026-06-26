/**
 * Data-access layer over wali_peserta_didik + kontak_darurat (parent/guardian
 * and emergency-contact records). Pure repository functions — no authz logic,
 * no validation, no audit. Composed by T4/T5/T6 layers.
 *
 * DOMAIN INVARIANT (AC#4): wali + kontak_darurat are CONTACT records ONLY.
 * They are NOT Pengguna (login identities) — a wali cannot sign in. This
 * separation is a core domain rule; do not add user_id/auth columns here.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 */
import { eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { kontakDarurat, waliPesertaDidik } from "../schema";
import type { KontakDarurat, WaliPesertaDidik } from "../schema";

// Wali Peserta Didik (parent/guardian contact) -----------------------------

export interface InputWali {
  readonly pesertaDidikId: string;
  readonly nama: string;
  readonly hubungan?: string;
  readonly telepon?: string;
  readonly email?: string;
}

/**
 * List all wali for a peserta_didik visible under the current tenant (RLS-
 * scoped), ordered oldest-first by `dibuat_pada`. Cross-tenant walis are
 * invisible.
 */
export async function listWali(
  db: Db | Tx,
  pesertaDidikId: string
): Promise<WaliPesertaDidik[]> {
  return db
    .select()
    .from(waliPesertaDidik)
    .where(eq(waliPesertaDidik.pesertaDidikId, pesertaDidikId))
    .orderBy(waliPesertaDidik.dibuatPada);
}

/**
 * Create a wali. Runs inside `withTenant` so `tenant_id` defaults from the
 * GUC. Optional fields map to NULL when absent.
 */
export async function tambahWali(
  db: Db | Tx,
  input: InputWali
): Promise<WaliPesertaDidik> {
  const [row] = await db
    .insert(waliPesertaDidik)
    .values({
      pesertaDidikId: input.pesertaDidikId,
      nama: input.nama,
      hubungan: input.hubungan ?? null,
      telepon: input.telepon ?? null,
      email: input.email ?? null,
    })
    .returning();
  return row;
}

/**
 * Delete a wali by id. RLS scopes to the current tenant — cross-tenant delete
 * is a silent no-op (zero rows affected).
 */
export async function hapusWali(db: Db | Tx, id: string): Promise<void> {
  await db.delete(waliPesertaDidik).where(eq(waliPesertaDidik.id, id));
}

// Kontak Darurat (emergency contact) ---------------------------------------

export interface InputKontakDarurat {
  readonly pesertaDidikId: string;
  readonly nama: string;
  readonly hubungan?: string;
  readonly telepon?: string;
}

/**
 * List all kontak_darurat for a peserta_didik visible under the current
 * tenant (RLS-scoped), ordered oldest-first by `dibuat_pada`.
 */
export async function listKontakDarurat(
  db: Db | Tx,
  pesertaDidikId: string
): Promise<KontakDarurat[]> {
  return db
    .select()
    .from(kontakDarurat)
    .where(eq(kontakDarurat.pesertaDidikId, pesertaDidikId))
    .orderBy(kontakDarurat.dibuatPada);
}

/**
 * Create a kontak_darurat. Runs inside `withTenant` so `tenant_id` defaults
 * from the GUC. Optional fields map to NULL when absent.
 */
export async function tambahKontakDarurat(
  db: Db | Tx,
  input: InputKontakDarurat
): Promise<KontakDarurat> {
  const [row] = await db
    .insert(kontakDarurat)
    .values({
      pesertaDidikId: input.pesertaDidikId,
      nama: input.nama,
      hubungan: input.hubungan ?? null,
      telepon: input.telepon ?? null,
    })
    .returning();
  return row;
}

/**
 * Delete a kontak_darurat by id. RLS scopes to the current tenant — cross-
 * tenant delete is a silent no-op (zero rows affected).
 */
export async function hapusKontakDarurat(
  db: Db | Tx,
  id: string
): Promise<void> {
  await db.delete(kontakDarurat).where(eq(kontakDarurat.id, id));
}
