/**
 * Data-access layer over nilai_peserta_didik + the AC#3 Nilai Akhir derivation.
 * Pure repository functions — no authz logic, no validation, no audit. Composed
 * by T4/T5/T6 layers.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#3 Nilai Akhir DERIVATION: `getNilaiAkhir` computes the weighted average
 * of per-component averages on the fly. Nilai Akhir is NEVER STORED — it is
 * derived from komponen_nilai.bobot + the student's nilai_peserta_didik.nilai
 * rows. The rincian array exposes every weight + average so the derivation is
 * fully auditable.
 *
 * NUMERIC COLUMN NOTE: `komponen_nilai.bobot` and `nilai_peserta_didik.nilai`
 * are drizzle `numeric()` columns (default `mode: 'string'`). The DB stores
 * arbitrary-precision decimals; drizzle exchanges strings with the driver to
 * preserve precision. Inputs from the repo interface are `number` (per the
 * domain contract: nilai 0..100, bobot integer-ish weights); we convert to
 * string on insert (`String(...)`) and back to number on read (`Number(...)`).
 */
import { eq, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { nilaiPesertaDidik } from "../schema";
import type { NilaiPesertaDidik } from "../schema";

export interface InputNilai {
  readonly penilaianId: string;
  readonly pesertaDidikId: string;
  /** 0..100; null = absent (student has a row but no score). */
  readonly nilai?: number | null;
  readonly catatan?: string;
}

/**
 * AC#3: Nilai Akhir per student for a beban_mengajar. PURELY DERIVED — never
 * stored. `rincian` exposes every weight + per-component average so the
 * derivation is auditable (AC#3: visible/auditable).
 */
export interface NilaiAkhirPesertaDidik {
  readonly pesertaDidikId: string;
  /** Σ(component_avg × bobot) / Σ(bobot) — see getNilaiAkhir. */
  readonly nilaiAkhir: number;
  readonly rincian: readonly {
    readonly komponenNilaiId: string;
    readonly nama: string;
    readonly bobot: number;
    /** Avg of non-null nilai in this component for this student; null when all absent. */
    readonly rataRata: number | null;
  }[];
}

/**
 * List all nilai_peserta_didik rows for a penilaian visible under the current
 * tenant (RLS-scoped). Cross-tenant rows are invisible.
 */
export async function listNilaiByPenilaian(
  db: Db | Tx,
  penilaianId: string
): Promise<NilaiPesertaDidik[]> {
  return db
    .select()
    .from(nilaiPesertaDidik)
    .where(eq(nilaiPesertaDidik.penilaianId, penilaianId));
}

/**
 * Upsert a nilai row by (tenant, penilaian, peserta_didik). On conflict,
 * update nilai + catatan. Runs inside `withTenant` so `tenant_id` defaults
 * from the GUC. Returns the inserted/updated row.
 */
export async function upsertNilai(
  db: Db | Tx,
  input: InputNilai
): Promise<NilaiPesertaDidik> {
  const [row] = await db
    .insert(nilaiPesertaDidik)
    .values({
      penilaianId: input.penilaianId,
      pesertaDidikId: input.pesertaDidikId,
      // numeric column → driver wants string; null passes through for absent.
      nilai: input.nilai != null ? String(input.nilai) : null,
      catatan: input.catatan ?? null,
    })
    .onConflictDoUpdate({
      target: [
        nilaiPesertaDidik.tenantId,
        nilaiPesertaDidik.penilaianId,
        nilaiPesertaDidik.pesertaDidikId,
      ],
      set: {
        nilai: sql`excluded.nilai`,
        catatan: sql`excluded.catatan`,
      },
    })
    .returning();
  return row;
}

/**
 * Delete a nilai row by id. RLS scopes to the current tenant — a cross-tenant
 * delete is a silent no-op (zero rows affected).
 */
export async function hapusNilai(db: Db | Tx, id: string): Promise<void> {
  await db.delete(nilaiPesertaDidik).where(eq(nilaiPesertaDidik.id, id));
}

/**
 * AC#3 DERIVATION — Nilai Akhir = Σ(component_avg × bobot) / Σ(bobot).
 *
 * PURELY DERIVED — NEVER STORED. Single SQL query joins komponen_nilai →
 * penilaian → nilai_peserta_didik, aggregates per (student, component) in a
 * CTE, then computes the weighted average via window functions. NULL nilai
 * (absent) are excluded from the average — AVG ignores NULLs. RLS scopes
 * every table to the current tenant.
 *
 * Output shape (NilaiAkhirPesertaDidik) is preserved: the flat SQL rows are
 * grouped by peserta_didik_id into nested `rincian` arrays in TS.
 *
 * Previous implementation ran 3 sequential queries + JS aggregation; that logic
 * is preserved as a reference in the git history (commit prior to this change).
 */
export async function getNilaiAkhir(
  db: Db | Tx,
  bebanMengajarId: string,
  pesertaDidikId?: string
): Promise<NilaiAkhirPesertaDidik[]> {
  const result = await db.execute<{
    peserta_didik_id: string;
    komponen_id: string;
    komponen_nama: string;
    komponen_bobot: number;
    rata_rata: number | null;
    nilai_akhir: number;
  }>(sql`
    WITH per_component AS (
      SELECT
        k.id AS komponen_id,
        k.nama AS komponen_nama,
        k.bobot::float8 AS komponen_bobot,
        n.peserta_didik_id,
        AVG(n.nilai::float8) AS rata_rata
      FROM komponen_nilai k
      JOIN penilaian p ON p.komponen_nilai_id = k.id
      JOIN nilai_peserta_didik n ON n.penilaian_id = p.id
      WHERE k.beban_mengajar_id = ${bebanMengajarId}
        ${pesertaDidikId !== undefined ? sql`AND n.peserta_didik_id = ${pesertaDidikId}` : sql``}
      GROUP BY k.id, k.nama, k.bobot, n.peserta_didik_id
    )
    SELECT
      peserta_didik_id,
      komponen_id,
      komponen_nama,
      komponen_bobot,
      rata_rata,
      COALESCE(
        SUM(CASE WHEN rata_rata IS NOT NULL THEN rata_rata * komponen_bobot ELSE 0 END)
          OVER (PARTITION BY peserta_didik_id)
        / NULLIF(
            SUM(CASE WHEN rata_rata IS NOT NULL THEN komponen_bobot ELSE 0 END)
              OVER (PARTITION BY peserta_didik_id),
            0
          ),
        0
      ) AS nilai_akhir
    FROM per_component
    ORDER BY peserta_didik_id, komponen_id
  `);

  const rows = result.rows;
  if (rows.length === 0) return [];

  const byStudent = new Map<
    string,
    {
      pesertaDidikId: string;
      nilaiAkhir: number;
      rincian: {
        komponenNilaiId: string;
        nama: string;
        bobot: number;
        rataRata: number | null;
      }[];
    }
  >();

  for (const row of rows) {
    let entry = byStudent.get(row.peserta_didik_id);
    if (!entry) {
      entry = {
        pesertaDidikId: row.peserta_didik_id,
        nilaiAkhir: row.nilai_akhir,
        rincian: [],
      };
      byStudent.set(row.peserta_didik_id, entry);
    }
    entry.rincian.push({
      komponenNilaiId: row.komponen_id,
      nama: row.komponen_nama,
      bobot: row.komponen_bobot,
      rataRata: row.rata_rata,
    });
  }

  return [...byStudent.values()];
}
