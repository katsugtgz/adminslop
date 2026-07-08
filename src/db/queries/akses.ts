/**
 * Data-access layer over the 4 RLS'd akses tables (ptk, pengguna, izin_akses,
 * pembatasan_akses). Pure repository functions — no authz logic, no validation,
 * no audit. Composed by T4/T5/T6 layers.
 *
 * §13 isolation invariant: every query runs inside `withTenant(db, tenantId, tx => fn(tx, ...))`.
 * RLS scopes all rows to the tenant set in the session GUC `app.tenant_id`.
 * `tenant_id` is NEVER passed as a function argument — it always defaults
 * from the GUC.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { izinAkses, pembatasanAkses, pengguna, ptk } from "../schema";
import type { Pengguna, Ptk } from "../schema";

/** Default row cap for list queries — prevents unbounded tenant scans. */
const DEFAULT_LIMIT = 500;

// PTK CRUD ----------------------------------------------------------------

/**
 * List all PTK records visible under the current tenant (RLS-scoped), newest
 * first. `limit` caps the result set (default 500).
 */
export async function listPtk(
  db: Db | Tx,
  limit: number = DEFAULT_LIMIT
): Promise<Ptk[]> {
  return db.select().from(ptk).orderBy(desc(ptk.dibuatPada)).limit(limit);
}

export interface InputBuatPtk {
  readonly nama: string;
  readonly nip?: string | null;
  readonly jenis: "pendidik" | "tenaga_kependidikan";
}

/**
 * Create a PTK. Runs inside `withTenant` so `tenant_id` defaults from the GUC.
 */
export async function buatPtk(db: Db | Tx, input: InputBuatPtk): Promise<Ptk> {
  const [row] = await db
    .insert(ptk)
    .values({ nama: input.nama, nip: input.nip ?? null, jenis: input.jenis })
    .returning();
  return row;
}

/**
 * Delete a PTK by id. RLS scopes to the current tenant — cross-tenant delete
 * is a silent no-op (zero rows affected).
 */
export async function hapusPtk(db: Db | Tx, id: string): Promise<void> {
  await db.delete(ptk).where(eq(ptk.id, id));
}

export async function cariPtkById(
  db: Db | Tx,
  id: string
): Promise<Ptk | null> {
  const rows = await db.select().from(ptk).where(eq(ptk.id, id));
  return rows[0] ?? null;
}

// Pengguna ----------------------------------------------------------------

export interface PenggunaDenganPtk extends Pengguna {
  /** The linked PTK, or null if unlinked. */
  readonly ptk: Ptk | null;
}

/**
 * List penggunas with their optionally-linked PTK (left join). RLS scopes to
 * the current tenant. Ordered newest first; `limit` caps the result set
 * (default 500).
 */
export async function listPengguna(
  db: Db | Tx,
  limit: number = DEFAULT_LIMIT
): Promise<PenggunaDenganPtk[]> {
  const rows = await db
    .select({ pengguna, ptk })
    .from(pengguna)
    .leftJoin(ptk, eq(pengguna.ptkId, ptk.id))
    .orderBy(desc(pengguna.dibuatPada))
    .limit(limit);
  return rows.map(({ pengguna: p, ptk: t }) => ({ ...p, ptk: t }));
}

export interface InputUpsertPengguna {
  /** WorkOS User.id. */
  readonly userId: string;
  /** RoleSlug snapshot. */
  readonly peranAkses: string;
  readonly nama?: string | null;
}

/**
 * Insert or update a pengguna by (tenant, user_id). On conflict, update
 * peranAkses + nama. Preserves any pre-existing ptk_id link (never overwritten).
 */
export async function upsertPengguna(
  db: Db | Tx,
  input: InputUpsertPengguna
): Promise<Pengguna> {
  const [row] = await db
    .insert(pengguna)
    .values({
      userId: input.userId,
      peranAkses: input.peranAkses,
      nama: input.nama ?? null,
    })
    .onConflictDoUpdate({
      target: [pengguna.tenantId, pengguna.userId],
      set: {
        peranAkses: sql`excluded.peran_akses`,
        nama: sql`excluded.nama`,
      },
    })
    .returning();
  return row;
}

