/**
 * Data-access layer for the Arsip (#19) surface: archive (soft-delete),
 * recovery, retention policy, and change-history reads.
 *
 * Pure repository functions — no authz logic, no validation, no audit. The T5
 * action layer composes these with `getAksesSaya().boleh(...)` + `catatAudit`.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#1 (archive not hard-delete): `arsipkan` UPDATEs arsip_pada/arsip_oleh —
 * it NEVER deletes a row. The row persists for recovery.
 * AC#2 (recovery + accountability): `pulihkan` sets both columns back to NULL.
 * AC#5 (no SQL injection): the `tabel` argument is validated against a strict
 * whitelist (`TABEL_ARSIP`) via switch/case and mapped to the real drizzle
 * table object. The user-supplied string is NEVER interpolated into raw SQL.
 */
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import {
  bebanMengajar,
  catatanAudit,
  penilaian,
  ptk,
  retensiData,
  waliKelas,
} from "../schema";
import type { CatatanAudit, RetensiData } from "../schema";

/** Supported archive tables (the whitelist — AC#5). */
export type TabelArsip = "ptk" | "penilaian" | "beban_mengajar" | "wali_kelas";

/** Human-readable Bahasa label for a TabelArsip (UI display). */
export function labelTabelArsip(tabel: TabelArsip): string {
  switch (tabel) {
    case "ptk":
      return "PTK";
    case "penilaian":
      return "Penilaian";
    case "beban_mengajar":
      return "Beban Mengajar";
    case "wali_kelas":
      return "Wali Kelas";
  }
}

const TABEL_ARSIP = ["ptk", "penilaian", "beban_mengajar", "wali_kelas"] as const;

/** True iff `t` is a supported archive table (the whitelist check — AC#5). */
function isTabelArsip(t: string): t is TabelArsip {
  return (TABEL_ARSIP as readonly string[]).includes(t);
}

/**
 * Assert `t` is a supported archive table and return the literal. Throws on
 * unknown values — the action layer must validate BEFORE calling, but this is
 * the defense-in-depth gate that prevents any raw-SQL path from ever forming.
 */
function assertTabelArsip(t: string): TabelArsip {
  if (!isTabelArsip(t)) {
    throw new Error(`Tabel tidak didukung: ${t}`);
  }
  return t;
}

/** A flattened archived-row view across the four supported tables. */
export interface BarisArsip {
  readonly id: string;
  readonly tabel: TabelArsip;
  readonly arsipPada: Date;
  readonly arsipOleh: string | null;
  readonly label: string;
}

/**
 * Archive (soft-delete) a row: set `arsip_pada = now()` and `arsip_oleh`. NEVER
 * deletes — the row persists (AC#1). RLS scopes the UPDATE to the current
 * tenant; a cross-tenant id is a silent no-op (zero rows affected). Returns the
 * number of rows updated (0 = not found / already archived).
 *
 * AC#5: `tabel` is switch/case-mapped to a real drizzle table object — the
 * user-supplied string never reaches raw SQL.
 */
export async function arsipkan(
  db: Db | Tx,
  tabelRaw: string,
  id: string,
  arsipOleh: string
): Promise<number> {
  const tabel = assertTabelArsip(tabelRaw);
  const now = sql`now()`;
  switch (tabel) {
    case "ptk": {
      const rows = await db
        .update(ptk)
        .set({ arsipPada: now, arsipOleh })
        .where(and(eq(ptk.id, id), isNull(ptk.arsipPada)))
        .returning({ id: ptk.id });
      return rows.length;
    }
    case "penilaian": {
      const rows = await db
        .update(penilaian)
        .set({ arsipPada: now, arsipOleh })
        .where(and(eq(penilaian.id, id), isNull(penilaian.arsipPada)))
        .returning({ id: penilaian.id });
      return rows.length;
    }
    case "beban_mengajar": {
      const rows = await db
        .update(bebanMengajar)
        .set({ arsipPada: now, arsipOleh })
        .where(
          and(eq(bebanMengajar.id, id), isNull(bebanMengajar.arsipPada))
        )
        .returning({ id: bebanMengajar.id });
      return rows.length;
    }
    case "wali_kelas": {
      const rows = await db
        .update(waliKelas)
        .set({ arsipPada: now, arsipOleh })
        .where(and(eq(waliKelas.id, id), isNull(waliKelas.arsipPada)))
        .returning({ id: waliKelas.id });
      return rows.length;
    }
  }
}

