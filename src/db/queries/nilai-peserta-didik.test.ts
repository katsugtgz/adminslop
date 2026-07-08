import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  getNilaiAkhir,
  hapusNilai,
  listNilaiByPenilaian,
  upsertNilai,
} from "./nilai-peserta-didik";

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

// Tenant seeds — PRIVATE to this file (org_NP_*). Distinct per query test file
// (schema-level nilai-peserta-didik tests, if added, would use a different
// prefix) so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_NP_a";
const SEED_B = "org_NP_b";

// Monotonic counter for unique GLOBAL mata_pelajaran names + tenant-scoped
// UNIQUE keys (tingkat urutan/nama, tahun_ajaran nama, rombel nama, komponen
// nama, penilaian nama). mata_pelajaran is GLOBAL (UNIQUE nama/kode, no tenant
// isolation) so distinct names avoid cross-test collisions.
let _seq = 0;
const seq = (): number => ++_seq;

describeOrSkip(
  "nilai peserta didik repository (queries/nilai-peserta-didik.ts — #11 Wave 2 / T5)",
  () => {
    // Insert/DELETE on GLOBAL mata_pelajaran run as the migrator superuser
    // (app_user has SELECT only — ADR 0001). Tenant-scoped writes use the app
    // client (`db`) inside `withTenant` so RLS is enforced.
    let migDb: Db;
    let db: Db;

    // Shared FK parents in SEED_A + SEED_B (seeded in beforeAll; reused by
    // every case via seedGradingChain). Beban references ptk + mata_pelajaran
    // + rombongan_belajar + tahun_ajaran; nilai references penilaian +
    // peserta_didik. Seeding these once avoids per-case UNIQUE collisions.
    let mpAId: string;
    let ptkAId: string;
    let taAId: string;
    let rombelAId: string;
    let ptkBId: string;
    let taBId: string;
    let rombelBId: string;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT) and clear the grading layer + its FK
      //    parents in FK-safe order (children first) so each run starts clean.
      //    Scoped to this file's tenants only — parallel test files use
      //    distinct tenants. Superuser bypasses RLS. The GLOBAL mata_pelajaran
      //    clear is scoped to this file's kode prefix (NP-MP-*) and runs
      //    AFTER nilai_peserta_didik so no FK can fire.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_NP_a', 'Satuan Pendidikan NP A'),
          ('org_NP_b', 'Satuan Pendidikan NP B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from nilai_peserta_didik  where tenant_id in ('org_NP_a', 'org_NP_b');
        delete from penilaian            where tenant_id in ('org_NP_a', 'org_NP_b');
        delete from komponen_nilai       where tenant_id in ('org_NP_a', 'org_NP_b');
        delete from beban_mengajar       where tenant_id in ('org_NP_a', 'org_NP_b');
        delete from peserta_didik        where tenant_id in ('org_NP_a', 'org_NP_b');
        delete from rombongan_belajar    where tenant_id in ('org_NP_a', 'org_NP_b');
        delete from tingkat              where tenant_id in ('org_NP_a', 'org_NP_b');
        delete from tahun_ajaran         where tenant_id in ('org_NP_a', 'org_NP_b');
        delete from ptk                  where tenant_id in ('org_NP_a', 'org_NP_b');
      `);
      await seed.query(`delete from mata_pelajaran where kode like 'NP-MP-%';`);
      await seed.end();

      // 3. Clients: migrator (GLOBAL mata_pelajaran writes) + app_user (RLS).
      migDb = createDb(MIG_URL!).db;
      db = createDb(APP_URL!).db;

      // 4. GLOBAL mata_pelajaran (shared across all chains; SELECT-only for app).
      const [mpA] = await migDb
        .insert(schema.mataPelajaran)
        .values({ kode: `NP-MP-${seq()}`, nama: `Nilai Mapel Shared` })
        .returning();
      mpAId = mpA.id;

      // 5. Shared tenant-scoped FK parents in both tenants (one PTK + tingkat
      //    + tahun_ajaran + rombel per tenant). Seeded in parallel; reused by
      //    seedGradingChain across all cases. Each chain creates its own
      //    beban + komponen + penilaian + peserta_didik + nilai for isolation.
      const [aIds, bIds] = await Promise.all([
        withTenant(db, SEED_A, async (tx: Tx) => {
          const [p] = await tx
            .insert(schema.ptk)
            .values({ nama: "PTK NP A", jenis: "pendidik" })
            .returning();
          const [tk] = await tx
            .insert(schema.tingkat)
            .values({ nama: `Tingkat NP A ${seq()}`, urutan: seq() })
            .returning();
          const [ta] = await tx
            .insert(schema.tahunAjaran)
            .values({ nama: `TA NP A ${seq()}`, aktif: false })
            .returning();
          const [rb] = await tx
            .insert(schema.rombonganBelajar)
            .values({
              nama: `Rombel NP A ${seq()}`,
              tingkatId: tk.id,
              tahunAjaranId: ta.id,
            })
            .returning();
          return { ptkId: p.id, taId: ta.id, rombelId: rb.id };
        }),
        withTenant(db, SEED_B, async (tx: Tx) => {
          const [p] = await tx
            .insert(schema.ptk)
            .values({ nama: "PTK NP B", jenis: "pendidik" })
            .returning();
          const [tk] = await tx
            .insert(schema.tingkat)
            .values({ nama: `Tingkat NP B ${seq()}`, urutan: seq() })
            .returning();
          const [ta] = await tx
            .insert(schema.tahunAjaran)
            .values({ nama: `TA NP B ${seq()}`, aktif: false })
            .returning();
          const [rb] = await tx
            .insert(schema.rombonganBelajar)
            .values({
              nama: `Rombel NP B ${seq()}`,
              tingkatId: tk.id,
              tahunAjaranId: ta.id,
            })
            .returning();
          return { ptkId: p.id, taId: ta.id, rombelId: rb.id };
        }),
      ]);
      ptkAId = aIds.ptkId;
      taAId = aIds.taId;
      rombelAId = aIds.rombelId;
      ptkBId = bIds.ptkId;
      taBId = bIds.taId;
      rombelBId = bIds.rombelId;
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    /**
     * Seed a fresh grading chain under SEED_A: beban_mengajar + 2 komponen
     * (UTS bobot=40, Tugas bobot=60) + 2 penilaian per komponen (4 total) +
     * 2 peserta_didik. NO nilai rows — each case seeds its own to control the
     * AC#3 derivation inputs. The `tag` keeps every UNIQUE column distinct
     * across cases so parallel/order-independent runs never collide.
     */
    async function seedGradingChain(tag: string): Promise<{
      bebanId: string;
      uts: { komponenId: string; penilaian1Id: string; penilaian2Id: string };
      tugas: { komponenId: string; penilaian1Id: string; penilaian2Id: string };
      pd1Id: string;
      pd2Id: string;
    }> {
      return withTenant(db, SEED_A, async (tx: Tx) => {
        const [bb] = await tx
          .insert(schema.bebanMengajar)
          .values({
            ptkId: ptkAId,
            mataPelajaranId: mpAId,
            rombonganBelajarId: rombelAId,
            tahunAjaranId: taAId,
            semester: "ganjil",
          })
          .returning();
        const [uts] = await tx
          .insert(schema.komponenNilai)
          .values({ bebanMengajarId: bb.id, nama: `UTS ${tag}`, bobot: "40" })
          .returning();
        const [tugas] = await tx
          .insert(schema.komponenNilai)
          .values({ bebanMengajarId: bb.id, nama: `Tugas ${tag}`, bobot: "60" })
          .returning();
        const [uts1] = await tx
          .insert(schema.penilaian)
          .values({
            komponenNilaiId: uts.id,
            nama: `UTS-1 ${tag}`,
            tanggal: "2026-01-01",
          })
          .returning();
        const [uts2] = await tx
          .insert(schema.penilaian)
          .values({
            komponenNilaiId: uts.id,
            nama: `UTS-2 ${tag}`,
            tanggal: "2026-01-02",
          })
          .returning();
        const [tg1] = await tx
          .insert(schema.penilaian)
          .values({
            komponenNilaiId: tugas.id,
            nama: `Tugas-1 ${tag}`,
            tanggal: "2026-01-03",
          })
          .returning();
        const [tg2] = await tx
          .insert(schema.penilaian)
          .values({
            komponenNilaiId: tugas.id,
            nama: `Tugas-2 ${tag}`,
            tanggal: "2026-01-04",
          })
          .returning();
        const [pd1] = await tx
          .insert(schema.pesertaDidik)
          .values({
            nama: `PD1 ${tag}`,
            tanggalLahir: "2010-01-01",
            jenisKelamin: "L",
          })
          .returning();
        const [pd2] = await tx
          .insert(schema.pesertaDidik)
          .values({
            nama: `PD2 ${tag}`,
            tanggalLahir: "2010-01-02",
            jenisKelamin: "P",
          })
          .returning();
        return {
          bebanId: bb.id,
          uts: { komponenId: uts.id, penilaian1Id: uts1.id, penilaian2Id: uts2.id },
          tugas: { komponenId: tugas.id, penilaian1Id: tg1.id, penilaian2Id: tg2.id },
          pd1Id: pd1.id,
          pd2Id: pd2.id,
        };
      });
    }

    // 1. upsertNilai round-trips nilai + catatan; a second upsert on the same
    //    (penilaian, peserta_didik) key UPDATEs the row instead of duplicating.
    itOrSkip("upsertNilai round-trips nilai+catatan; second upsert updates (no duplicate)", async () => {
      const { uts, pd1Id } = await seedGradingChain("upsert");

      const created = await withTenant(db, SEED_A, (tx) =>
        upsertNilai(tx, {
          penilaianId: uts.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 85,
          catatan: "Bagus",
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.penilaianId).toBe(uts.penilaian1Id);
      expect(created.pesertaDidikId).toBe(pd1Id);
      // numeric column comes back as string; compare numerically.
      expect(Number(created.nilai)).toBe(85);
      expect(created.catatan).toBe("Bagus");

      // Second upsert on the same key → UPDATE, no duplicate.
      const updated = await withTenant(db, SEED_A, (tx) =>
        upsertNilai(tx, {
          penilaianId: uts.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 90,
          catatan: "Sangat bagus",
        })
      );

      expect(updated.id).toBe(created.id);
      expect(Number(updated.nilai)).toBe(90);
      expect(updated.catatan).toBe("Sangat bagus");

      // Exactly one row for this (penilaian, pd) — no duplicate leak.
      const list = await withTenant(db, SEED_A, (tx) =>
        listNilaiByPenilaian(tx, uts.penilaian1Id)
      );
      expect(list.filter((r) => r.pesertaDidikId === pd1Id)).toHaveLength(1);
    });

    // 2. listNilaiByPenilaian returns scores ONLY for the given penilaian.
    //    Nilai rows under other penilaian (even for the same student) must
    //    not appear.
    itOrSkip("listNilaiByPenilaian returns scores for that penilaian only", async () => {
      const { uts, tugas, pd1Id, pd2Id } = await seedGradingChain("list");

      await withTenant(db, SEED_A, (tx) =>
        upsertNilai(tx, {
          penilaianId: uts.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 80,
        })
      );
      await withTenant(db, SEED_A, (tx) =>
        upsertNilai(tx, {
          penilaianId: uts.penilaian1Id,
          pesertaDidikId: pd2Id,
          nilai: 70,
        })
      );
      // Decoy: same student, DIFFERENT penilaian — must not appear in the
      // uts.penilaian1Id listing.
      await withTenant(db, SEED_A, (tx) =>
        upsertNilai(tx, {
          penilaianId: tugas.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 60,
        })
      );

      const list = await withTenant(db, SEED_A, (tx) =>
        listNilaiByPenilaian(tx, uts.penilaian1Id)
      );

      // Both students have a row under uts.penilaian1Id.
      const pdIds = list.map((r) => r.pesertaDidikId);
      expect(pdIds).toContain(pd1Id);
      expect(pdIds).toContain(pd2Id);
      // Every row is for the requested penilaian.
      expect(list.every((r) => r.penilaianId === uts.penilaian1Id)).toBe(true);
      // Exactly 2 rows (the decoy on tugas.penilaian1Id is excluded).
      expect(list).toHaveLength(2);
    });

    // 3. hapusNilai: the row is gone (read by id returns nothing under RLS).
    itOrSkip("hapusNilai removes the row", async () => {
      const { uts, pd1Id } = await seedGradingChain("hapus");

      const created = await withTenant(db, SEED_A, (tx) =>
        upsertNilai(tx, {
          penilaianId: uts.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 75,
        })
      );

      await withTenant(db, SEED_A, (tx) => hapusNilai(tx, created.id));

      const rows = await withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.nilaiPesertaDidik)
          .where(eq(schema.nilaiPesertaDidik.id, created.id))
      );
      expect(rows).toHaveLength(0);
    });

    // 4. AC#3 main derivation: two components (UTS bobot 40, Tugas bobot 60),
    //    two penilaian per component, one student with nilai in all four.
    //      UTS avg = (80 + 90) / 2 = 85
    //      Tugas avg = (70 + 80) / 2 = 75
    //      Nilai Akhir = (85×40 + 75×60) / (40 + 60)
    //                  = (3400 + 4500) / 100 = 7900 / 100 = 79
    itOrSkip("getNilaiAkhir computes weighted avg of component averages (AC#3)", async () => {
      const { bebanId, uts, tugas, pd1Id } = await seedGradingChain("akhir");

      await withTenant(db, SEED_A, async (tx: Tx) => {
        await upsertNilai(tx, {
          penilaianId: uts.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 80,
        });
        await upsertNilai(tx, {
          penilaianId: uts.penilaian2Id,
          pesertaDidikId: pd1Id,
          nilai: 90,
        });
        await upsertNilai(tx, {
          penilaianId: tugas.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 70,
        });
        await upsertNilai(tx, {
          penilaianId: tugas.penilaian2Id,
          pesertaDidikId: pd1Id,
          nilai: 80,
        });
      });

      const hasil = await withTenant(db, SEED_A, (tx) =>
        getNilaiAkhir(tx, bebanId)
      );

      const pd1 = hasil.find((r) => r.pesertaDidikId === pd1Id);
      expect(pd1).toBeDefined();
      // (85×40 + 75×60) / 100 = 79
      expect(pd1!.nilaiAkhir).toBeCloseTo(79, 5);

      // Rincian exposes BOTH components with their bobot + avg (AC#3 auditable).
      expect(pd1!.rincian).toHaveLength(2);

      const utsRincian = pd1!.rincian.find(
        (r) => r.komponenNilaiId === uts.komponenId
      );
      expect(utsRincian).toBeDefined();
      expect(utsRincian!.nama).toContain("UTS");
      expect(utsRincian!.bobot).toBe(40);
      expect(utsRincian!.rataRata).toBeCloseTo(85, 5);

      const tugasRincian = pd1!.rincian.find(
        (r) => r.komponenNilaiId === tugas.komponenId
      );
      expect(tugasRincian).toBeDefined();
      expect(tugasRincian!.bobot).toBe(60);
      expect(tugasRincian!.rataRata).toBeCloseTo(75, 5);
    });

    // 5. AC#3 with NULL nilai (absent): student has nilai=80 in UTS only and
    //    a NULL nilai row in Tugas. The Tugas component is EXCLUDED from the
    //    weighted-average denominator, so:
    //      Nilai Akhir = (80 × 40) / 40 = 80
    //    The Tugas rincian entry still appears (student has a row there) with
    //    rataRata=null — auditable absence.
    itOrSkip("getNilaiAkhir excludes components with all-null nilai from the weighted avg", async () => {
      const { bebanId, uts, tugas, pd1Id } = await seedGradingChain("null");

      await withTenant(db, SEED_A, async (tx: Tx) => {
        await upsertNilai(tx, {
          penilaianId: uts.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 80,
        });
        // Absent: a row exists but nilai IS NULL.
        await upsertNilai(tx, {
          penilaianId: tugas.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: null,
        });
      });

      const hasil = await withTenant(db, SEED_A, (tx) =>
        getNilaiAkhir(tx, bebanId)
      );

      const pd1 = hasil.find((r) => r.pesertaDidikId === pd1Id);
      expect(pd1).toBeDefined();
      // (80×40) / 40 = 80 — Tugas excluded from denom.
      expect(pd1!.nilaiAkhir).toBeCloseTo(80, 5);

      // Tugas rincian: present (the student has a row), but avg=null.
      const tugasR = pd1!.rincian.find(
        (r) => r.komponenNilaiId === tugas.komponenId
      );
      expect(tugasR).toBeDefined();
      expect(tugasR!.rataRata).toBeNull();

      // UTS rincian: the contributing component.
      const utsR = pd1!.rincian.find((r) => r.komponenNilaiId === uts.komponenId);
      expect(utsR).toBeDefined();
      expect(utsR!.rataRata).toBeCloseTo(80, 5);
    });

    // 6. AC#3 with no nilai rows at all: the beban has komponen + penilaian
    //    but no nilai_peserta_didik rows. Returns [] — there is nothing to
    //    derive.
    itOrSkip("getNilaiAkhir returns [] when no nilai exists for the beban", async () => {
      const { bebanId } = await seedGradingChain("empty");

      const hasil = await withTenant(db, SEED_A, (tx) =>
        getNilaiAkhir(tx, bebanId)
      );
      expect(hasil).toEqual([]);
    });

    // 7. RLS isolation (§13): a full grading chain + nilai seeded in SEED_B is
    //    INVISIBLE to SEED_A. getNilaiAkhir(bBebanId) under SEED_A's tenant
    //    GUC returns [] — RLS hides SEED_B's komponen_nilai rows, so the
    //    derivation has no inputs.
    itOrSkip("getNilaiAkhir is tenant-isolated: SEED_A cannot see SEED_B's nilai", async () => {
      // Seed a complete grading chain + one nilai in SEED_B.
      const bBebanId = await withTenant(db, SEED_B, async (tx: Tx) => {
        const [bb] = await tx
          .insert(schema.bebanMengajar)
          .values({
            ptkId: ptkBId,
            mataPelajaranId: mpAId,
            rombonganBelajarId: rombelBId,
            tahunAjaranId: taBId,
            semester: "ganjil",
          })
          .returning();
        const [uts] = await tx
          .insert(schema.komponenNilai)
          .values({ bebanMengajarId: bb.id, nama: "UTS B", bobot: "100" })
          .returning();
        const [p1] = await tx
          .insert(schema.penilaian)
          .values({
            komponenNilaiId: uts.id,
            nama: "UTS-1 B",
            tanggal: "2026-01-01",
          })
          .returning();
        const [pd] = await tx
          .insert(schema.pesertaDidik)
          .values({
            nama: "PD B 1",
            tanggalLahir: "2010-01-01",
            jenisKelamin: "L",
          })
          .returning();
        await tx.insert(schema.nilaiPesertaDidik).values({
          penilaianId: p1.id,
          pesertaDidikId: pd.id,
          nilai: "99",
        });
        return bb.id;
      });

      // Sanity: SEED_B sees its own derivation.
      const bHasil = await withTenant(db, SEED_B, (tx) =>
        getNilaiAkhir(tx, bBebanId)
      );
      expect(bHasil).toHaveLength(1);
      expect(bHasil[0].nilaiAkhir).toBeCloseTo(99, 5);

      // Cross-tenant: SEED_A cannot derive SEED_B's nilai — komponen rows are
      // RLS-hidden under SEED_A's GUC, so the result is empty.
      const aHasil = await withTenant(db, SEED_A, (tx) =>
        getNilaiAkhir(tx, bBebanId)
      );
      expect(aHasil).toEqual([]);
    });

    // 8. pesertaDidikId filter: when the third arg is supplied, the query
    //    returns ONLY the rows for that student — over-fetch is eliminated for
    //    single-student callers (e.g. buatDrafEraportAction).
    itOrSkip("getNilaiAkhir(pesertaDidikId) returns only that student's derivation", async () => {
      const { bebanId, uts, tugas, pd1Id, pd2Id } =
        await seedGradingChain("filter");

      await withTenant(db, SEED_A, async (tx: Tx) => {
        await upsertNilai(tx, {
          penilaianId: uts.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 80,
        });
        await upsertNilai(tx, {
          penilaianId: tugas.penilaian1Id,
          pesertaDidikId: pd1Id,
          nilai: 90,
        });
        await upsertNilai(tx, {
          penilaianId: uts.penilaian1Id,
          pesertaDidikId: pd2Id,
          nilai: 60,
        });
        await upsertNilai(tx, {
          penilaianId: tugas.penilaian1Id,
          pesertaDidikId: pd2Id,
          nilai: 70,
        });
      });

      const filtered = await withTenant(db, SEED_A, (tx) =>
        getNilaiAkhir(tx, bebanId, pd1Id)
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].pesertaDidikId).toBe(pd1Id);

      const unfiltered = await withTenant(db, SEED_A, (tx) =>
        getNilaiAkhir(tx, bebanId)
      );
      expect(unfiltered).toHaveLength(2);
    });
  }
);
