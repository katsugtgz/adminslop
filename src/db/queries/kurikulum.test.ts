import path from "node:path";

import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import * as q from "./kurikulum";

// Load .env (Node native; no-op if missing).
try {
  process.loadEnvFile?.();
} catch {
  /* rely on real environment */
}

const APP_URL = process.env.DATABASE_URL;
const MIG_URL = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
const ready = Boolean(APP_URL && MIG_URL);

const itOrSkip = ready ? it : it.skip;
const describeOrSkip = ready ? describe : describe.skip;

// Seed/DELETE run as the migrator superuser (app_user has SELECT only on these
// GLOBAL tables — ADR 0001). Query verification runs through appDb so the
// tests exercise the real production path (GRANT SELECT ONLY boundary).
let migDb: Db;
let appDb: Db;

/**
 * Fixture ids captured in beforeAll — every test asserts against these so the
 * cases are independent of insertion order. The fixture is deliberately
 * structured so the DISTINCT drill-downs are meaningful:
 *
 *   kurikulum: K1 (default status), K2 (disetujui) — K2 has NO CPs (empty case)
 *   mata_pelajaran: MTK, BIN (have CPs under K1), IPA (has NO CPs — excluded
 *                   from the DISTINCT drill-down even though the row exists)
 *   fase: FA, FB, FC
 *   capaian_pembelajaran under K1:
 *     CP_MTK_A  = K1 + MTK + FA
 *     CP_MTK_B  = K1 + MTK + FB      (MTK covers FA + FB, not FC)
 *     CP_BIN_A  = K1 + BIN + FA
 *     CP_BIN_B  = K1 + BIN + FB
 *     CP_BIN_C  = K1 + BIN + FC      (BIN covers all three fases)
 *   tujuan_pembelajaran under CP_MTK_A: TP1, TP2, TP3 (urutan 1,2,3)
 *   alur_tujuan_pembelajaran under TP1: ATP1, ATP2 (urutan 1,2)
 */
let K1: string;
let K2: string;
let MTK: string;
let BIN: string;
let IPA: string;
let FA: string;
let FB: string;
let FC: string;
let CP_MTK_A: string;
let CP_MTK_B: string;
let CP_BIN_A: string;
let CP_BIN_B: string;
let CP_BIN_C: string;
let TP1: string;
let ATP1: string;

