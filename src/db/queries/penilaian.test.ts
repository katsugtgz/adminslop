import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import { buatPenilaian, hapusPenilaian, listPenilaian, ubahPenilaian } from "./penilaian";

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

// Tenant seeds — PRIVATE to this file (org_PN2_*). Distinct per penilaian test
// file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_PN2_a";
const SEED_B = "org_PN2_b";

// Monotonic counter for unique tenant-scoped UNIQUE keys (tingkat urutan/nama,
// tahun_ajaran nama, rombel nama, komponen_nilai nama) + GLOBAL mata_pelajaran
// nama/kode. mata_pelajaran is GLOBAL (no tenant isolation) so distinct names
// avoid cross-test collisions.
let _seq = 0;
const seq = (): number => ++_seq;

describeOrSkip(
  "penilaian repository (queries/penilaian.ts — #11 Wave 2 / T4)",
  () => {
    // Insert/DELETE on GLOBAL mata_pelajaran run as the migrator superuser
    // (app_user has SELECT only — ADR 0001). Tenant-scoped writes use the app
    // client (`db`) inside `withTenant` so RLS is enforced.
    let migDb: Db;
    let db: Db;

    // Shared FK chain in SEED_A, seeded once in beforeAll and reused across
    // cases: mata_pelajaran -> ptk + ta + tingkat + rombel -> beban_mengajar.
    // Per-test komponen_nilai rows are created with unique nama to satisfy the
    // (tenant, beban, nama) UNIQUE constraint.
    let bebanAId: string;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear
      //    the penilaian layer + its FK parents in FK-safe order (children
      //    first) so each run starts clean (superuser bypasses RLS). Scoped to
      //    this file's tenants only — parallel test files use distinct
      //    tenants. The GLOBAL mata_pelajaran clear is scoped to this file's
      //    kode prefix (PN2-MP-*) and runs AFTER beban_mengajar so the ON
      //    DELETE RESTRICT FK cannot fire.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_PN2_a', 'Satuan Pendidikan PN2 A'),
          ('org_PN2_b', 'Satuan Pendidikan PN2 B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from nilai_peserta_didik where tenant_id in ('org_PN2_a', 'org_PN2_b');
        delete from penilaian         where tenant_id in ('org_PN2_a', 'org_PN2_b');
        delete from komponen_nilai    where tenant_id in ('org_PN2_a', 'org_PN2_b');
        delete from beban_mengajar    where tenant_id in ('org_PN2_a', 'org_PN2_b');
        delete from rombongan_belajar where tenant_id in ('org_PN2_a', 'org_PN2_b');
        delete from tingkat           where tenant_id in ('org_PN2_a', 'org_PN2_b');
        delete from tahun_ajaran      where tenant_id in ('org_PN2_a', 'org_PN2_b');
        delete from ptk               where tenant_id in ('org_PN2_a', 'org_PN2_b');
      `);
      await seed.query(`delete from mata_pelajaran where kode like 'PN2-MP-%';`);
      await seed.end();

      // 3. Clients: migrator (GLOBAL mata_pelajaran writes) + app_user (RLS).
      migDb = createDb(MIG_URL!).db;
      db = createDb(APP_URL!).db;

      // 4. Seed the shared FK chain komponen_nilai -> beban_mengajar in SEED_A
      //    (RLS-aware via app role). One beban reused across cases; per-test
      //    komponen_nilai rows get unique nama.
      const [mp] = await migDb
        .insert(schema.mataPelajaran)
        .values({
          kode: `PN2-MP-${seq()}`,
          nama: `Penilaian PN2 Mapel ${seq()}`,
        })
        .returning();

      bebanAId = await withTenant(db, SEED_A, async (tx: Tx) => {
        const [p] = await tx
          .insert(schema.ptk)
          .values({ nama: "PTK Shared PN2", jenis: "pendidik" })
          .returning();
        const [tk] = await tx
          .insert(schema.tingkat)
          .values({ nama: "Tingkat PN2 1", urutan: seq() })
          .returning();
        const [ta] = await tx
          .insert(schema.tahunAjaran)
          .values({ nama: `TA PN2 ${seq()}`, aktif: false })
          .returning();
        const [rb] = await tx
          .insert(schema.rombonganBelajar)
          .values({
            nama: `Rombel PN2 ${seq()}`,
            tingkatId: tk.id,
            tahunAjaranId: ta.id,
          })
          .returning();
        const [b] = await tx
          .insert(schema.bebanMengajar)
          .values({
            ptkId: p.id,
            mataPelajaranId: mp.id,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
          })
          .returning();
        return b.id;
      });
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    /** Seed a komponen_nilai under the shared beban with a unique nama. */
    async function seedKomponen(tag: string): Promise<string> {
      return withTenant(db, SEED_A, async (tx) => {
        const [k] = await tx
          .insert(schema.komponenNilai)
          .values({
            bebanMengajarId: bebanAId,
            nama: `Komponen PN2 ${tag} ${seq()}`,
            bobot: "50",
          })
          .returning();
        return k.id;
      });
    }

    // 1. buatPenilaian: insert referencing komponen_nilai, then assert nama +
    //    tanggal round-trip alongside the GUC-defaulted tenant_id and the
    //    DB-generated id/dibuatPada.
    itOrSkip("buatPenilaian round-trips nama and tanggal", async () => {
      const komponenId = await seedKomponen("buat");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatPenilaian(tx, {
          komponenNilaiId: komponenId,
          nama: "Tugas 1",
          tanggal: "2026-01-15",
          dibuatOleh: "user_a",
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.komponenNilaiId).toBe(komponenId);
      expect(created.nama).toBe("Tugas 1");
      expect(created.tanggal).toBe("2026-01-15");
      expect(created.dibuatOleh).toBe("user_a");
      expect(created.dibuatPada).toBeTruthy();
    });

    // 2. listPenilaian(komponenNilaiId): filter narrows to that component's
    //    assessments only; a sibling component's rows are excluded. Unfiltered
    //    returns all in tenant. Ordering is dibuatPada ASC.
    itOrSkip("listPenilaian(komponenNilaiId) returns only that component's assessments", async () => {
      const ka = await seedKomponen("list-a");
      const kb = await seedKomponen("list-b");

      // Baseline: a fresh component has no penilaian yet.
      const baseline = await withTenant(db, SEED_A, (tx) =>
        listPenilaian(tx, ka)
      );
      expect(baseline).toEqual([]);

      const a1 = await withTenant(db, SEED_A, (tx) =>
        buatPenilaian(tx, {
          komponenNilaiId: ka,
          nama: "Tugas A1",
          tanggal: "2026-02-01",
        })
      );
      const a2 = await withTenant(db, SEED_A, (tx) =>
        buatPenilaian(tx, {
          komponenNilaiId: ka,
          nama: "Tugas A2",
          tanggal: "2026-02-02",
        })
      );
      const b1 = await withTenant(db, SEED_A, (tx) =>
        buatPenilaian(tx, {
          komponenNilaiId: kb,
          nama: "Tugas B1",
          tanggal: "2026-02-03",
        })
      );

      // Filter by ka -> exactly a1 + a2.
      const byKa = await withTenant(db, SEED_A, (tx) =>
        listPenilaian(tx, ka)
      );
      expect(byKa).toHaveLength(2);
      expect(byKa.map((r) => r.id).sort()).toEqual([a1.id, a2.id].sort());
      expect(byKa.find((r) => r.id === b1.id)).toBeUndefined();

      // Filter by kb -> exactly b1.
      const byKb = await withTenant(db, SEED_A, (tx) =>
        listPenilaian(tx, kb)
      );
      expect(byKb).toHaveLength(1);
      expect(byKb[0].id).toBe(b1.id);

      // Unfiltered returns all in tenant (>= 3 from this case alone).
      const all = await withTenant(db, SEED_A, (tx) => listPenilaian(tx));
      expect(all.length).toBeGreaterThanOrEqual(3);

      // Ordering: dibutPada ASC.
      const ts = byKa.map((r) => r.dibuatPada.getTime());
      expect(ts).toEqual([...ts].sort((x, y) => x - y));
    });

    // 3. ubahPenilaian: update nama only; assert the changed field round-trips
    //    and id/tenantId/tanggal/komponenNilaiId stay stable.
    itOrSkip("ubahPenilaian updates nama", async () => {
      const komponenId = await seedKomponen("ubah");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatPenilaian(tx, {
          komponenNilaiId: komponenId,
          nama: "Ujian Awal",
          tanggal: "2026-03-01",
        })
      );

      const updated = await withTenant(db, SEED_A, (tx) =>
        ubahPenilaian(tx, created.id, { nama: "Ujian Tengah Semester" })
      );

      expect(updated.id).toBe(created.id);
      expect(updated.tenantId).toBe(SEED_A);
      expect(updated.nama).toBe("Ujian Tengah Semester");
      // Untouched fields stay put.
      expect(updated.tanggal).toBe("2026-03-01");
      expect(updated.komponenNilaiId).toBe(komponenId);
    });

    // 4. hapusPenilaian: buat then hapus; the row is gone (read by id returns
    //    nothing under RLS).
    itOrSkip("hapusPenilaian removes the row", async () => {
      const komponenId = await seedKomponen("hapus");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatPenilaian(tx, {
          komponenNilaiId: komponenId,
          nama: "Quiz Hapus",
          tanggal: "2026-04-01",
        })
      );

      await withTenant(db, SEED_A, (tx) => hapusPenilaian(tx, created.id));

      const rows = await withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.penilaian)
          .where(eq(schema.penilaian.id, created.id))
      );
      expect(rows).toHaveLength(0);
    });

    // 5. RLS isolation (§13): a penilaian created in SEED_A is NOT visible via
    //    listPenilaian from SEED_B (which is never written to in this file, so
    //    it is empty). RLS also gates deletes — hapusPenilaian from SEED_B is
    //    a silent no-op.
    itOrSkip("listPenilaian is tenant-isolated: SEED_B cannot see SEED_A's penilaian (RLS)", async () => {
      const komponenId = await seedKomponen("rls");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatPenilaian(tx, {
          komponenNilaiId: komponenId,
          nama: "Tugas RLS",
          tanggal: "2026-05-01",
        })
      );

      // Sanity: A can see its own row.
      const aList = await withTenant(db, SEED_A, (tx) => listPenilaian(tx));
      expect(aList.find((r) => r.id === created.id)).toBeDefined();

      // Cross-tenant: B sees nothing (RLS hides A's rows). SEED_B is never
      // written to in this file, so the list is empty.
      const bList = await withTenant(db, SEED_B, (tx) => listPenilaian(tx));
      expect(bList).toEqual([]);
      expect(bList.find((r) => r.id === created.id)).toBeUndefined();

      // RLS gates deletes too: hapus from B is a silent no-op; A still sees it.
      await withTenant(db, SEED_B, (tx) => hapusPenilaian(tx, created.id));
      const aListAfter = await withTenant(db, SEED_A, (tx) =>
        listPenilaian(tx)
      );
      expect(aListAfter.find((r) => r.id === created.id)).toBeDefined();
    });
  }
);
