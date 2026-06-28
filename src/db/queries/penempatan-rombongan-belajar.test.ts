import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  getPenempatanByKonteks,
  listAnggotaRombonganBelajar,
  listPenempatanByPesertaDidik,
  tambahPenempatan,
  type InputPenempatan,
} from "./penempatan-rombongan-belajar";

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

// Tenant seeds — PRIVATE to this file (org_PEN_*). Distinct per
// penempatan-rombongan-belajar test file so parallel vitest runs cannot delete
// each other's seed rows: all beforeAll DELETEs are scoped to these tenant IDs
// only. SEED_A is the primary tenant (FK parents seeded there); SEED_B is used
// only for the RLS-isolation assertion (#5).
const SEED_A = "org_PEN_a";
const SEED_B = "org_PEN_b";

describeOrSkip(
  "penempatanRombonganBelajar repository (queries/penempatan-rombongan-belajar.ts — #8 Wave 2 T6)",
  () => {
    let db: Db;
    // Shared FK parents in SEED_A (seeded in beforeAll; reused across cases).
    let tingkatAId: string;
    let ta1Id: string;
    let ta2Id: string;
    let rombelAId: string;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT) and clear rombongan-belajar-layer
      //    rows in FK-safe order (children first, then parents) so each run
      //    starts clean (superuser bypasses RLS).
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_PEN_a', 'Satuan Pendidikan A'),
          ('org_PEN_b', 'Satuan Pendidikan B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from penempatan_rombongan_belajar where tenant_id in ('org_PEN_a', 'org_PEN_b');
        delete from rombongan_belajar where tenant_id in ('org_PEN_a', 'org_PEN_b');
        delete from tingkat where tenant_id in ('org_PEN_a', 'org_PEN_b');
        delete from tahun_ajaran where tenant_id in ('org_PEN_a', 'org_PEN_b');
        delete from peserta_didik where tenant_id in ('org_PEN_a', 'org_PEN_b');
      `);
      await seed.end();

      // 3. App client uses the non-superuser role — RLS enforced.
      db = createDb(APP_URL!).db;

      // 4. Seed FK parents in SEED_A: one tingkat, two tahun_ajaran, one
      //    rombongan_belajar. Rombel references tingkat + TA1.
      const [tingkat] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.tingkat)
          .values({ nama: "Kelas 1", urutan: 1 })
          .returning()
      );
      tingkatAId = tingkat.id;

      const [ta1, ta2] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.tahunAjaran)
          .values([
            { nama: "2024/2025", aktif: false },
            { nama: "2025/2026", aktif: true },
          ])
          .returning()
      );
      ta1Id = ta1.id;
      ta2Id = ta2.id;

      const [rombel] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.rombonganBelajar)
          .values({
            nama: "1A",
            tingkatId: tingkatAId,
            tahunAjaranId: ta1Id,
          })
          .returning()
      );
      rombelAId = rombel.id;
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    // Helper: mint a fresh peserta_didik in SEED_A so each case is isolated
    // from the others (no shared mutable state between cases).
    async function buatPesertaA(nama: string): Promise<string> {
      const [pd] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.pesertaDidik)
          .values({
            nama,
            tanggalLahir: "2014-01-01",
            jenisKelamin: "L",
          })
          .returning()
      );
      return pd.id;
    }

    // Helper: mint a fresh rombongan_belajar in SEED_A (for cases that need to
    // delete a rombel without disturbing the shared rombelAId).
    async function buatRombelA(nama: string): Promise<string> {
      const [rb] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.rombonganBelajar)
          .values({
            nama,
            tingkatId: tingkatAId,
            tahunAjaranId: ta1Id,
          })
          .returning()
      );
      return rb.id;
    }

    // 1. tambahPenempatan inserts and round-trips every field.
    itOrSkip("tambahPenempatan inserts and returns all fields", async () => {
      const pdId = await buatPesertaA("Andi Penempatan");
      const input: InputPenempatan = {
        pesertaDidikId: pdId,
        rombonganBelajarId: rombelAId,
        tahunAjaranId: ta1Id,
        semester: "ganjil",
        status: "aktif",
        catatan: "Penempatan awal",
        dibuatOleh: "user_t6_1",
      };

      const row = await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, input)
      );

      expect(row.id).toBeTruthy();
      expect(row.tenantId).toBe(SEED_A);
      expect(row.pesertaDidikId).toBe(pdId);
      expect(row.rombonganBelajarId).toBe(rombelAId);
      expect(row.tahunAjaranId).toBe(ta1Id);
      expect(row.semester).toBe("ganjil");
      expect(row.status).toBe("aktif");
      expect(row.catatan).toBe("Penempatan awal");
      expect(row.dibuatOleh).toBe("user_t6_1");
      expect(row.dibuatPada).toBeTruthy();
    });

    // 2. listPenempatanByPesertaDidik returns the student's full history in
    //    chronological order. Three placements across TA1/ganjil, TA1/genap,
    //    TA2/ganjil come back as 3 rows ordered by dibuat_pada ASC.
    itOrSkip("listPenempatanByPesertaDidik returns chronological history", async () => {
      const pdId = await buatPesertaA("Budi Riwayat");

      // Insert 3 placements across distinct (TA, semester) contexts in order.
      await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: ta1Id,
          semester: "ganjil",
          status: "aktif",
        })
      );
      await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: ta1Id,
          semester: "genap",
          status: "aktif",
        })
      );
      await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: ta2Id,
          semester: "ganjil",
          status: "naik",
        })
      );

      const list = await withTenant(db, SEED_A, (tx) =>
        listPenempatanByPesertaDidik(tx, pdId)
      );

      expect(list).toHaveLength(3);
      expect(list.every((p) => p.pesertaDidikId === pdId)).toBe(true);
      // Chronological (dibuat_pada ASC) → insertion order preserved.
      expect(list.map((p) => `${p.tahunAjaranId}/${p.semester}`)).toEqual([
        `${ta1Id}/ganjil`,
        `${ta1Id}/genap`,
        `${ta2Id}/ganjil`,
      ]);
      // The latest row carries the naik status from TA2/ganjil.
      expect(list[2].status).toBe("naik");
    });

    // 3. getPenempatanByKonteks (AC#4 derived-context): returns the placement
    //    matching the (pd, TA, semester) context; null when none exists for
    //    that context.
    itOrSkip("getPenempatanByKonteks resolves context placement (AC#4)", async () => {
      const pdId = await buatPesertaA("Cici Konteks");
      await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: ta1Id,
          semester: "ganjil",
          status: "aktif",
        })
      );

      // Existing context → the placement row.
      const found = await withTenant(db, SEED_A, (tx) =>
        getPenempatanByKonteks(tx, pdId, ta1Id, "ganjil")
      );
      expect(found).not.toBeNull();
      expect(found?.pesertaDidikId).toBe(pdId);
      expect(found?.tahunAjaranId).toBe(ta1Id);
      expect(found?.semester).toBe("ganjil");
      expect(found?.rombonganBelajarId).toBe(rombelAId);

      // Absent context (TA99 has no placement) → null. Pure query, no FK on
      // tahun_ajaran required for the null path — it simply matches no rows.
      const ta99 = "00000000-0000-0000-0000-000000000099";
      const missing = await withTenant(db, SEED_A, (tx) =>
        getPenempatanByKonteks(tx, pdId, ta99, "ganjil")
      );
      expect(missing).toBeNull();
    });

    // 4. listAnggotaRombonganBelajar: class roster — all students placed into a
    //    rombel for the given TA+semester context. Two different students in
    //    the same rombel+TA+semester → 2 rows.
    itOrSkip("listAnggotaRombonganBelajar returns the class roster", async () => {
      const pd1 = await buatPesertaA("Dewi Anggota 1");
      const pd2 = await buatPesertaA("Eka Anggota 2");
      await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, {
          pesertaDidikId: pd1,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: ta1Id,
          semester: "ganjil",
          status: "aktif",
        })
      );
      await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, {
          pesertaDidikId: pd2,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: ta1Id,
          semester: "ganjil",
          status: "aktif",
        })
      );

      const roster = await withTenant(db, SEED_A, (tx) =>
        listAnggotaRombonganBelajar(tx, rombelAId, ta1Id, "ganjil")
      );

      // Earlier cases in this run leave rows behind in this rombel+TA+sem, so
      // assert >= 2 and that both of ours are present (robust against
      // accumulation, not brittle on count).
      expect(roster.length).toBeGreaterThanOrEqual(2);
      const pdIds = roster.map((p) => p.pesertaDidikId);
      expect(pdIds).toContain(pd1);
      expect(pdIds).toContain(pd2);
      // Every row is in this exact rombel+TA+semester context.
      expect(
        roster.every(
          (p) =>
            p.rombonganBelajarId === rombelAId &&
            p.tahunAjaranId === ta1Id &&
            p.semester === "ganjil"
        )
      ).toBe(true);
    });

    // 5. RLS isolation (core §13): a placement in SEED_A is invisible from
    //    SEED_B — listPenempatanByPesertaDidik under SEED_B returns [].
    itOrSkip("listPenempatanByPesertaDidik is tenant-isolated: SEED_B cannot see SEED_A placements", async () => {
      const pdId = await buatPesertaA("Fajar RLS Iso");
      await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: ta1Id,
          semester: "ganjil",
          status: "aktif",
        })
      );

      // The placement exists under SEED_A.
      const aList = await withTenant(db, SEED_A, (tx) =>
        listPenempatanByPesertaDidik(tx, pdId)
      );
      expect(aList.find((p) => p.pesertaDidikId === pdId)).toBeDefined();

      // §13: querying SEED_A's pesertaDidikId from SEED_B must not leak the
      // placement. SEED_B has no placements, so it returns [].
      const bList = await withTenant(db, SEED_B, (tx) =>
        listPenempatanByPesertaDidik(tx, pdId)
      );
      expect(bList).toEqual([]);
    });

    // 6. FK CASCADE: deleting a parent peserta_didik removes its placements;
    //    deleting a parent rombongan_belajar removes placements placed into it.
    itOrSkip("deleting peserta_didik and rombongan_belajar cascades to placements", async () => {
      // 6a. peserta_didik cascade.
      const pdId = await buatPesertaA("Gita Cascade PD");
      await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: ta1Id,
          semester: "ganjil",
          status: "aktif",
        })
      );
      // Placement exists before the parent delete.
      let list = await withTenant(db, SEED_A, (tx) =>
        listPenempatanByPesertaDidik(tx, pdId)
      );
      expect(list).toHaveLength(1);

      // Delete the parent peserta_didik (own-tenant; RLS permits it).
      await withTenant(db, SEED_A, (tx) =>
        tx.delete(schema.pesertaDidik).where(eq(schema.pesertaDidik.id, pdId))
      );
      // CASCADE removed the child placement rows.
      list = await withTenant(db, SEED_A, (tx) =>
        listPenempatanByPesertaDidik(tx, pdId)
      );
      expect(list).toHaveLength(0);

      // 6b. rombongan_belajar cascade. Mint a dedicated rombel (so the shared
      //     rombelAId is not disturbed), place a fresh student into it, then
      //     delete the rombel.
      const rbId = await buatRombelA("1B-Cascade");
      const pdId2 = await buatPesertaA("Hadi Cascade RB");
      await withTenant(db, SEED_A, (tx) =>
        tambahPenempatan(tx, {
          pesertaDidikId: pdId2,
          rombonganBelajarId: rbId,
          tahunAjaranId: ta1Id,
          semester: "ganjil",
          status: "aktif",
        })
      );
      // Placement exists before the parent delete.
      let roster = await withTenant(db, SEED_A, (tx) =>
        listAnggotaRombonganBelajar(tx, rbId, ta1Id, "ganjil")
      );
      expect(roster.find((p) => p.pesertaDidikId === pdId2)).toBeDefined();

      // Delete the parent rombongan_belajar (own-tenant; RLS permits it).
      await withTenant(db, SEED_A, (tx) =>
        tx
          .delete(schema.rombonganBelajar)
          .where(eq(schema.rombonganBelajar.id, rbId))
      );
      // CASCADE removed the placement placed into that rombel.
      roster = await withTenant(db, SEED_A, (tx) =>
        listAnggotaRombonganBelajar(tx, rbId, ta1Id, "ganjil")
      );
      expect(roster.find((p) => p.pesertaDidikId === pdId2)).toBeUndefined();
    });
  }
);
