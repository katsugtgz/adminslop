import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import { cleanupTestTenants } from "../test-cleanup";

import {
  buatTingkat,
  cariTingkatBerikutnya,
  cariTingkatById,
  listTingkat,
} from "./tingkat";

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

// Distinct tenant seeds (do NOT collide with akses.test.ts org_A/org_B).
// UPSERT so concurrent runs do not collide.
const SEED_TK_A = "org_TK_a";
const SEED_TK_B = "org_TK_b";

describeOrSkip("tingkat repository (queries/tingkat.ts — #8 Wave 2)", () => {
  let db: Db;

  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(MIG_URL!, path.join(process.cwd(), "src/db/migrations"));

    // 2. Seed tenant registry (UPSERT) and clear tingkat rows scoped to the
    //    two seeds so each run starts clean (superuser bypasses RLS).
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('${SEED_TK_A}', 'Satuan Pendidikan TK A'),
        ('${SEED_TK_B}', 'Satuan Pendidikan TK B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from tingkat where tenant_id in ('${SEED_TK_A}','${SEED_TK_B}');
    `);
    await seed.end();

    // 3. App client uses the non-superuser role — RLS enforced.
    db = createDb(APP_URL!).db;
  });

  afterAll(async () => {
    await cleanupTestTenants(MIG_URL!, [SEED_TK_A, SEED_TK_B]);
  });

  // 1. buatTingkat then listTingkat returns rows sorted by urutan ASC.
  itOrSkip("buatTingkat + listTingkat returns sorted by urutan ASC", async () => {
    // Insert out of order to prove ordering is by urutan, not insertion.
    const k1 = await withTenant(db, SEED_TK_A, (tx) =>
      buatTingkat(tx, { nama: "Kelas 1", urutan: 1 })
    );
    const k3 = await withTenant(db, SEED_TK_A, (tx) =>
      buatTingkat(tx, { nama: "Kelas 3", urutan: 3 })
    );
    const k2 = await withTenant(db, SEED_TK_A, (tx) =>
      buatTingkat(tx, { nama: "Kelas 2", urutan: 2 })
    );

    expect(k1.id).toBeTruthy();
    expect(k1.tenantId).toBe(SEED_TK_A);
    expect(k1.nama).toBe("Kelas 1");
    expect(k1.urutan).toBe(1);
    expect(k1.dibuatPada).toBeTruthy();

    const list = await withTenant(db, SEED_TK_A, (tx) => listTingkat(tx));
    expect(list.map((t) => t.nama)).toEqual(["Kelas 1", "Kelas 2", "Kelas 3"]);
    expect(list.map((t) => t.urutan)).toEqual([1, 2, 3]);
    // Sanity: all three created rows are present.
    expect(list.find((t) => t.id === k2.id)).toBeDefined();
    expect(list.find((t) => t.id === k3.id)).toBeDefined();
  });

  // 2. cariTingkatById returns the row when found, null when absent.
  itOrSkip("cariTingkatById returns the row when found, null when absent", async () => {
    const created = await withTenant(db, SEED_TK_A, (tx) =>
      buatTingkat(tx, { nama: "Kelas Cari", urutan: 10 })
    );

    const found = await withTenant(db, SEED_TK_A, (tx) =>
      cariTingkatById(tx, created.id)
    );
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.nama).toBe("Kelas Cari");
    expect(found?.urutan).toBe(10);

    const notFound = await withTenant(db, SEED_TK_A, (tx) =>
      cariTingkatById(tx, "00000000-0000-0000-0000-000000000000")
    );
    expect(notFound).toBeNull();
  });

  // 3. cariTingkatBerikutnya: the PROGRESSION primitive.
  itOrSkip("cariTingkatBerikutnya finds the next grade by urutan; null at top / above max", async () => {
    // Use a fresh tenant (B) so the progression chain is exactly 1→2→3.
    await withTenant(db, SEED_TK_B, async (tx) => {
      await buatTingkat(tx, { nama: "Kelas 1", urutan: 1 });
      await buatTingkat(tx, { nama: "Kelas 2", urutan: 2 });
      await buatTingkat(tx, { nama: "Kelas 3", urutan: 3 });
    });

    // urutan 1 → Kelas 2 (urutan 2)
    const nextOf1 = await withTenant(db, SEED_TK_B, (tx) =>
      cariTingkatBerikutnya(tx, 1)
    );
    expect(nextOf1).not.toBeNull();
    expect(nextOf1?.nama).toBe("Kelas 2");
    expect(nextOf1?.urutan).toBe(2);

    // urutan 2 → Kelas 3 (urutan 3)
    const nextOf2 = await withTenant(db, SEED_TK_B, (tx) =>
      cariTingkatBerikutnya(tx, 2)
    );
    expect(nextOf2).not.toBeNull();
    expect(nextOf2?.nama).toBe("Kelas 3");
    expect(nextOf2?.urutan).toBe(3);

    // urutan 3 (top grade) → null (no higher tingkat)
    const nextOf3 = await withTenant(db, SEED_TK_B, (tx) =>
      cariTingkatBerikutnya(tx, 3)
    );
    expect(nextOf3).toBeNull();

    // urutan 99 (above max) → null
    const nextOf99 = await withTenant(db, SEED_TK_B, (tx) =>
      cariTingkatBerikutnya(tx, 99)
    );
    expect(nextOf99).toBeNull();
  });

  // 4. RLS isolation: tingkat in tenant A is NOT visible from tenant B.
  itOrSkip("listTingkat is tenant-isolated: tenant B cannot see tenant A's tingkat", async () => {
    // A distinct marker urutan in tenant A.
    await withTenant(db, SEED_TK_A, (tx) =>
      buatTingkat(tx, { nama: "Kelas RLS Iso", urutan: 42 })
    );

    const bList = await withTenant(db, SEED_TK_B, (tx) => listTingkat(tx));
    // §13: A's tingkat must not leak to B.
    expect(bList.find((t) => t.nama === "Kelas RLS Iso")).toBeUndefined();
  });
});
