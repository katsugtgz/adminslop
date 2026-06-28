import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import { cleanupTestTenants } from "../test-cleanup";

import {
  buatPesertaDidik,
  cariPesertaDidikById,
  listPesertaDidik,
  listRiwayatStatus,
  ubahPesertaDidik,
  ubahStatus,
} from "./peserta-didik";

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

// Tenant seeds — PRIVATE to this file (org_pdC_*). Distinct per peserta-didik
// test file so parallel vitest runs cannot delete each other's seed rows:
// all beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_pdC_a";
const SEED_B = "org_pdC_b";

describeOrSkip("peserta-didik repository (queries/peserta-didik.ts — #7 Wave 2 / T3)", () => {
  let db: Db;

  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(MIG_URL!, path.join(process.cwd(), "src/db/migrations"));

    // 2. Seed tenant registry (UPSERT) and clear peserta-didik rows in
    //    FK-safe order (children first) so each run starts clean. Scoped to
    //    this file's tenants only — parallel peserta-didik test files use
    //    distinct tenants. Superuser bypasses RLS.
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_pdC_a', 'Satuan Pendidikan A'),
        ('org_pdC_b', 'Satuan Pendidikan B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from kontak_darurat where tenant_id in ('org_pdC_a', 'org_pdC_b');
      delete from wali_peserta_didik where tenant_id in ('org_pdC_a', 'org_pdC_b');
      delete from mutasi_peserta_didik where tenant_id in ('org_pdC_a', 'org_pdC_b');
      delete from riwayat_status_peserta_didik where tenant_id in ('org_pdC_a', 'org_pdC_b');
      delete from peserta_didik where tenant_id in ('org_pdC_a', 'org_pdC_b');
    `);
    await seed.end();

    // 3. App client uses the non-superuser role — RLS enforced.
    db = createDb(APP_URL!).db;
  });

  afterAll(async () => {
    await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
  });

  // 1. buatPesertaDidik creates a peserta_didik (status defaults to 'aktif')
  //    AND seeds the append-only history with an initial 'aktif' riwayat row,
  //    so the cache and the history agree from row one.
  itOrSkip("buatPesertaDidik inserts row + initial 'aktif' riwayat", async () => {
    const created = await withTenant(db, SEED_B, (tx) =>
      buatPesertaDidik(tx, {
        nama: "Andi Buat",
        nisn: "0012345601",
        tanggalLahir: "2012-04-10",
        jenisKelamin: "L",
      })
    );

    expect(created.id).toBeTruthy();
    expect(created.tenantId).toBe(SEED_B);
    expect(created.nama).toBe("Andi Buat");
    expect(created.nisn).toBe("0012345601");
    expect(created.nis).toBeNull();
    expect(created.tanggalLahir).toBe("2012-04-10");
    expect(created.jenisKelamin).toBe("L");
    expect(created.status).toBe("aktif");
    expect(created.dibuatPada).toBeTruthy();

    // History seeded with the initial 'aktif' row — never empty after create.
    const riwayat = await withTenant(db, SEED_B, (tx) =>
      listRiwayatStatus(tx, created.id)
    );
    expect(riwayat).toHaveLength(1);
    expect(riwayat[0].status).toBe("aktif");
    expect(riwayat[0].pesertaDidikId).toBe(created.id);
  });

  // 2. listPesertaDidik returns rows in the active tenant only. Insert 2 in
  //    SEED_B; both must be visible via listPesertaDidik under SEED_B.
  itOrSkip("listPesertaDidik returns inserted rows in the active tenant", async () => {
    const before = await withTenant(db, SEED_B, (tx) => listPesertaDidik(tx));
    const beforeCount = before.length;

    const a = await withTenant(db, SEED_B, (tx) =>
      buatPesertaDidik(tx, {
        nama: "Budi List A",
        tanggalLahir: "2011-01-01",
        jenisKelamin: "L",
      })
    );
    const b = await withTenant(db, SEED_B, (tx) =>
      buatPesertaDidik(tx, {
        nama: "Citra List B",
        tanggalLahir: "2013-02-02",
        jenisKelamin: "P",
      })
    );

    const after = await withTenant(db, SEED_B, (tx) => listPesertaDidik(tx));
    expect(after).toHaveLength(beforeCount + 2);
    expect(after.find((p) => p.id === a.id)).toBeDefined();
    expect(after.find((p) => p.id === b.id)).toBeDefined();
    expect(after.find((p) => p.id === a.id)?.nama).toBe("Budi List A");
  });

  // 3. cariPesertaDidikById returns the row within its tenant; null from a
  //    different tenant (RLS isolation).
  itOrSkip("cariPesertaDidikById is tenant-scoped (RLS)", async () => {
    const created = await withTenant(db, SEED_B, (tx) =>
      buatPesertaDidik(tx, {
        nama: "Dewi Cari",
        tanggalLahir: "2010-03-03",
        jenisKelamin: "P",
      })
    );

    const foundB = await withTenant(db, SEED_B, (tx) =>
      cariPesertaDidikById(tx, created.id)
    );
    expect(foundB).not.toBeNull();
    expect(foundB?.id).toBe(created.id);
    expect(foundB?.nama).toBe("Dewi Cari");

    // Cross-tenant: SEED_A cannot see SEED_B's row.
    const foundA = await withTenant(db, SEED_A, (tx) =>
      cariPesertaDidikById(tx, created.id)
    );
    expect(foundA).toBeNull();

    // Unknown id returns null.
    const foundNone = await withTenant(db, SEED_B, (tx) =>
      cariPesertaDidikById(tx, "00000000-0000-0000-0000-000000000000")
    );
    expect(foundNone).toBeNull();
  });

  // 4. ubahPesertaDidik (biodata ONLY): updates nama + tanggalLahir, leaves
  //    status untouched, and advances diperbaruiPada.
  itOrSkip("ubahPesertaDidik updates biodata without touching status", async () => {
    const created = await withTenant(db, SEED_B, (tx) =>
      buatPesertaDidik(tx, {
        nama: "Eko Ubah",
        tanggalLahir: "2009-05-05",
        jenisKelamin: "L",
      })
    );
    expect(created.status).toBe("aktif");
    const originalDiperbarui = created.diperbaruiPada;

    const updated = await withTenant(db, SEED_B, (tx) =>
      ubahPesertaDidik(tx, created.id, {
        nama: "Eko Diubah",
        tanggalLahir: "2010-06-06",
      })
    );

    expect(updated.id).toBe(created.id);
    expect(updated.nama).toBe("Eko Diubah");
    expect(updated.tanggalLahir).toBe("2010-06-06");
    // Untouched fields preserved.
    expect(updated.jenisKelamin).toBe("L");
    // status MUST be unchanged — biodata updates never touch the cache.
    expect(updated.status).toBe("aktif");
    // diperbaruiPada advanced (>= because now() is transaction-start-time and
    // the two calls run in separate transactions).
    expect(
      new Date(updated.diperbaruiPada).getTime() >=
        new Date(originalDiperbarui).getTime()
    ).toBe(true);

    // History still has exactly the initial 'aktif' row — biodata updates do
    // not append status history.
    const riwayat = await withTenant(db, SEED_B, (tx) =>
      listRiwayatStatus(tx, created.id)
    );
    expect(riwayat).toHaveLength(1);
    expect(riwayat[0].status).toBe("aktif");
  });

  // 5. ubahStatus (AC#2 — load-bearing): status cache is updated AND a new
  //    history row is APPENDED. Existing history is never deleted or replaced.
  itOrSkip("ubahStatus updates cache and APPENDS history (AC#2)", async () => {
    const created = await withTenant(db, SEED_B, (tx) =>
      buatPesertaDidik(tx, {
        nama: "Fajar Status",
        tanggalLahir: "2008-07-07",
        jenisKelamin: "L",
      })
    );

    // Initial state: cache 'aktif', history ['aktif'].
    expect(created.status).toBe("aktif");
    let riwayat = await withTenant(db, SEED_B, (tx) =>
      listRiwayatStatus(tx, created.id)
    );
    expect(riwayat).toHaveLength(1);

    const updated = await withTenant(db, SEED_B, (tx) =>
      ubahStatus(tx, created.id, {
        status: "pindah",
        catatan: "Pindah ke SD lain",
        dibuatOleh: "user_workos_fajar",
      })
    );

    // Cache updated.
    expect(updated.id).toBe(created.id);
    expect(updated.status).toBe("pindah");

    // History APPENDED (NOT replaced) — now 2 rows: ['aktif', 'pindah'].
    riwayat = await withTenant(db, SEED_B, (tx) =>
      listRiwayatStatus(tx, created.id)
    );
    expect(riwayat).toHaveLength(2);
    expect(riwayat.map((r) => r.status)).toEqual(["aktif", "pindah"]);
    // The appended row carries catatan + dibuatOleh.
    const pindahRow = riwayat.find((r) => r.status === "pindah");
    expect(pindahRow?.catatan).toBe("Pindah ke SD lain");
    expect(pindahRow?.dibuatOleh).toBe("user_workos_fajar");
  });

  // 6. ubahStatus on a missing / cross-tenant id throws (RLS makes cross-tenant
  //    update a 0-row no-op; the repo surfaces this as an Error).
  itOrSkip("ubahStatus throws when peserta_didik not found", async () => {
    await expect(
      withTenant(db, SEED_B, (tx) =>
        ubahStatus(tx, "00000000-0000-0000-0000-000000000000", {
          status: "lulus",
        })
      )
    ).rejects.toThrow("Peserta Didik tidak ditemukan");
  });

  // 7. ubahPesertaDidik on a missing / cross-tenant id throws.
  itOrSkip("ubahPesertaDidik throws when peserta_didik not found", async () => {
    await expect(
      withTenant(db, SEED_B, (tx) =>
        ubahPesertaDidik(tx, "00000000-0000-0000-0000-000000000000", {
          nama: "Tidak Ada",
        })
      )
    ).rejects.toThrow("Peserta Didik tidak ditemukan");
  });

  // 8. RLS isolation (core §13): a peserta_didik created in SEED_B is NOT
  //    visible via listPesertaDidik from SEED_A.
  itOrSkip("listPesertaDidik is tenant-isolated: SEED_A cannot see SEED_B's rows", async () => {
    await withTenant(db, SEED_B, (tx) =>
      buatPesertaDidik(tx, {
        nama: "Gita RLS Iso",
        tanggalLahir: "2014-08-08",
        jenisKelamin: "P",
      })
    );

    const aList = await withTenant(db, SEED_A, (tx) => listPesertaDidik(tx));
    // §13: SEED_B's rows must not leak to SEED_A. SEED_A was never written to
    // in this file, so it is empty.
    expect(aList).toEqual([]);
  });
});
