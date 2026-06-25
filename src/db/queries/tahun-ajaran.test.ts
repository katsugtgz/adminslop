import path from "node:path";

import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import * as q from "./tahun-ajaran";

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

// Tenant seeds — PRIVATE to this file (org_TA_*). Distinct per tahun-ajaran
// test file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_TA_a";
const SEED_B = "org_TA_b";

describeOrSkip("tahun ajaran repository (#8, Wave 2 / T3)", () => {
  let db: Db;

  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(
      MIG_URL!,
      path.join(process.cwd(), "src/db/migrations")
    );

    // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear
    //    the tahun_ajaran layer scoped to these tenants so each run starts
    //    clean (superuser bypasses RLS). Reset semester_aktif on the SP rows
    //    so test 6 starts from a known-null state.
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_TA_a', 'Satuan Pendidikan TA A'),
        ('org_TA_b', 'Satuan Pendidikan TA B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from tahun_ajaran where tenant_id in ('org_TA_a', 'org_TA_b');
    `);
    await seed.query(`
      update satuan_pendidikan set semester_aktif = null
        where id in ('org_TA_a', 'org_TA_b');
    `);
    await seed.end();

    // 3. App client uses the non-superuser role — RLS enforced.
    db = createDb(APP_URL!).db;
  });

  // 1. buatTahunAjaran + listTahunAjaran round-trip.
  itOrSkip("creates a tahun_ajaran and lists it back", async () => {
    const created = await withTenant(db, SEED_A, (tx) =>
      q.buatTahunAjaran(tx, { nama: "2025/2026 round-trip" })
    );
    expect(created.tenantId).toBe(SEED_A);
    expect(created.nama).toBe("2025/2026 round-trip");
    expect(created.aktif).toBe(false);

    const list = await withTenant(db, SEED_A, (tx) => q.listTahunAjaran(tx));
    const found = list.find((r) => r.id === created.id);
    expect(found).toBeDefined();
    expect(found?.nama).toBe("2025/2026 round-trip");
    expect(found?.aktif).toBe(false);
  });

  // 2. cariTahunAjaranById found/not-found.
  itOrSkip("finds a tahun_ajaran by id; returns null when absent", async () => {
    const created = await withTenant(db, SEED_A, (tx) =>
      q.buatTahunAjaran(tx, { nama: "2024/2025 cari" })
    );

    const found = await withTenant(db, SEED_A, (tx) =>
      q.cariTahunAjaranById(tx, created.id)
    );
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.nama).toBe("2024/2025 cari");

    // not-found: a random UUID that does not exist
    const missing = await withTenant(db, SEED_A, (tx) =>
      q.cariTahunAjaranById(tx, "00000000-0000-0000-0000-000000000000")
    );
    expect(missing).toBeNull();
  });

  // 3. getTahunAjaranAktif null when none active.
  itOrSkip("getTahunAjaranAktif returns null when no row is aktif", async () => {
    // Plant an inactive row to prove the null is due to aktif=false, not an
    // empty table.
    await withTenant(db, SEED_A, (tx) =>
      q.buatTahunAjaran(tx, { nama: "2023/2024 inactive-aktif-test" })
    );

    const aktif = await withTenant(db, SEED_A, (tx) =>
      q.getTahunAjaranAktif(tx)
    );
    expect(aktif).toBeNull();
  });

  // 4. aktifkanTahunAjaran: atomic unset + set. Activating TA2 flips TA1
  //    aktif=false (AC — at most one aktif per tenant). getTahunAjaranAktif
  //    then returns TA2.
  itOrSkip("aktifkanTahunAjaran atomically flips the aktif flag", async () => {
    // Use distinct names so this test is independent of the round-trip seeds.
    const { ta1Id, ta2Id } = await withTenant(db, SEED_A, async (tx) => {
      const ta1 = await q.buatTahunAjaran(tx, { nama: "Aktif TA1" });
      const ta2 = await q.buatTahunAjaran(tx, { nama: "Aktif TA2" });
      return { ta1Id: ta1.id, ta2Id: ta2.id };
    });

    // activate TA1 -> TA1.aktif=true, TA2.aktif=false
    const activated1 = await withTenant(db, SEED_A, (tx) =>
      q.aktifkanTahunAjaran(tx, ta1Id)
    );
    expect(activated1.id).toBe(ta1Id);
    expect(activated1.aktif).toBe(true);

    const afterTa1 = await withTenant(db, SEED_A, (tx) =>
      q.listTahunAjaran(tx)
    );
    const ta1Row1 = afterTa1.find((r) => r.id === ta1Id);
    const ta2Row1 = afterTa1.find((r) => r.id === ta2Id);
    expect(ta1Row1?.aktif).toBe(true);
    expect(ta2Row1?.aktif).toBe(false);

    const aktifAfterTa1 = await withTenant(db, SEED_A, (tx) =>
      q.getTahunAjaranAktif(tx)
    );
    expect(aktifAfterTa1?.id).toBe(ta1Id);

    // activate TA2 -> TA1.aktif=false, TA2.aktif=true (atomic unset + set)
    const activated2 = await withTenant(db, SEED_A, (tx) =>
      q.aktifkanTahunAjaran(tx, ta2Id)
    );
    expect(activated2.id).toBe(ta2Id);
    expect(activated2.aktif).toBe(true);

    const afterTa2 = await withTenant(db, SEED_A, (tx) =>
      q.listTahunAjaran(tx)
    );
    const ta1Row2 = afterTa2.find((r) => r.id === ta1Id);
    const ta2Row2 = afterTa2.find((r) => r.id === ta2Id);
    expect(ta1Row2?.aktif).toBe(false);
    expect(ta2Row2?.aktif).toBe(true);

    const aktifAfterTa2 = await withTenant(db, SEED_A, (tx) =>
      q.getTahunAjaranAktif(tx)
    );
    expect(aktifAfterTa2?.id).toBe(ta2Id);
  });

  // 5. aktifkanTahunAjaran not-found throws.
  itOrSkip("aktifkanTahunAjaran throws when the id is absent", async () => {
    await expect(
      withTenant(db, SEED_A, (tx) =>
        q.aktifkanTahunAjaran(tx, "11111111-1111-1111-1111-111111111111")
      )
    ).rejects.toThrow("Tahun Ajaran tidak ditemukan");
  });

  // 6. getSemesterAktif / ubahSemesterAktif round-trip on satuan_pendidikan.
  itOrSkip("getSemesterAktif returns null when unset; ubahSemesterAktif flips it", async () => {
    // beforeAll reset semester_aktif to NULL for both seeds, so this is the
    // unset state.
    const unset = await withTenant(db, SEED_A, (tx) =>
      q.getSemesterAktif(tx)
    );
    expect(unset).toBeNull();

    await withTenant(db, SEED_A, (tx) =>
      q.ubahSemesterAktif(tx, { semester: "ganjil" })
    );
    const ganjil = await withTenant(db, SEED_A, (tx) => q.getSemesterAktif(tx));
    expect(ganjil).toBe("ganjil");

    await withTenant(db, SEED_A, (tx) =>
      q.ubahSemesterAktif(tx, { semester: "genap" })
    );
    const genap = await withTenant(db, SEED_A, (tx) => q.getSemesterAktif(tx));
    expect(genap).toBe("genap");
  });

  // 7. RLS isolation: TA in org_TA_a is invisible to listTahunAjaran in
  //    org_TA_b.
  itOrSkip("listTahunAjaran in tenant B does not see tenant A's rows (RLS)", async () => {
    const created = await withTenant(db, SEED_A, (tx) =>
      q.buatTahunAjaran(tx, { nama: "Isolasi TA A only" })
    );

    // Sanity: A can see its own row.
    const aList = await withTenant(db, SEED_A, (tx) => q.listTahunAjaran(tx));
    expect(aList.find((r) => r.id === created.id)).toBeDefined();

    // Cross-tenant: B's list filtered to the A-only id yields nothing.
    const bList = await withTenant(db, SEED_B, (tx) => q.listTahunAjaran(tx));
    expect(bList.find((r) => r.id === created.id)).toBeUndefined();
  });
});
