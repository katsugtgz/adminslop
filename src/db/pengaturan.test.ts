import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { catatAudit, createDb, withTenant, type Db } from "./client";
import { runMigrations } from "./migrate";
import * as schema from "./schema";
import { cleanupTestTenants } from "./test-cleanup";
import {
  getProfilDanPengaturan,
  updatePengaturanSatuanPendidikan,
  updateProfilSatuanPendidikan,
} from "./queries/satuan-pendidikan";

// Load .env (Node native; no-op if missing).
try {
  process.loadEnvFile?.();
} catch {
  /* rely on real environment */
}

const APP_URL = process.env.DATABASE_URL;
const MIG_URL = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
const ready = Boolean(APP_URL && MIG_URL);

const describeOrSkip = ready ? describe : describe.skip;

async function expectDbError(
  migUrl: string,
  sql: string,
  params: unknown[] = [],
): Promise<Error> {
  const pool = new pg.Pool({ connectionString: migUrl });
  try {
    await pool.query(sql, params);
    throw new Error(`expected statement to fail but it succeeded: ${sql}`);
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  } finally {
    await pool.end();
  }
}

/**
 * Real-Postgres integration test for issue #5. Locks the tenant-isolation
 * behaviour of Profil/Pengaturan end-to-end against the live DB + CHECK
 * constraints. Complements `queries/satuan-pendidikan.test.ts` (which is a
 * mocked unit test) and `rls.test.ts` (which proves the RLS spine on
 * `contoh_catatan` / `catatan_audit`).
 *
 * `satuan_pendidikan` is intentionally NOT RLS'd (its `id` IS the tenant
 * boundary), so isolation is enforced at the query layer via `where id = ?`.
 * `catatan_audit` IS RLS'd, so its isolation is enforced by Postgres itself.
 */
