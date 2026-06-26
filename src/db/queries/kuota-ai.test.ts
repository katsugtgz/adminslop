import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";

import { getAtauBuatKuotaAi, getKuotaAi, tambahPemakaianKuota } from "./kuota-ai";

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

// Tenant seeds — PRIVATE to this file (org_KA_*). Distinct per kuota-ai repo
// test file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_KA_a";
const SEED_B = "org_KA_b";

// Monotonic counter for unique tahun_ajaran `nama` literals across cases.
// tahun_ajaran has UNIQUE (tenant, nama) so distinct names avoid cross-test
// collisions within a tenant.
let _seq = 0;
const seq = (): number => ++_seq;

let db: Db;

describeOrSkip(
  "kuota-ai repository (queries/kuota-ai.ts — #12 Wave 2 / T5)",
  () => {
    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear
      //    the kuota_ai layer + its FK parent (tahun_ajaran) in FK-safe order
      //    so each run starts clean (superuser bypasses RLS). Children first.
      //    tahun_ajaran carries per-tenant UNIQUE on nama, so it MUST be
      //    cleared or a re-run hits duplicate-key violations. Scoped to this
      //    file's tenants only.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_KA_a', 'Satuan Pendidikan KA A'),
          ('org_KA_b', 'Satuan Pendidikan KA B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from kuota_ai     where tenant_id in ('org_KA_a', 'org_KA_b');
        delete from tahun_ajaran where tenant_id in ('org_KA_a', 'org_KA_b');
      `);
      await seed.end();

      // 3. App client uses the non-superuser role — RLS enforced.
      db = createDb(APP_URL!).db;
    });

    /**
     * Seed a tahun_ajaran under `tenantId` with a unique `nama`. kuota_ai has
     * a composite UNIQUE on (tenant, tahun_ajaran, semester) so each test needs
     * its own TA (or semester) to avoid collisions.
     */
    async function seedTahunAjaran(tx: Tx, tenantId: string, tag: string) {
      const [ta] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: `TA ${tag} ${tenantId} ${seq()}`, aktif: false })
        .returning();
      return ta;
    }

    // 1. AC#5 getAtauBuatKuotaAi find branch: when a kuota already exists for
    //    (TA, semester), the second call returns the SAME info (no insert, no
    //    duplicate row). terpakai starts at 0; batas reflects the original
    //    insert.
    itOrSkip("getAtauBuatKuotaAi finds existing; does not insert a duplicate", async () => {
      const { taId, first, second } = await withTenant(db, SEED_A, async (tx) => {
        const ta = await seedTahunAjaran(tx, SEED_A, "find");

        // First call: create with a non-default batas.
        const first = await getAtauBuatKuotaAi(tx, ta.id, "ganjil", 50);
        expect(first.terpakai).toBe(0);
        expect(first.batas).toBe(50);
        expect(first.tersisa).toBe(50);

        // Second call: finds the existing row, returns identical info.
        const second = await getAtauBuatKuotaAi(tx, ta.id, "ganjil", 999);
        // batasDefault is IGNORED on the find branch (existing batas wins).
        expect(second.batas).toBe(50);
        expect(second.terpakai).toBe(0);
        expect(second.tersisa).toBe(50);
        return { taId: ta.id, first, second };
      });

      expect(second).toEqual(first);

      // Exactly ONE row for this (TA, semester) — the find branch did not
      // insert a duplicate.
      const rows = await withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.kuotaAi)
          .where(eq(schema.kuotaAi.tahunAjaranId, taId))
      );
      expect(rows).toHaveLength(1);
    });

    // 2. AC#5 getAtauBuatKuotaAi create branch: when no kuota exists, INSERT
    //    with batas=batasDefault ?? 100. terpakai=0 (schema default).
    itOrSkip("getAtauBuatKuotaAi creates with custom batas, then falls back to 100 default", async () => {
      const { customBatas, defaultBatas, undefBatas } = await withTenant(
        db,
        SEED_A,
        async (tx) => {
          // Custom batas.
          const ta1 = await seedTahunAjaran(tx, SEED_A, "create-custom");
          const customBatas = await getAtauBuatKuotaAi(tx, ta1.id, "ganjil", 25);
          expect(customBatas.batas).toBe(25);
          expect(customBatas.terpakai).toBe(0);
          expect(customBatas.tersisa).toBe(25);

          // Default batas (no arg) -> schema default 100.
          const ta2 = await seedTahunAjaran(tx, SEED_A, "create-default");
          const defaultBatas = await getAtauBuatKuotaAi(tx, ta2.id, "genap");
          expect(defaultBatas.batas).toBe(100);
          expect(defaultBatas.terpakai).toBe(0);
          expect(defaultBatas.tersisa).toBe(100);

          // Explicit undefined -> 100 as well (?? 100 fallback).
          const ta3 = await seedTahunAjaran(tx, SEED_A, "create-undef");
          const undefBatas = await getAtauBuatKuotaAi(
            tx,
            ta3.id,
            "ganjil",
            undefined
          );
          expect(undefBatas.batas).toBe(100);

          return { customBatas, defaultBatas, undefBatas };
        }
      );

      expect(customBatas.tersisa).toBe(25);
      expect(defaultBatas.tersisa).toBe(100);
      expect(undefBatas.tersisa).toBe(100);
    });

    // 3. AC#5 tambahPemakaianKuota: each call bumps terpakai by 1 and
    //    recomputes tersisa. Caller (action layer) is responsible for the
    //    `tersisa > 0` gate BEFORE calling — this fn does not enforce it.
    itOrSkip("tambahPemakaianKuota increments terpakai and decrements tersisa", async () => {
      const { taId, after3 } = await withTenant(
        db,
        SEED_A,
        async (tx) => {
          const ta = await seedTahunAjaran(tx, SEED_A, "inc");
          await getAtauBuatKuotaAi(tx, ta.id, "ganjil", 10); // batas=10

          const after1 = await tambahPemakaianKuota(tx, ta.id, "ganjil");
          expect(after1.terpakai).toBe(1);
          expect(after1.batas).toBe(10);
          expect(after1.tersisa).toBe(9);

          const after2 = await tambahPemakaianKuota(tx, ta.id, "ganjil");
          expect(after2.terpakai).toBe(2);
          expect(after2.tersisa).toBe(8);

          const after3 = await tambahPemakaianKuota(tx, ta.id, "ganjil");
          expect(after3.terpakai).toBe(3);
          expect(after3.tersisa).toBe(7);

          return { taId: ta.id, after1, after2, after3 };
        }
      );

      // Final state observable via getKuotaAi (separate read path).
      const final = await withTenant(db, SEED_A, (tx) =>
        getKuotaAi(tx, taId, "ganjil")
      );
      expect(final).not.toBeNull();
      expect(final!.terpakai).toBe(3);
      expect(final!.batas).toBe(10);
      expect(final!.tersisa).toBe(7);
      expect(after3).toEqual(final);
    });

    // 4. AC#5 repo does NOT enforce the budget gate: tambahPemakaianKuota
    //    will happily increment past `batas` if invoked. The action layer is
    //    responsible for checking `tersisa > 0` first. (Negative tersisa is
    //    observable — proves the repo is a dumb primitive.)
    itOrSkip("tambahPemakaianKuota does NOT enforce batas (action-layer gate)", async () => {
      const { overInfo } = await withTenant(db, SEED_A, async (tx) => {
        const ta = await seedTahunAjaran(tx, SEED_A, "over");
        await getAtauBuatKuotaAi(tx, ta.id, "ganjil", 1); // batas=1

        // First increment: terpakai=1, tersisa=0 (legal).
        const atLimit = await tambahPemakaianKuota(tx, ta.id, "ganjil");
        expect(atLimit.tersisa).toBe(0);

        // Second increment: repo does NOT reject — terpakai=2, tersisa=-1.
        // Action layer should have checked `tersisa > 0` before calling.
        const overInfo = await tambahPemakaianKuota(tx, ta.id, "ganjil");
        expect(overInfo.terpakai).toBe(2);
        expect(overInfo.tersisa).toBe(-1);
        return { overInfo };
      });
      expect(overInfo.tersisa).toBe(-1);
    });

    // 5. getKuotaAi returns null when no row exists (absence == absence; the
    //    action layer decides unlimited vs batas=0). tambahPemakaianKuota on a
    //    missing row throws (caller must getAtauBuatKuotaAi first).
    itOrSkip("getKuotaAi returns null when absent; tambahPemakaianKuota throws on missing", async () => {
      const ta = await withTenant(db, SEED_A, async (tx) =>
        seedTahunAjaran(tx, SEED_A, "missing")
      );

      const missing = await withTenant(db, SEED_A, (tx) =>
        getKuotaAi(tx, ta.id, "ganjil")
      );
      expect(missing).toBeNull();

      await expect(
        withTenant(db, SEED_A, (tx) => tambahPemakaianKuota(tx, ta.id, "ganjil"))
      ).rejects.toThrow(/tidak ditemukan/);
    });

    // 6. §13 RLS isolation: SEED_B cannot read SEED_A's kuota via getKuotaAi.
    //    Each tenant has its own rows (independent tahun_ajaran + kuota_ai).
    itOrSkip("kuota_ai is tenant-isolated: SEED_B cannot see SEED_A's kuota (RLS)", async () => {
      const { aTaId } = await withTenant(db, SEED_A, async (tx) => {
        const ta = await seedTahunAjaran(tx, SEED_A, "rls-a");
        await getAtauBuatKuotaAi(tx, ta.id, "ganjil", 100);
        // Bump once so the row has terpakai=1 (distinct from any default).
        await tambahPemakaianKuota(tx, ta.id, "ganjil");
        return { aTaId: ta.id };
      });

      // SEED_A sees terpakai=1.
      const aInfo = await withTenant(db, SEED_A, (tx) =>
        getKuotaAi(tx, aTaId, "ganjil")
      );
      expect(aInfo).not.toBeNull();
      expect(aInfo!.terpakai).toBe(1);

      // SEED_B cannot see SEED_A's kuota (RLS hides the row). Note: SEED_B
      // also can't see SEED_A's tahun_ajaran, so even the FK target is
      // invisible — getKuotaAi returns null.
      const bReadsA = await withTenant(db, SEED_B, (tx) =>
        getKuotaAi(tx, aTaId, "ganjil")
      );
      expect(bReadsA).toBeNull();

      // SEED_B's own (TA, semester) kuota is independent — creating one under
      // B does not collide with A's row and is invisible from A.
      const bOwn = await withTenant(db, SEED_B, async (tx) => {
        const ta = await seedTahunAjaran(tx, SEED_B, "rls-b");
        const info = await getAtauBuatKuotaAi(tx, ta.id, "ganjil", 5);
        return { taId: ta.id, info };
      });
      expect(bOwn.info.batas).toBe(5);
      expect(bOwn.info.terpakai).toBe(0);

      // A cannot see B's kuota either.
      const aReadsB = await withTenant(db, SEED_A, (tx) =>
        getKuotaAi(tx, bOwn.taId, "ganjil")
      );
      expect(aReadsB).toBeNull();

      // tambahPemakaianKuota from SEED_B on SEED_A's row throws (RLS hides it
      // -> zero rows updated -> repo throws "tidak ditemukan").
      await expect(
        withTenant(db, SEED_B, (tx) => tambahPemakaianKuota(tx, aTaId, "ganjil"))
      ).rejects.toThrow(/tidak ditemukan/);

      // SEED_A's terpakai is still 1 (B's increment was rejected).
      const aAfter = await withTenant(db, SEED_A, (tx) =>
        getKuotaAi(tx, aTaId, "ganjil")
      );
      expect(aAfter!.terpakai).toBe(1);
    });

    // 7. FK CASCADE: deleting tahun_ajaran removes its kuota_ai. Verified via
    //    getKuotaAi so the cascade is observed at the data-access layer.
    itOrSkip("cascades tahun_ajaran -> kuota_ai (FK CASCADE)", async () => {
      const { taId } = await withTenant(db, SEED_A, async (tx) => {
        const ta = await seedTahunAjaran(tx, SEED_A, "casc");
        await getAtauBuatKuotaAi(tx, ta.id, "ganjil", 10);
        return { taId: ta.id };
      });

      // Sanity: kuota exists before the delete.
      const before = await withTenant(db, SEED_A, (tx) =>
        getKuotaAi(tx, taId, "ganjil")
      );
      expect(before).not.toBeNull();

      await withTenant(db, SEED_A, async (tx) => {
        await tx
          .delete(schema.tahunAjaran)
          .where(eq(schema.tahunAjaran.id, taId));
      });

      // After cascade: kuota gone.
      const after = await withTenant(db, SEED_A, (tx) =>
        getKuotaAi(tx, taId, "ganjil")
      );
      expect(after).toBeNull();
    });
  }
);