/**
 * Recover an archived row: set `arsip_pada = NULL` and `arsip_oleh = NULL`.
 * RLS scopes the UPDATE to the current tenant. Returns the number of rows
 * updated (0 = not found / not archived). The action layer records a separate
 * catat_audit entry — recovery with accountability (AC#2).
 */
export async function pulihkan(
  db: Db | Tx,
  tabelRaw: string,
  id: string
): Promise<number> {
  const tabel = assertTabelArsip(tabelRaw);
  switch (tabel) {
    case "ptk": {
      const rows = await db
        .update(ptk)
        .set({ arsipPada: null, arsipOleh: null })
        .where(and(eq(ptk.id, id), isNotNull(ptk.arsipPada)))
        .returning({ id: ptk.id });
      return rows.length;
    }
    case "penilaian": {
      const rows = await db
        .update(penilaian)
        .set({ arsipPada: null, arsipOleh: null })
        .where(and(eq(penilaian.id, id), isNotNull(penilaian.arsipPada)))
        .returning({ id: penilaian.id });
      return rows.length;
    }
    case "beban_mengajar": {
      const rows = await db
        .update(bebanMengajar)
        .set({ arsipPada: null, arsipOleh: null })
        .where(
          and(eq(bebanMengajar.id, id), isNotNull(bebanMengajar.arsipPada))
        )
        .returning({ id: bebanMengajar.id });
      return rows.length;
    }
    case "wali_kelas": {
      const rows = await db
        .update(waliKelas)
        .set({ arsipPada: null, arsipOleh: null })
        .where(and(eq(waliKelas.id, id), isNotNull(waliKelas.arsipPada)))
        .returning({ id: waliKelas.id });
      return rows.length;
    }
  }
}

/**
 * List archived rows (arsip_pada IS NOT NULL) across the supported tables. When
 * `tabel` is omitted, scans all four; otherwise narrows to one. Ordered by
 * arsip_pada DESC (most recent first). RLS scopes every read to the tenant.
 */
export async function listArsip(
  db: Db | Tx,
  tabel?: TabelArsip
): Promise<BarisArsip[]> {
  const out: BarisArsip[] = [];
  const tables: readonly TabelArsip[] = tabel ? [tabel] : TABEL_ARSIP;

  for (const t of tables) {
    switch (t) {
      case "ptk": {
        const rows = await db
          .select({
            id: ptk.id,
            arsipPada: ptk.arsipPada,
            arsipOleh: ptk.arsipOleh,
            label: ptk.nama,
          })
          .from(ptk)
          .where(isNotNull(ptk.arsipPada));
        for (const r of rows) {
          out.push({
            id: r.id,
            tabel: "ptk",
            arsipPada: r.arsipPada as Date,
            arsipOleh: r.arsipOleh,
            label: r.label,
          });
        }
        break;
      }
      case "penilaian": {
        const rows = await db
          .select({
            id: penilaian.id,
            arsipPada: penilaian.arsipPada,
            arsipOleh: penilaian.arsipOleh,
            label: penilaian.nama,
          })
          .from(penilaian)
          .where(isNotNull(penilaian.arsipPada));
        for (const r of rows) {
          out.push({
            id: r.id,
            tabel: "penilaian",
            arsipPada: r.arsipPada as Date,
            arsipOleh: r.arsipOleh,
            label: r.label,
          });
        }
        break;
      }
      case "beban_mengajar": {
        const rows = await db
          .select({
            id: bebanMengajar.id,
            arsipPada: bebanMengajar.arsipPada,
            arsipOleh: bebanMengajar.arsipOleh,
            label: bebanMengajar.semester,
          })
          .from(bebanMengajar)
          .where(isNotNull(bebanMengajar.arsipPada));
        for (const r of rows) {
          out.push({
            id: r.id,
            tabel: "beban_mengajar",
            arsipPada: r.arsipPada as Date,
            arsipOleh: r.arsipOleh,
            label: r.label,
          });
        }
        break;
      }
      case "wali_kelas": {
        const rows = await db
          .select({
            id: waliKelas.id,
            arsipPada: waliKelas.arsipPada,
            arsipOleh: waliKelas.arsipOleh,
            label: waliKelas.semester,
          })
          .from(waliKelas)
          .where(isNotNull(waliKelas.arsipPada));
        for (const r of rows) {
          out.push({
            id: r.id,
            tabel: "wali_kelas",
            arsipPada: r.arsipPada as Date,
            arsipOleh: r.arsipOleh,
            label: r.label,
          });
        }
        break;
      }
    }
  }

  out.sort((a, b) => b.arsipPada.getTime() - a.arsipPada.getTime());
  return out;
}

