import path from "node:path";

import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";

import {
  buatRombonganBelajar,
  cariAtauBuatRombonganBelajar,
  cariRombonganBelajarById,
  listRombonganBelajar,
} from "./rombongan-belajar";

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

// Tenant seeds — PRIVATE to this file (org_RB2_*). Distinct per rombongan-belajar
// test file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_RB2_a";
const SEED_B = "org_RB2_b";

// FK parents seeded into SEED_A so rombongan_belajar rows can reference them.
// Persisted once in beforeAll; the per-test RLS-scoped queries see them via
// the app role.
const TINGKAT_A_ID = "11111111-0000-0000-0000-000000000001";
const TINGKAT_B_ID = "11111111-0000-0000-0000-000000000002";
const TA_A_ID = "22222222-0000-0000-0000-000000000001";
const TA_B_ID = "22222222-0000-0000-0000-000000000002";

describeOrSkip(
  "rombongan-belajar repository (queries/rombongan-belajar.ts — #8 Wave 2 / T5)",
  () => {
    let db: Db;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT) and clear rombongan_belajar + FK
      //    parents in FK-safe order (children first) so each run starts clean.
      //    Scoped to this file's tenants only — parallel test files use
      //    distinct tenants. Superuser bypasses RLS.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_RB2_a', 'Satuan Pendidikan A'),
          ('org_RB2_b', 'Satuan Pendidikan B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      // Seed tingkat + tahun_ajaran FK parents into SEED_A. These are
      // referenced by every rombongan_belajar insert below.
      await seed.query(`
        insert into tingkat (id, tenant_id, nama, urutan) values
          ('${TINGKAT_A_ID}', 'org_RB2_a', 'Kelas 5', 5),
          ('${TINGKAT_B_ID}', 'org_RB2_a', 'Kelas 6', 6)
        on conflict (id) do update set nama = excluded.nama, urutan = excluded.urutan;
      `);
      await seed.query(`
        insert into tahun_ajaran (id, tenant_id, nama, aktif) values
          ('${TA_A_ID}', 'org_RB2_a', '2025/2026', false),
          ('${TA_B_ID}', 'org_RB2_a', '2026/2027', false)
        on conflict (id) do update set nama = excluded.nama, aktif = excluded.aktif;
      `);
      await seed.query(`
        delete from penempatan_rombongan_belajar where tenant_id in ('org_RB2_a', 'org_RB2_b');
        delete from rombongan_belajar where tenant_id in ('org_RB2_a', 'org_RB2_b');
        delete from tingkat where tenant_id in ('org_RB2_a', 'org_RB2_b');
        delete from tahun_ajaran where tenant_id in ('org_RB2_a', 'org_RB2_b');
      `);
      // Re-seed FK parents after the wipe (the deletes above clear them so the
      // test run starts with a clean baseline, but the FK parents must exist
      // for the rombongan_belajar inserts).
      await seed.query(`
        insert into tingkat (id, tenant_id, nama, urutan) values
          ('${TINGKAT_A_ID}', 'org_RB2_a', 'Kelas 5', 5),
          ('${TINGKAT_B_ID}', 'org_RB2_a', 'Kelas 6', 6)
        on conflict (id) do update set nama = excluded.nama, urutan = excluded.urutan;
      `);
      await seed.query(`
        insert into tahun_ajaran (id, tenant_id, nama, aktif) values
          ('${TA_A_ID}', 'org_RB2_a', '2025/2026', false),
          ('${TA_B_ID}', 'org_RB2_a', '2026/2027', false)
        on conflict (id) do update set nama = excluded.nama, aktif = excluded.aktif;
      `);
      await seed.end();

      // 3. App client uses the non-superuser role — RLS enforced.
      db = createDb(APP_URL!).db;
    });

    // 1. buatRombonganBelajar round-trip: insert referencing tingkat + TA, then
    //    read back via cariRombonganBelajarById. tenantId defaults from the GUC.
    itOrSkip("buatRombonganBelajar inserts and round-trips a rombel", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatRombonganBelajar(tx, {
          nama: "5A",
          tingkatId: TINGKAT_A_ID,
          tahunAjaranId: TA_A_ID,
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.nama).toBe("5A");
      expect(created.tingkatId).toBe(TINGKAT_A_ID);
      expect(created.tahunAjaranId).toBe(TA_A_ID);
      expect(created.dibuatPada).toBeTruthy();

      // Round-trip: read by id yields the same row.
      const found = await withTenant(db, SEED_A, (tx) =>
        cariRombonganBelajarById(tx, created.id)
      );
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.nama).toBe("5A");
    });

    // 2. listRombonganBelajar: unfiltered returns all in tenant; filtered by
    //    tahunAjaranId restricts to that TA. Ordering is nama ASC.
    itOrSkip("listRombonganBelajar returns all + filters by tahunAjaranId", async () => {
      // Baseline counts per TA so the test is order-independent of other cases.
      const allBefore = await withTenant(db, SEED_A, (tx) =>
        listRombonganBelajar(tx)
      );
      const taABefore = await withTenant(db, SEED_A, (tx) =>
        listRombonganBelajar(tx, TA_A_ID)
      );
      const taBBefore = await withTenant(db, SEED_A, (tx) =>
        listRombonganBelajar(tx, TA_B_ID)
      );

      // Insert one rombel in each TA with nama chosen so ASC ordering is
      // observable (B before Z).
      const inA = await withTenant(db, SEED_A, (tx) =>
        buatRombonganBelajar(tx, {
          nama: "Zeta TA-A",
          tingkatId: TINGKAT_A_ID,
          tahunAjaranId: TA_A_ID,
        })
      );
      const inB = await withTenant(db, SEED_A, (tx) =>
        buatRombonganBelajar(tx, {
          nama: "Alpha TA-B",
          tingkatId: TINGKAT_A_ID,
          tahunAjaranId: TA_B_ID,
        })
      );

      const allAfter = await withTenant(db, SEED_A, (tx) =>
        listRombonganBelajar(tx)
      );
      expect(allAfter).toHaveLength(allBefore.length + 2);
      expect(allAfter.find((r) => r.id === inA.id)).toBeDefined();
      expect(allAfter.find((r) => r.id === inB.id)).toBeDefined();

      // Filter by TA_A: only TA_A rows; the TA_B row must be absent.
      const taAAfter = await withTenant(db, SEED_A, (tx) =>
        listRombonganBelajar(tx, TA_A_ID)
      );
      expect(taAAfter).toHaveLength(taABefore.length + 1);
      expect(taAAfter.find((r) => r.id === inA.id)).toBeDefined();
      expect(taAAfter.find((r) => r.id === inB.id)).toBeUndefined();

      // Filter by TA_B: only TA_B rows.
      const taBAfter = await withTenant(db, SEED_A, (tx) =>
        listRombonganBelajar(tx, TA_B_ID)
      );
      expect(taBAfter).toHaveLength(taBBefore.length + 1);
      expect(taBAfter.find((r) => r.id === inB.id)).toBeDefined();
      expect(taBAfter.find((r) => r.id === inA.id)).toBeUndefined();

      // Ordering: nama ASC. The TA_B result includes 'Alpha TA-B' which must
      // sort ahead of any later-named sibling in the same TA. Verify the
      // returned array is sorted ascending by nama within TA_B.
      const namesTA_B = taBAfter.map((r) => r.nama);
      const sortedTA_B = [...namesTA_B].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
      );
      expect(namesTA_B).toEqual(sortedTA_B);
    });

    // 3. cariRombonganBelajarById: found within tenant; null for unknown id.
    itOrSkip("cariRombonganBelajarById returns null when not found", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatRombonganBelajar(tx, {
          nama: "5Cari",
          tingkatId: TINGKAT_A_ID,
          tahunAjaranId: TA_A_ID,
        })
      );

      const found = await withTenant(db, SEED_A, (tx) =>
        cariRombonganBelajarById(tx, created.id)
      );
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.nama).toBe("5Cari");

      // Unknown id returns null.
      const foundNone = await withTenant(db, SEED_A, (tx) =>
        cariRombonganBelajarById(tx, "00000000-0000-0000-0000-000000000000")
      );
      expect(foundNone).toBeNull();
    });

    // 4. cariAtauBuatRombonganBelajar: first call inserts + returns; second
    //    call with identical input returns the EXISTING row (no duplicate).
    //    Assert only 1 row matches the key.
    itOrSkip("cariAtauBuatRombonganBelajar is idempotent (find-or-create, no duplicate)", async () => {
      const input = {
        nama: "6FC",
        tingkatId: TINGKAT_B_ID,
        tahunAjaranId: TA_B_ID,
      };

      const first = await withTenant(db, SEED_A, (tx) =>
        cariAtauBuatRombonganBelajar(tx, input)
      );
      expect(first.id).toBeTruthy();
      expect(first.nama).toBe("6FC");
      expect(first.tingkatId).toBe(TINGKAT_B_ID);
      expect(first.tahunAjaranId).toBe(TA_B_ID);

      const second = await withTenant(db, SEED_A, (tx) =>
        cariAtauBuatRombonganBelajar(tx, input)
      );

      // Same row — find-or-create returned the EXISTING row unchanged.
      expect(second.id).toBe(first.id);
      expect(second.dibuatPada).toEqual(first.dibuatPada);

      // No duplicate: exactly one rombel matches this (nama, tingkat, TA) key
      // within the tenant.
      const matches = await withTenant(db, SEED_A, (tx) =>
        listRombonganBelajar(tx, TA_B_ID)
      );
      const keyed = matches.filter(
        (r) =>
          r.nama === input.nama &&
          r.tingkatId === input.tingkatId &&
          r.tahunAjaranId === input.tahunAjaranId
      );
      expect(keyed).toHaveLength(1);
    });

    // 5. RLS isolation (§13): a rombel created in SEED_A is NOT visible via
    //    listRombonganBelajar from SEED_B (which is empty in this file).
    itOrSkip("listRombonganBelajar is tenant-isolated: SEED_B cannot see SEED_A's rombels", async () => {
      await withTenant(db, SEED_A, (tx) =>
        buatRombonganBelajar(tx, {
          nama: "5RLS",
          tingkatId: TINGKAT_A_ID,
          tahunAjaranId: TA_A_ID,
        })
      );

      const bList = await withTenant(db, SEED_B, (tx) =>
        listRombonganBelajar(tx)
      );
      // §13: SEED_A's rows must not leak to SEED_B. SEED_B was never written to
      // in this file, so it is empty.
      expect(bList).toEqual([]);
    });
  }
);