describeOrSkip("Profil/Pengaturan tenant isolation (#5, real DB)", () => {
  let db: Db;

  // Distinct seed values per tenant so any cross-tenant leakage is detectable.
  const SEED_A = {
    id: "org_A",
    nama: "SMP Negeri Alpha",
    npsn: "2010001",
    jenjang: "SMP",
  } as const;
  const SEED_B = {
    id: "org_B",
    nama: "SD Tunas Bangsa Beta",
    npsn: "1010002",
    jenjang: "SD",
  } as const;

  beforeAll(async () => {
    // 1. Migrate as superuser (idempotent — 0001 adds the #5 columns + CHECKs).
    await runMigrations(MIG_URL!, path.join(process.cwd(), "src/db/migrations"));

    // 2. Seed tenant registry with DISTINCT profil columns. UPSERT guarantees
    //    the full profil regardless of insert order vs. `rls.test.ts` (which
    //    seeds these ids with only `nama` via `on conflict do nothing`).
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(
      `
        insert into satuan_pendidikan (id, nama, npsn, jenjang) values
          ($1, $2, $3, $4),
          ($5, $6, $7, $8)
        on conflict (id) do update set
          nama    = excluded.nama,
          npsn    = excluded.npsn,
          jenjang = excluded.jenjang
      `,
      [
        SEED_A.id,
        SEED_A.nama,
        SEED_A.npsn,
        SEED_A.jenjang,
        SEED_B.id,
        SEED_B.nama,
        SEED_B.npsn,
        SEED_B.jenjang,
      ],
    );
    await seed.end();

    // 3. App client uses the non-superuser role (RLS enforced where applicable).
    db = createDb(APP_URL!).db;
  });

  afterAll(async () => {
    await cleanupTestTenants(MIG_URL!, [SEED_A.id, SEED_B.id]);
  });

  // --- 1. Profil read isolation -------------------------------------------

  it("getProfilDanPengaturan returns the requesting tenant's row, not another tenant's", async () => {
    const a = await getProfilDanPengaturan(db, SEED_A.id);
    const b = await getProfilDanPengaturan(db, SEED_B.id);

    expect(a).not.toBeNull();
    expect(a?.id).toBe(SEED_A.id);
    expect(a?.nama).toBe(SEED_A.nama);
    expect(a?.npsn).toBe(SEED_A.npsn);
    expect(a?.jenjang).toBe(SEED_A.jenjang);
    // Cross-tenant leakage check: A must NOT carry B's values.
    expect(a?.npsn).not.toBe(SEED_B.npsn);
    expect(a?.nama).not.toBe(SEED_B.nama);

    expect(b).not.toBeNull();
    expect(b?.id).toBe(SEED_B.id);
    expect(b?.nama).toBe(SEED_B.nama);
    expect(b?.npsn).toBe(SEED_B.npsn);
    expect(b?.jenjang).toBe(SEED_B.jenjang);
  });

  it("getProfilDanPengaturan returns null for an unknown tenant", async () => {
    const row = await getProfilDanPengaturan(db, "org_nonexistent");
    expect(row).toBeNull();
  });

  // --- 2. Profil update isolation -----------------------------------------

  it("updateProfilSatuanPendidikan only mutates the row matching tenantId", async () => {
    await updateProfilSatuanPendidikan(db, SEED_A.id, {
      nama: "SMP Baru Alpha",
      npsn: "2019999",
      jenjang: "SMP",
      alamat: "Jl. Merdeka 1",
      namaKepala: "Budi",
      logoUrl: "",
    });

    const a = await getProfilDanPengaturan(db, SEED_A.id);
    expect(a?.nama).toBe("SMP Baru Alpha");
    expect(a?.npsn).toBe("2019999");
    expect(a?.alamat).toBe("Jl. Merdeka 1");
    expect(a?.namaKepala).toBe("Budi");
    expect(a?.logoUrl).toBeNull(); // "" normalised to null

    // CRITICAL: org_B must be untouched by org_A's update.
    const b = await getProfilDanPengaturan(db, SEED_B.id);
    expect(b?.nama).toBe(SEED_B.nama);
    expect(b?.npsn).toBe(SEED_B.npsn);
    expect(b?.jenjang).toBe(SEED_B.jenjang);
  });

  // --- 3. Pengaturan update isolation -------------------------------------

  it("updatePengaturanSatuanPendidikan only mutates the row matching tenantId", async () => {
    await updatePengaturanSatuanPendidikan(db, SEED_A.id, {
      tahunAjaran: "2026/2027",
      semester: "ganjil",
      zonaWaktu: "Asia/Jakarta",
      cetakPaperSize: "f4",
      cetakTampilkanLogo: false,
      cetakTampilkanHeader: true,
    });

    const a = await getProfilDanPengaturan(db, SEED_A.id);
    expect(a?.tahunAjaranAktif).toBe("2026/2027");
    expect(a?.semesterAktif).toBe("ganjil");
    expect(a?.zonaWaktu).toBe("Asia/Jakarta");
    expect(a?.cetakPaperSize).toBe("f4");
    expect(a?.cetakTampilkanLogo).toBe(false);
    expect(a?.cetakTampilkanHeader).toBe(true);

    // org_B pengaturan must remain at schema defaults (never written here).
    const b = await getProfilDanPengaturan(db, SEED_B.id);
    expect(b?.tahunAjaranAktif).toBeNull();
    expect(b?.semesterAktif).toBeNull();
    expect(b?.zonaWaktu).toBe("Asia/Jakarta"); // NOT NULL default
    expect(b?.cetakPaperSize).toBe("a4"); // NOT NULL default
    expect(b?.cetakTampilkanLogo).toBe(true); // NOT NULL default
  });

  // --- 4. catatAudit RLS isolation ----------------------------------------
  //
  // We write under SEED_B (org_B) instead of org_A so we do NOT pollute
  // org_A's `catatan_audit` — `rls.test.ts` reads org_A audit unfiltered and
  // asserts aksi="buat_contoh" on audit[0]. Writing under org_B keeps that
  // sibling test deterministic across concurrent full-suite runs. The RLS
  // isolation property under test is identical: a row written under tenant X
  // is visible to X and invisible to Y.
  //
  // Read B's row in the SAME transaction as the write: a row written inside a
  // tx is visible to that tx, and other txns cannot affect this snapshot — so
  // this is race-free even when the full suite shares the DB. A's read is in a
  // separate tx and sees zero B rows because RLS blocks them.

  it("catatAudit under tenant B is visible to B and invisible to A (RLS)", async () => {
    const AUDIT_AKSI = "perbarui_profil_satuan_isolation_test";
    const AUDIT_TARGET = `satuan_pendidikan:${SEED_B.id}`;

    const bAudit = await withTenant(db, SEED_B.id, async (tx) => {
      await catatAudit(tx, {
        aktor: "user_B",
        aksi: AUDIT_AKSI,
        target: AUDIT_TARGET,
      });
      return tx
        .select()
        .from(schema.catatanAudit)
        .where(eq(schema.catatanAudit.aksi, AUDIT_AKSI));
    });
    expect(bAudit.length).toBeGreaterThanOrEqual(1);
    const written = bAudit[bAudit.length - 1];
    expect(written.aktor).toBe("user_B");
    expect(written.aksi).toBe(AUDIT_AKSI);
    expect(written.target).toBe(AUDIT_TARGET);
    expect(written.tenantId).toBe(SEED_B.id); // came from the session GUC

    // A cannot read B's audit rows — RLS blocks every org_B row from org_A.
    const aAudit = await withTenant(db, SEED_A.id, (tx) =>
      tx
        .select()
        .from(schema.catatanAudit)
        .where(eq(schema.catatanAudit.aksi, AUDIT_AKSI)),
    );
    expect(aAudit).toHaveLength(0);
  });

  // --- 5. CHECK constraints reject invalid values -------------------------

  it("CHECK constraint rejects invalid jenjang", async () => {
    const err = await expectDbError(
      MIG_URL!,
      "update satuan_pendidikan set jenjang = 'TK' where id = $1",
      [SEED_A.id],
    );
    expect(err.message.toLowerCase()).toContain("violates check constraint");
  });

  it("CHECK constraint rejects invalid semester_aktif", async () => {
    const err = await expectDbError(
      MIG_URL!,
      "update satuan_pendidikan set semester_aktif = 'Fall' where id = $1",
      [SEED_A.id],
    );
    expect(err.message.toLowerCase()).toContain("violates check constraint");
  });

  it("CHECK constraint rejects invalid cetak_paper_size", async () => {
    const err = await expectDbError(
      MIG_URL!,
      "update satuan_pendidikan set cetak_paper_size = 'Letter' where id = $1",
      [SEED_A.id],
    );
    expect(err.message.toLowerCase()).toContain("violates check constraint");
  });
});