/**
 * Read retention policies for the active tenant. When `tabel` is omitted,
 * returns all rows; otherwise narrows to one. Ordered by tabel ASC.
 */
export async function getRetensi(
  db: Db | Tx,
  tabel?: string
): Promise<RetensiData[]> {
  return db
    .select()
    .from(retensiData)
    .where(tabel !== undefined ? eq(retensiData.tabel, tabel) : undefined)
    .orderBy(asc(retensiData.tabel));
}

export interface InputAturRetensi {
  readonly tabel: TabelArsip;
  readonly periodeBulan: number;
  readonly keterangan?: string;
}

/**
 * Upsert a retention policy for `(tabel)`. The (tenant, tabel) pair is UNIQUE —
 * an existing row is updated, otherwise a new one is inserted. RLS + the GUC
 * default handle tenant scoping. Returns the upserted row.
 */
export async function aturRetensi(
  db: Db | Tx,
  input: InputAturRetensi
): Promise<RetensiData> {
  const existing = await db
    .select()
    .from(retensiData)
    .where(eq(retensiData.tabel, input.tabel));
  if (existing.length > 0) {
    const [row] = await db
      .update(retensiData)
      .set({
        periodeBulan: input.periodeBulan,
        keterangan: input.keterangan ?? null,
      })
      .where(eq(retensiData.id, existing[0].id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(retensiData)
    .values({
      tabel: input.tabel,
      periodeBulan: input.periodeBulan,
      keterangan: input.keterangan ?? null,
    })
    .returning();
  return row;
}

export interface OpsiRiwayatPerubahan {
  readonly target?: string;
  readonly aktor?: string;
  readonly limit?: number;
}

/**
 * Read the change-history (catatan_audit) for the active tenant — the Riwayat
 * Perubahan surface (AC#4). Optionally narrow by `target` (exact match, e.g.
 * `ptk:<id>`) or `aktor` (userId). Ordered by dibuat_pada DESC (newest first).
 * RLS scopes every row to the tenant GUC. `limit` defaults to 50.
 *
 * `target`/`aktor` use parameterized equality — never interpolated raw.
 */
export async function listRiwayatPerubahan(
  db: Db | Tx,
  opts: OpsiRiwayatPerubahan = {}
): Promise<CatatanAudit[]> {
  const conditions = [];
  if (opts.target !== undefined) {
    conditions.push(eq(catatanAudit.target, opts.target));
  }
  if (opts.aktor !== undefined) {
    conditions.push(eq(catatanAudit.aktor, opts.aktor));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const base = db
    .select()
    .from(catatanAudit)
    .where(where)
    .orderBy(desc(catatanAudit.dibuatPada));
  const limit = opts.limit ?? 50;
  const rows = await base.limit(limit);
  return rows as CatatanAudit[];
}