describeOrSkip("kurikulum repository (#9, T5 — GLOBAL drill-down queries)", () => {
  beforeAll(async () => {
    // 1. Migrate as superuser (creates global tables + GRANT SELECT ONLY).
    await runMigrations(
      MIG_URL!,
      path.join(process.cwd(), "src/db/migrations")
    );

    // 2. Clear the 6 global tables in FK-safe order so the fixture is
    //    deterministic. Children first (ATP -> TP -> CP), then kurikulum,
    //    then the unreferenced mata_pelajaran + fase. No tenant seeding —
    //    these tables carry no tenant_id.
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      delete from alur_tujuan_pembelajaran;
      delete from tujuan_pembelajaran;
      delete from capaian_pembelajaran;
      delete from kurikulum;
      -- Cross-worktree DB contamination guard: the shared Docker DB may carry
      -- tables from sibling branches' migrations (#16/#17) whose FKs RESTRICT
      -- on mata_pelajaran. Clear them if present so this branch's mata_pelajaran
      -- DELETE does not trip a 23503. Conditional (information_schema) so a
      -- missing table is a no-op rather than an error.
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'perangkat_ajar') THEN DELETE FROM perangkat_ajar; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'butir_soal') THEN DELETE FROM butir_soal; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'paket_soal_butir') THEN DELETE FROM paket_soal_butir; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'paket_soal') THEN DELETE FROM paket_soal; END IF;
      END $$;
      -- beban_mengajar references mata_pelajaran ON DELETE RESTRICT (#10);
      -- must clear before mata_pelajaran deletion in parallel test runs.
      delete from beban_mengajar;
      delete from wali_kelas;
      delete from mata_pelajaran;
      delete from fase;
    `);

    // 3. Seed the fixture as migrator superuser. `pg` Pool.query returns a
    //    QueryResult; `RETURNING id` rows are read via `.rows[0]`.
    const k1 = (
      await seed.query(`
        insert into kurikulum (nama, versi, sumber, status_persetujuan)
        values ('Kurikulum Merdeka', '2022', 'Kemdikbud', 'memerlukan_tinjauan')
        returning id;
      `)
    ).rows[0];
    const k2 = (
      await seed.query(`
        insert into kurikulum (nama, versi, sumber, status_persetujuan, disetujui_oleh)
        values ('Kurikulum 2013', '2013', 'Kemdikbud', 'disetujui', 'reviewer-1')
        returning id;
      `)
    ).rows[0];
    K1 = k1.id;
    K2 = k2.id;

    const mtk = (
      await seed.query(`
        insert into mata_pelajaran (kode, nama) values ('MTK', 'Matematika') returning id;
      `)
    ).rows[0];
    const bin = (
      await seed.query(`
        insert into mata_pelajaran (kode, nama) values ('BIN', 'Bahasa Indonesia') returning id;
      `)
    ).rows[0];
    const ipa = (
      await seed.query(`
        insert into mata_pelajaran (kode, nama) values ('IPA', 'Ilmu Pengetahuan Alam') returning id;
      `)
    ).rows[0];
    MTK = mtk.id;
    BIN = bin.id;
    IPA = ipa.id;

    const fa = (
      await seed.query(`
        insert into fase (kode, nama, rentang_kelas, jenjang) values ('A', 'Fase A', 'Kelas 1-2', 'SD') returning id;
      `)
    ).rows[0];
    const fb = (
      await seed.query(`
        insert into fase (kode, nama, rentang_kelas, jenjang) values ('B', 'Fase B', 'Kelas 3-4', 'SD') returning id;
      `)
    ).rows[0];
    const fc = (
      await seed.query(`
        insert into fase (kode, nama, rentang_kelas, jenjang) values ('C', 'Fase C', 'Kelas 5-6', 'SD') returning id;
      `)
    ).rows[0];
    FA = fa.id;
    FB = fb.id;
    FC = fc.id;

    // 5 CPs under K1 covering different (mapel, fase) combos. IPA has none.
    const cpMtkA = (
      await seed.query({
        text: `
          insert into capaian_pembelajaran (kurikulum_id, mata_pelajaran_id, fase_id, kode, deskripsi)
          values ($1, $2, $3, 'CP-MTK-A', 'Capaian MTK Fase A')
          returning id;
        `,
        values: [K1, MTK, FA],
      })
    ).rows[0];
    const cpMtkB = (
      await seed.query({
        text: `
          insert into capaian_pembelajaran (kurikulum_id, mata_pelajaran_id, fase_id, kode, deskripsi)
          values ($1, $2, $3, 'CP-MTK-B', 'Capaian MTK Fase B')
          returning id;
        `,
        values: [K1, MTK, FB],
      })
    ).rows[0];
    const cpBinA = (
      await seed.query({
        text: `
          insert into capaian_pembelajaran (kurikulum_id, mata_pelajaran_id, fase_id, kode, deskripsi)
          values ($1, $2, $3, 'CP-BIN-A', 'Capaian BIN Fase A')
          returning id;
        `,
        values: [K1, BIN, FA],
      })
    ).rows[0];
    const cpBinB = (
      await seed.query({
        text: `
          insert into capaian_pembelajaran (kurikulum_id, mata_pelajaran_id, fase_id, kode, deskripsi)
          values ($1, $2, $3, 'CP-BIN-B', 'Capaian BIN Fase B')
          returning id;
        `,
        values: [K1, BIN, FB],
      })
    ).rows[0];
    const cpBinC = (
      await seed.query({
        text: `
          insert into capaian_pembelajaran (kurikulum_id, mata_pelajaran_id, fase_id, kode, deskripsi)
          values ($1, $2, $3, 'CP-BIN-C', 'Capaian BIN Fase C')
          returning id;
        `,
        values: [K1, BIN, FC],
      })
    ).rows[0];
    CP_MTK_A = cpMtkA.id;
    CP_MTK_B = cpMtkB.id;
    CP_BIN_A = cpBinA.id;
    CP_BIN_B = cpBinB.id;
    CP_BIN_C = cpBinC.id;

    // 3 TPs under CP_MTK_A (ordered by urutan) for the ordering test.
    const tp1 = (
      await seed.query({
        text: `
          insert into tujuan_pembelajaran (capaian_pembelajaran_id, urutan, deskripsi)
          values ($1, 1, 'Tujuan 1')
          returning id;
        `,
        values: [CP_MTK_A],
      })
    ).rows[0];
    await seed.query({
      text: `
        insert into tujuan_pembelajaran (capaian_pembelajaran_id, urutan, deskripsi)
        values ($1, 2, 'Tujuan 2');
      `,
      values: [CP_MTK_A],
    });
    await seed.query({
      text: `
        insert into tujuan_pembelajaran (capaian_pembelajaran_id, urutan, deskripsi)
        values ($1, 3, 'Tujuan 3');
      `,
      values: [CP_MTK_A],
    });
    TP1 = tp1.id;

    // 2 ATPs under TP1 (ordered by urutan) for the ordering test.
    const atp1 = (
      await seed.query({
        text: `
          insert into alur_tujuan_pembelajaran (tujuan_pembelajaran_id, urutan, deskripsi)
          values ($1, 1, 'Alur 1')
          returning id;
        `,
        values: [TP1],
      })
    ).rows[0];
    await seed.query({
      text: `
        insert into alur_tujuan_pembelajaran (tujuan_pembelajaran_id, urutan, deskripsi)
        values ($1, 2, 'Alur 2');
      `,
      values: [TP1],
    });
    ATP1 = atp1.id;

    await seed.end();

    // 4. Two clients: migrator (read/write) + app_user (SELECT only). All
    //    query verifications run through appDb — the real production path.
    migDb = createDb(MIG_URL!).db;
    appDb = createDb(APP_URL!).db;
  });

  // 1. listKurikulum: returns all kurikulum; with opts.status filter returns
  //    subset. Ordered by nama (2013 < Merdeka alphabetically).
  itOrSkip("listKurikulum returns all rows; status filter narrows", async () => {
    const all = await q.listKurikulum(appDb);
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.id).sort()).toEqual([K1, K2].sort());
    // ORDER BY nama: 'Kurikulum 2013' precedes 'Kurikulum Merdeka'.
    expect(all[0].nama).toBe("Kurikulum 2013");
    expect(all[1].nama).toBe("Kurikulum Merdeka");

    const disetujui = await q.listKurikulum(appDb, { status: "disetujui" });
    expect(disetujui).toHaveLength(1);
    expect(disetujui[0].id).toBe(K2);
    expect(disetujui[0].statusPersetujuan).toBe("disetujui");
    expect(disetujui[0].disetujuiOleh).toBe("reviewer-1");

    const tinjauan = await q.listKurikulum(appDb, {
      status: "memerlukan_tinjauan",
    });
    expect(tinjauan).toHaveLength(1);
    expect(tinjauan[0].id).toBe(K1);

    // A status with no matches returns an empty array (not an error).
    const empty = await q.listKurikulum(appDb, { status: "ditolak" });
    expect(empty).toEqual([]);
  });

  // 2. listMataPelajaranByKurikulum: returns DISTINCT mapel that have CPs for
  //    K1. IPA exists as a row but has no CPs, so it is excluded. Only MTK
  //    and BIN have CPs -> length 2 (not 3). Ordered by nama (BIN < MTK).
  itOrSkip("listMataPelajaranByKurikulum returns DISTINCT mapel with CPs only", async () => {
    const mapel = await q.listMataPelajaranByKurikulum(appDb, K1);
    expect(mapel).toHaveLength(2);
    expect(mapel.map((m) => m.id).sort()).toEqual([MTK, BIN].sort());
    // IPA has no CPs — it must NOT appear even though the row exists.
    expect(mapel.find((m) => m.id === IPA)).toBeUndefined();
    // Ordered by nama: 'Bahasa Indonesia' < 'Matematika'.
    expect(mapel[0].nama).toBe("Bahasa Indonesia");
    expect(mapel[0].kode).toBe("BIN");
    expect(mapel[1].nama).toBe("Matematika");
    expect(mapel[1].kode).toBe("MTK");
  });

  // 3. listFaseByKurikulumDanMapel: returns DISTINCT fase for K1+MTK. MTK has
  //    CPs in FA + FB only (not FC) -> [FA, FB]. Ordered by kode (A < B).
  itOrSkip("listFaseByKurikulumDanMapel returns DISTINCT fase for the mapel", async () => {
    const fases = await q.listFaseByKurikulumDanMapel(appDb, K1, MTK);
    expect(fases).toHaveLength(2);
    expect(fases.map((f) => f.id).sort()).toEqual([FA, FB].sort());
    // FC has no CP for MTK — excluded.
    expect(fases.find((f) => f.id === FC)).toBeUndefined();
    // Ordered by kode: 'A' < 'B'.
    expect(fases[0].kode).toBe("A");
    expect(fases[1].kode).toBe("B");
    // Spot-check the full row shape is returned (not just id/kode).
    expect(fases[0].nama).toBe("Fase A");
    expect(fases[0].rentangKelas).toBe("Kelas 1-2");
    expect(fases[0].jenjang).toBe("SD");

    // BIN covers all three fases (A, B, C) — cross-check the DISTINCT works
    // across multiple CPs sharing a fase.
    const binFases = await q.listFaseByKurikulumDanMapel(appDb, K1, BIN);
    expect(binFases).toHaveLength(3);
    expect(binFases.map((f) => f.id).sort()).toEqual([FA, FB, FC].sort());
  });

  // 4. listCapaianPembelajaran: filter by kurikulumId alone -> all 5 CPs;
  //    +mapelId -> subset; +faseId -> narrower subset.
  itOrSkip("listCapaianPembelajaran narrows by kurikulumId, mapelId, faseId", async () => {
    // kurikulumId only -> all 5 CPs under K1.
    const all = await q.listCapaianPembelajaran(appDb, { kurikulumId: K1 });
    expect(all).toHaveLength(5);
    expect(all.map((c) => c.id).sort()).toEqual(
      [CP_MTK_A, CP_MTK_B, CP_BIN_A, CP_BIN_B, CP_BIN_C].sort()
    );

    // +mapelId (MTK) -> 2 CPs (MTK in A and B).
    const mtk = await q.listCapaianPembelajaran(appDb, {
      kurikulumId: K1,
      mapelId: MTK,
    });
    expect(mtk).toHaveLength(2);
    expect(mtk.map((c) => c.id).sort()).toEqual([CP_MTK_A, CP_MTK_B].sort());

    // +mapelId +faseId (MTK, FA) -> 1 CP.
    const mtkA = await q.listCapaianPembelajaran(appDb, {
      kurikulumId: K1,
      mapelId: MTK,
      faseId: FA,
    });
    expect(mtkA).toHaveLength(1);
    expect(mtkA[0].id).toBe(CP_MTK_A);
    expect(mtkA[0].kode).toBe("CP-MTK-A");
    expect(mtkA[0].deskripsi).toBe("Capaian MTK Fase A");
    expect(mtkA[0].kurikulumId).toBe(K1);
    expect(mtkA[0].mataPelajaranId).toBe(MTK);
    expect(mtkA[0].faseId).toBe(FA);

    // faseId alone (with kurikulumId) -> all CPs in that fase across mapel.
    const faseA = await q.listCapaianPembelajaran(appDb, {
      kurikulumId: K1,
      faseId: FA,
    });
    expect(faseA).toHaveLength(2);
    expect(faseA.map((c) => c.id).sort()).toEqual([CP_MTK_A, CP_BIN_A].sort());
  });

  // 5. listTujuanPembelajaranByCP: returns TPs for CP_MTK_A, ordered by urutan.
  itOrSkip("listTujuanPembelajaranByCP returns TPs ordered by urutan ASC", async () => {
    const tps = await q.listTujuanPembelajaranByCP(appDb, CP_MTK_A);
    expect(tps).toHaveLength(3);
    expect(tps.map((t) => t.urutan)).toEqual([1, 2, 3]);
    expect(tps.map((t) => t.deskripsi)).toEqual([
      "Tujuan 1",
      "Tujuan 2",
      "Tujuan 3",
    ]);
    expect(tps[0].id).toBe(TP1);
    expect(tps[0].capaianPembelajaranId).toBe(CP_MTK_A);

    // A CP with no TPs returns [] (CP_MTK_B has none).
    const empty = await q.listTujuanPembelajaranByCP(appDb, CP_MTK_B);
    expect(empty).toEqual([]);
  });

  // 6. listAlurTujuanPembelajaranByTP: returns ATPs for TP1, ordered by urutan.
  itOrSkip("listAlurTujuanPembelajaranByTP returns ATPs ordered by urutan ASC", async () => {
    const atps = await q.listAlurTujuanPembelajaranByTP(appDb, TP1);
    expect(atps).toHaveLength(2);
    expect(atps.map((a) => a.urutan)).toEqual([1, 2]);
    expect(atps.map((a) => a.deskripsi)).toEqual(["Alur 1", "Alur 2"]);
    expect(atps[0].id).toBe(ATP1);
    expect(atps[0].tujuanPembelajaranId).toBe(TP1);
  });

  // 7. Empty results: listMataPelajaranByKurikulum for a kurikulum with no CPs
  //    (K2) -> []. Also exercises the JOIN returning nothing.
  itOrSkip("returns empty array when no CPs match the drill-down", async () => {
    const mapel = await q.listMataPelajaranByKurikulum(appDb, K2);
    expect(mapel).toEqual([]);

    const fases = await q.listFaseByKurikulumDanMapel(appDb, K2, MTK);
    expect(fases).toEqual([]);

    const cps = await q.listCapaianPembelajaran(appDb, { kurikulumId: K2 });
    expect(cps).toEqual([]);
  });

  // Smoke: the read path works through the migrator client too (Db | Tx union
  // accepts either) — guards against accidental client-type coupling.
  itOrSkip("queries accept the migrator client (Db | Tx union)", async () => {
    // GLOBAL tables have no RLS — parallel db test files share the same rows,
    // so exact counts are unstable under parallel execution. Assert >= seeded.
    const all = await q.listKurikulum(migDb);
    expect(all.length).toBeGreaterThanOrEqual(2);
    const mapel = await q.listMataPelajaranByKurikulum(migDb, K1);
    expect(mapel.length).toBeGreaterThanOrEqual(2);
    void schema; // keep schema import live for parity with sibling test files.
  });
});