/**
 * Find the pengguna for the current WorkOS user within the current tenant
 * (RLS-scoped). Returns null if absent (including when the userId exists only
 * in another tenant).
 */
export async function cariPenggunaByUserId(
  db: Db | Tx,
  userId: string
): Promise<Pengguna | null> {
  const rows = await db
    .select()
    .from(pengguna)
    .where(eq(pengguna.userId, userId));
  return rows[0] ?? null;
}

/**
 * Link a pengguna to a PTK (set ptk_id). Pass null to unlink. RLS scopes the
 * update to the current tenant — cross-tenant penggunaId is a silent no-op.
 *
 * When `ptkId` is non-null, an explicit same-tenant existence check runs first.
 * RLS already prevents cross-tenant reads, so a PTK from another Satuan
 * Pendidikan is invisible here — this guard turns that silent invisibility
 * into a clear error so callers can surface "PTK tidak ditemukan" rather than
 * silently leave the pengguna unlinked.
 */
export async function linkPtk(
  db: Db | Tx,
  penggunaId: string,
  ptkId: string | null
): Promise<void> {
  if (ptkId !== null) {
    const [existing] = await db
      .select({ id: ptk.id })
      .from(ptk)
      .where(eq(ptk.id, ptkId))
      .limit(1);
    if (!existing) {
      throw new Error("PTK tidak ditemukan dalam Satuan Pendidikan ini.");
    }
  }
  await db
    .update(pengguna)
    .set({ ptkId })
    .where(eq(pengguna.id, penggunaId));
}

// Izin + Pembatasan -------------------------------------------------------

export interface AksesPengguna {
  /** IzinSlug[] from izin_akses. */
  readonly izin: string[];
  /** IzinSlug[] from pembatasan_akses. */
  readonly pembatasan: string[];
}

/**
 * Load the izin + pembatasan slugs for a pengguna (used by the authz evaluator
 * in T4). RLS scopes to the current tenant.
 */
export async function loadAksesPengguna(
  db: Db | Tx,
  penggunaId: string
): Promise<AksesPengguna> {
  const [izinRows, batasRows] = await Promise.all([
    db
      .select({ slug: izinAkses.slug })
      .from(izinAkses)
      .where(eq(izinAkses.penggunaId, penggunaId)),
    db
      .select({ slug: pembatasanAkses.slug })
      .from(pembatasanAkses)
      .where(eq(pembatasanAkses.penggunaId, penggunaId)),
  ]);
  return {
    izin: izinRows.map((r) => r.slug),
    pembatasan: batasRows.map((r) => r.slug),
  };
}

/**
 * Grant or revoke an izin slug for a pengguna. Insert is idempotent
 * (on conflict do nothing). `aktif=false` deletes the row.
 */
export async function aturIzin(
  db: Db | Tx,
  penggunaId: string,
  slug: string,
  aktif: boolean
): Promise<void> {
  if (aktif) {
    await db
      .insert(izinAkses)
      .values({ penggunaId, slug })
      .onConflictDoNothing();
  } else {
    await db
      .delete(izinAkses)
      .where(
        and(eq(izinAkses.penggunaId, penggunaId), eq(izinAkses.slug, slug))
      );
  }
}

/**
 * Add or remove a pembatasan slug for a pengguna. Insert carries an optional
 * alasan; on conflict the alasan is updated. `aktif=false` deletes the row.
 */
export async function aturPembatasan(
  db: Db | Tx,
  penggunaId: string,
  slug: string,
  aktif: boolean,
  alasan?: string | null
): Promise<void> {
  if (aktif) {
    await db
      .insert(pembatasanAkses)
      .values({ penggunaId, slug, alasan: alasan ?? null })
      .onConflictDoUpdate({
        target: [
          pembatasanAkses.tenantId,
          pembatasanAkses.penggunaId,
          pembatasanAkses.slug,
        ],
        set: { alasan: alasan ?? null },
      });
  } else {
    await db
      .delete(pembatasanAkses)
      .where(
        and(
          eq(pembatasanAkses.penggunaId, penggunaId),
          eq(pembatasanAkses.slug, slug)
        )
      );
  }
}
