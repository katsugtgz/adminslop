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
import { eq, inArray, sql } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { komponenNilai, nilaiPesertaDidik, penilaian } from "../schema";
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
    /** Count of penilaian with a non-null nilai in this component for this student. */
    readonly jumlahPenilaian: number;
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
 * PURELY DERIVED — NEVER STORED. For the given beban_mengajar:
 *  1. Load all komponen_nilai (with bobot) under the beban.
 *  2. Load all penilaian under those komponen.
 *  3. Load all nilai_peserta_didik rows under those penilaian.
 *  4. For each student who has any nilai row, group their rows by komponen and
 *     compute the per-component average of NON-NULL nilai (NULL = absent,
 *     excluded from the average).
 *  5. Nilai Akhir = Σ(avg_k × bobot_k) / Σ(bobot_k) for components where
 *     avg_k is non-null. Components with all-NULL (or no nilai) are EXCLUDED
 *     from numerator AND denominator. If no component has a non-null avg,
 *     nilaiAkhir = 0.
 *  6. Return sorted by pesertaDidikId, with a rincian entry per component
 *     where the student has any nilai row (auditable per AC#3).
 *
 * RLS scopes every step to the current tenant — a cross-tenant beban id
 * yields an empty result (the komponen rows are invisible).
 *
 * Implemented as three composed queries rather than one window-function SQL:
 * the derivation logic is auditable in TS, and the row counts are bounded by
 * the beban (one teaching load → modest number of komponen/penilaian/students).
 */
export async function getNilaiAkhir(
  db: Db | Tx,
  bebanMengajarId: string
): Promise<NilaiAkhirPesertaDidik[]> {
  // 1. Komponen + bobot (RLS-scoped; cross-tenant beban → empty).
  const komponenRows = await db
    .select({
      id: komponenNilai.id,
      nama: komponenNilai.nama,
      bobot: komponenNilai.bobot,
    })
    .from(komponenNilai)
    .where(eq(komponenNilai.bebanMengajarId, bebanMengajarId));

  if (komponenRows.length === 0) return [];

  // 2. Penilaian under those komponen.
  const komponenIds = komponenRows.map((k) => k.id);
  const penilaianRows = await db
    .select({
      id: penilaian.id,
      komponenNilaiId: penilaian.komponenNilaiId,
    })
    .from(penilaian)
    .where(inArray(penilaian.komponenNilaiId, komponenIds));

  if (penilaianRows.length === 0) return [];

  // penilaian.id → komponen.id lookup.
  const penilaianToKomponen = new Map<string, string>();
  for (const p of penilaianRows) {
    penilaianToKomponen.set(p.id, p.komponenNilaiId);
  }

  // 3. Nilai rows under those penilaian.
  const penilaianIds = penilaianRows.map((p) => p.id);
  const nilaiRows = await db
    .select({
      pesertaDidikId: nilaiPesertaDidik.pesertaDidikId,
      penilaianId: nilaiPesertaDidik.penilaianId,
      nilai: nilaiPesertaDidik.nilai,
    })
    .from(nilaiPesertaDidik)
    .where(inArray(nilaiPesertaDidik.penilaianId, penilaianIds));

  if (nilaiRows.length === 0) return [];

  // 4. Aggregate per (pesertaDidikId, komponenNilaiId): sum + count of NON-NULL
  //    nilai, AND track komponen presence (any row, even NULL) for the rincian.
  //    The unique constraint (tenant, penilaian, peserta_didik) means at most
  //    one nilai row per penilaian per student, so count == count of penilaian.
  type ComponentAccum = { sum: number; count: number };
  const byKey = new Map<string, ComponentAccum>(); // `${pdId}|${komponenId}`
  const presenceByStudent = new Map<string, Set<string>>(); // pdId → komponenIds

  for (const n of nilaiRows) {
    const komponenId = penilaianToKomponen.get(n.penilaianId);
    if (!komponenId) continue; // orphaned (shouldn't happen; defensive)

    const presence = presenceByStudent.get(n.pesertaDidikId) ?? new Set<string>();
    presence.add(komponenId);
    presenceByStudent.set(n.pesertaDidikId, presence);

    if (n.nilai === null) continue; // absent: counts toward presence, NOT the average

    const key = `${n.pesertaDidikId}|${komponenId}`;
    const prev = byKey.get(key) ?? { sum: 0, count: 0 };
    prev.sum += Number(n.nilai);
    prev.count += 1;
    byKey.set(key, prev);
  }

  // 5. Build the result per student.
  const hasil: NilaiAkhirPesertaDidik[] = [];
  for (const [pdId, presence] of presenceByStudent) {
    const rincian = komponenRows.flatMap((k) => {
      if (!presence.has(k.id)) return [];
      const accum = byKey.get(`${pdId}|${k.id}`);
      const bobot = Number(k.bobot);
      return [
        {
          komponenNilaiId: k.id,
          nama: k.nama,
          bobot,
          rataRata: accum && accum.count > 0 ? accum.sum / accum.count : null,
          jumlahPenilaian: accum?.count ?? 0,
        },
      ];
    });

    // Weighted average: Σ(avg × bobot) / Σ(bobot) over components with non-null avg.
    let numerator = 0;
    let denominator = 0;
    for (const r of rincian) {
      if (r.rataRata !== null) {
        numerator += r.rataRata * r.bobot;
        denominator += r.bobot;
      }
    }
    const nilaiAkhir = denominator > 0 ? numerator / denominator : 0;

    hasil.push({ pesertaDidikId: pdId, nilaiAkhir, rincian });
  }

  // 6. Stable order: sort by pesertaDidikId ascending.
  hasil.sort((a, b) =>
    a.pesertaDidikId < b.pesertaDidikId ? -1 : a.pesertaDidikId > b.pesertaDidikId ? 1 : 0
  );
  return hasil;
}
