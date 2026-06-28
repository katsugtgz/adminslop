import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  getWaliKelasSaya,
  hapusWaliKelas,
  listWaliKelas,
  upsertWaliKelas,
} from "./wali-kelas";

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

// Tenant seeds — PRIVATE to this file (org_WK_*). Distinct per wali-kelas test
// file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_WK_a";
const SEED_B = "org_WK_b";

// Monotonic counters for unique literals across tests. tingkat has UNIQUE
// (tenant, urutan) and (tenant, nama); rombongan_belajar has UNIQUE
// (tenant, tahun_ajaran, nama). Distinct tags + monotonic urutan keep the
// per-tenant UNIQUE constraints satisfied across cases.
let _seq = 0;
const seq = (): number => ++_seq;

let db: Db;

describeOrSkip(
  "wali-kelas repository (queries/wali-kelas.ts — #10 Wave 2 / T4)",
  () => {
    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear
      //    the wali_kelas layer + its FK parents in FK-safe order so each run
      //    starts clean (superuser bypasses RLS). Children first. Parents
      //    (ptk/rombel/tingkat/TA) carry per-tenant UNIQUE constraints with
      //    stable per-case tags, so they MUST be cleared or a re-run hits
      //    duplicate-key violations. Scoped to this file's tenants only.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_WK_a', 'Satuan Pendidikan WK A'),
          ('org_WK_b', 'Satuan Pendidikan WK B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from wali_kelas         where tenant_id in ('org_WK_a', 'org_WK_b');
        delete from rombongan_belajar  where tenant_id in ('org_WK_a', 'org_WK_b');
        delete from tingkat            where tenant_id in ('org_WK_a', 'org_WK_b');
        delete from tahun_ajaran       where tenant_id in ('org_WK_a', 'org_WK_b');
        delete from ptk                where tenant_id in ('org_WK_a', 'org_WK_b');
      `);
      await seed.end();

      // 3. App client uses the non-superuser role — RLS enforced.
      db = createDb(APP_URL!).db;
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    /**
     * Seed the tenant-scoped FK parents for a wali under `tenantId`:
     * tahun_ajaran, tingkat, rombongan_belajar, two PTKs. Distinct `tag` +
     * monotonic urutan keep the per-tenant UNIQUE constraints satisfied
     * across cases. Returns both PTKs so AC#3 (re-assigning the wali) can be
     * exercised.
     */
    async function seedParents(tx: Tx, tenantId: string, tag: string) {
      const [ta] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: `TA ${tag}`, aktif: false })
        .returning();
      const [tk] = await tx
        .insert(schema.tingkat)
        .values({ nama: `Tingkat ${tag} ${tenantId}`, urutan: seq() + 2000 })
        .returning();
      const [rb] = await tx
        .insert(schema.rombonganBelajar)
        .values({ nama: `Rombel ${tag}`, tingkatId: tk.id, tahunAjaranId: ta.id })
        .returning();
      const [p1] = await tx
        .insert(schema.ptk)
        .values({ nama: `PTK ${tag} #1`, jenis: "pendidik" })
        .returning();
      const [p2] = await tx
        .insert(schema.ptk)
        .values({ nama: `PTK ${tag} #2`, jenis: "pendidik" })
        .returning();
      return { ta, tk, rb, p1, p2 };
    }

    // 1. AC#3 upsert: insert (ptk1, rombel, TA, sem) -> row created. Upsert
    //    again with ptk2 -> row UPDATED (ptk changed, same id). Assert only 1
    //    row for this rombel+period. Then upsert for a DIFFERENT semester ->
    //    NEW row (historical-across-periods: past-period rows persist).
    itOrSkip("upsertWaliKelas UPDATEs the wali for a period; different period appends (AC#3)", async () => {
      const { waliFirst, waliUpdated, rbId, taId, p1Id, p2Id } =
        await withTenant(db, SEED_A, async (tx) => {
          const { ta, rb, p1, p2 } = await seedParents(tx, SEED_A, "upsert");
          const waliFirst = await upsertWaliKelas(tx, {
            ptkId: p1.id,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
            dibuatOleh: "user_a",
          });
          // AC#3: same (rombel, TA, semester) but a different PTK -> UPDATE.
          const waliUpdated = await upsertWaliKelas(tx, {
            ptkId: p2.id,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
            dibuatOleh: "user_b",
          });
          return {
            waliFirst,
            waliUpdated,
            rbId: rb.id,
            taId: ta.id,
            p1Id: p1.id,
            p2Id: p2.id,
          };
        });

      // AC#3: the row was UPDATED in place — same id, ptk_id changed.
      expect(waliFirst.id).toBe(waliUpdated.id);
      expect(waliFirst.ptkId).toBe(p1Id);
      expect(waliUpdated.ptkId).toBe(p2Id);
      expect(waliFirst.dibuatOleh).toBe("user_a");
      expect(waliUpdated.dibuatOleh).toBe("user_b");
      expect(waliUpdated.rombonganBelajarId).toBe(rbId);
      expect(waliUpdated.tahunAjaranId).toBe(taId);
      expect(waliUpdated.semester).toBe("ganjil");
      expect(waliUpdated.dibuatPada).toBeTruthy();

      // AC#3 proof: exactly ONE row for this (rombel, TA, semester). The
      // upsert did not append — it replaced.
      const forPeriod = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, {
          rombonganBelajarId: rbId,
          tahunAjaranId: taId,
          semester: "ganjil",
        })
      );
      expect(forPeriod).toHaveLength(1);
      expect(forPeriod[0].id).toBe(waliUpdated.id);
      expect(forPeriod[0].ptkId).toBe(p2Id);

      // AC#3 historical-across-periods: upsert for a DIFFERENT semester on the
      // same rombel+TA -> NEW row, the ganjil row persists. Total 2 for this
      // rombel+TA (one per period).
      const waliGenap = await withTenant(db, SEED_A, (tx) =>
        upsertWaliKelas(tx, {
          ptkId: p1Id,
          rombonganBelajarId: rbId,
          tahunAjaranId: taId,
          semester: "genap",
        })
      );
      expect(waliGenap.id).not.toBe(waliUpdated.id);
      expect(waliGenap.semester).toBe("genap");

      const forRombelTa = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, { rombonganBelajarId: rbId, tahunAjaranId: taId })
      );
      expect(forRombelTa).toHaveLength(2);
      const semesters = forRombelTa.map((r) => r.semester).sort();
      expect(semesters).toEqual(["ganjil", "genap"]);
    });

    // 2. listWaliKelas: unfiltered returns all in tenant; filter by ptkId
    //    narrows to that PTK's assignments; filter by rombonganBelajarId
    //    narrows to that rombel's assignments.
    itOrSkip("listWaliKelas returns all + filters by ptkId and rombonganBelajarId", async () => {
      // Baseline so the test is order-independent of other cases.
      const allBefore = await withTenant(db, SEED_A, (tx) => listWaliKelas(tx));

      const { p1Id, p2Id, rb1Id, rb2Id, taId: _taId } = await withTenant(
        db,
        SEED_A,
        async (tx) => {
          const a = await seedParents(tx, SEED_A, "list-a");
          const b = await seedParents(tx, SEED_A, "list-b");
          // p1 is wali of rb1 (ganjil) and rb2 (ganjil); p2 is wali of rb2
          // (genap). So filtering by ptkId=p1 -> 2 rows; rb2 -> 2 rows
          // (ganjil under p1, genap under p2).
          await upsertWaliKelas(tx, {
            ptkId: a.p1.id,
            rombonganBelajarId: a.rb.id,
            tahunAjaranId: a.ta.id,
            semester: "ganjil",
          });
          await upsertWaliKelas(tx, {
            ptkId: b.p1.id,
            rombonganBelajarId: b.rb.id,
            tahunAjaranId: b.ta.id,
            semester: "ganjil",
          });
          await upsertWaliKelas(tx, {
            ptkId: b.p2.id,
            rombonganBelajarId: b.rb.id,
            tahunAjaranId: b.ta.id,
            semester: "genap",
          });
          return {
            p1Id: b.p1.id,
            p2Id: b.p2.id,
            rb1Id: a.rb.id,
            rb2Id: b.rb.id,
            taId: b.ta.id,
          };
        }
      );

      // Unfiltered grew by 3 (the three upserts above).
      const allAfter = await withTenant(db, SEED_A, (tx) => listWaliKelas(tx));
      expect(allAfter).toHaveLength(allBefore.length + 3);

      // Filter by ptkId = b.p1 -> exactly the one rombel b.p1 is wali of here
      // (rb2 ganjil). NOTE: a.p1 also exists but is a DIFFERENT uuid, so this
      // filter must not pick up a.p1's row.
      const byP1 = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, { ptkId: p1Id })
      );
      expect(byP1).toHaveLength(1);
      expect(byP1[0].rombonganBelajarId).toBe(rb2Id);
      expect(byP1[0].ptkId).toBe(p1Id);

      // Filter by rombonganBelajarId = rb2 -> 2 rows (ganjil under p1, genap
      // under p2). rb1 has exactly 1.
      const byRb2 = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, { rombonganBelajarId: rb2Id })
      );
      expect(byRb2).toHaveLength(2);
      expect(byRb2.map((r) => r.ptkId).sort()).toEqual(
        [p1Id, p2Id].sort()
      );

      const byRb1 = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, { rombonganBelajarId: rb1Id })
      );
      expect(byRb1).toHaveLength(1);

      // Combined filter (rombonganBelajarId + semester) narrows further.
      const rb2Genap = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, {
          rombonganBelajarId: rb2Id,
          semester: "genap",
        })
      );
      expect(rb2Genap).toHaveLength(1);
      expect(rb2Genap[0].ptkId).toBe(p2Id);

      // Ordering: dibuat_pada ASC.
      const created = byRb2.map((r) => r.dibuatPada.getTime());
      const sorted = [...created].sort((a, b) => a - b);
      expect(created).toEqual(sorted);
    });

    // 3. hapusWaliKelas: existing row is gone after the call.
    itOrSkip("hapusWaliKelas removes the row", async () => {
      const { waliId, rbId, taId } = await withTenant(db, SEED_A, async (tx) => {
        const { ta, rb, p1 } = await seedParents(tx, SEED_A, "hapus");
        const w = await upsertWaliKelas(tx, {
          ptkId: p1.id,
          rombonganBelajarId: rb.id,
          tahunAjaranId: ta.id,
          semester: "ganjil",
        });
        return { waliId: w.id, rbId: rb.id, taId: ta.id };
      });

      // Row exists before.
      const before = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, {
          rombonganBelajarId: rbId,
          tahunAjaranId: taId,
          semester: "ganjil",
        })
      );
      expect(before.find((r) => r.id === waliId)).toBeDefined();

      await withTenant(db, SEED_A, (tx) => hapusWaliKelas(tx, waliId));

      // Row gone after.
      const after = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, {
          rombonganBelajarId: rbId,
          tahunAjaranId: taId,
          semester: "ganjil",
        })
      );
      expect(after.find((r) => r.id === waliId)).toBeUndefined();
    });

    // 4. getWaliKelasSaya (AC#4 guru context): returns only this PTK's wali
    //    assignments for the given (TA, semester). Other PTKs' rows and other
    //    periods' rows are excluded. All reads run inside withTenant so the
    //    session GUC scopes RLS to SEED_A.
    itOrSkip("getWaliKelasSaya returns only this PTK's assignments for the period (AC#4)", async () => {
      const { p1Id, p2Id, rb1Id, rb2Id, taId, otherTaId } = await withTenant(
        db,
        SEED_A,
        async (tx) => {
          const a = await seedParents(tx, SEED_A, "saya-a");
          const b = await seedParents(tx, SEED_A, "saya-b");
          // Final assignment state (AC#3 upsert semantics):
          //   a.rb / a.ta / ganjil -> a.p1
          //   b.rb / b.ta / ganjil -> a.p1  (upsert overwrote b.p1)
          //   a.rb / a.ta / genap  -> a.p2
          await upsertWaliKelas(tx, {
            ptkId: a.p1.id,
            rombonganBelajarId: a.rb.id,
            tahunAjaranId: a.ta.id,
            semester: "ganjil",
          });
          await upsertWaliKelas(tx, {
            ptkId: b.p1.id,
            rombonganBelajarId: b.rb.id,
            tahunAjaranId: b.ta.id,
            semester: "ganjil",
          });
          // a.p1 is ALSO wali of b.rb in b.ta (a different TA) -> historical,
          // must not bleed into the a.ta query.
          await upsertWaliKelas(tx, {
            ptkId: a.p1.id,
            rombonganBelajarId: b.rb.id,
            tahunAjaranId: b.ta.id,
            semester: "ganjil",
          });
          // a.p2 (different PTK) is wali of a.rb in a.ta/genap -> different
          // period, must not appear in p1's ganjil query.
          await upsertWaliKelas(tx, {
            ptkId: a.p2.id,
            rombonganBelajarId: a.rb.id,
            tahunAjaranId: a.ta.id,
            semester: "genap",
          });
          return {
            p1Id: a.p1.id,
            p2Id: a.p2.id,
            rb1Id: a.rb.id,
            rb2Id: b.rb.id,
            taId: a.ta.id,
            otherTaId: b.ta.id,
          };
        }
      );

      // AC#4: p1's assignments for (taId, ganjil) -> exactly 1 (rb1). The
      // rb2/otherTa row and the rb1/genap row are excluded.
      const mine = await withTenant(db, SEED_A, (tx) =>
        getWaliKelasSaya(tx, p1Id, taId, "ganjil")
      );
      expect(mine).toHaveLength(1);
      expect(mine[0].ptkId).toBe(p1Id);
      expect(mine[0].tahunAjaranId).toBe(taId);
      expect(mine[0].semester).toBe("ganjil");
      expect(mine[0].rombonganBelajarId).toBe(rb1Id);

      // p1 also has an assignment in the OTHER TA -> that one shows up under
      // the other TA's query, not here.
      const mineOtherTa = await withTenant(db, SEED_A, (tx) =>
        getWaliKelasSaya(tx, p1Id, otherTaId, "ganjil")
      );
      expect(mineOtherTa).toHaveLength(1);
      expect(mineOtherTa[0].rombonganBelajarId).toBe(rb2Id);

      // p2's only assignment is rb1/genap — querying p2 for ganjil yields [].
      const p2Ganjil = await withTenant(db, SEED_A, (tx) =>
        getWaliKelasSaya(tx, p2Id, taId, "ganjil")
      );
      expect(p2Ganjil).toEqual([]);

      const p2Genap = await withTenant(db, SEED_A, (tx) =>
        getWaliKelasSaya(tx, p2Id, taId, "genap")
      );
      expect(p2Genap).toHaveLength(1);
      expect(p2Genap[0].rombonganBelajarId).toBe(rb1Id);

      // Unknown PTK yields [].
      const unknown = await withTenant(db, SEED_A, (tx) =>
        getWaliKelasSaya(tx, "00000000-0000-0000-0000-000000000000", taId, "ganjil")
      );
      expect(unknown).toEqual([]);
    });

    // 5. RLS isolation (§13): a wali_kelas created in SEED_A is NOT visible
    //    via listWaliKelas from SEED_B (which is empty in this file).
    itOrSkip("listWaliKelas is tenant-isolated: SEED_B cannot see SEED_A's wali (RLS)", async () => {
      const { waliId } = await withTenant(db, SEED_A, async (tx) => {
        const { ta, rb, p1 } = await seedParents(tx, SEED_A, "rls");
        const w = await upsertWaliKelas(tx, {
          ptkId: p1.id,
          rombonganBelajarId: rb.id,
          tahunAjaranId: ta.id,
          semester: "ganjil",
        });
        return { waliId: w.id };
      });

      // §13: SEED_B sees nothing — RLS hides SEED_A's rows. SEED_B was never
      // written to in this file, so it is empty.
      const bList = await withTenant(db, SEED_B, (tx) => listWaliKelas(tx));
      expect(bList).toEqual([]);
      expect(bList.find((r) => r.id === waliId)).toBeUndefined();

      // Sanity: SEED_A itself CAN see its own row (proves the insert worked
      // and the empty read from B is due to RLS, not a failed insert).
      const aList = await withTenant(db, SEED_A, (tx) => listWaliKelas(tx));
      expect(aList.find((r) => r.id === waliId)).toBeDefined();

      // RLS also gates updates: hapusWaliKelas from SEED_B is a silent no-op.
      await withTenant(db, SEED_B, (tx) => hapusWaliKelas(tx, waliId));
      const aListAfterBDelete = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx)
      );
      expect(aListAfterBDelete.find((r) => r.id === waliId)).toBeDefined();
    });

    // 6. FK CASCADE: deleting ptk removes its wali_kelas; deleting
    //    rombongan_belajar removes its wali_kelas. Verified through the repo
    //    (listWaliKelas) so the cascade is observed at the data-access layer.
    itOrSkip("cascades ptk -> wali, rombongan_belajar -> wali (FK CASCADE)", async () => {
      // Tree A: ptk -> wali cascade.
      const { ptkIdA, rbIdA: _rbIdA, taIdA: _taIdA } = await withTenant(db, SEED_A, async (tx) => {
        const { ta, rb, p1 } = await seedParents(tx, SEED_A, "casc-ptk");
        await upsertWaliKelas(tx, {
          ptkId: p1.id,
          rombonganBelajarId: rb.id,
          tahunAjaranId: ta.id,
          semester: "ganjil",
        });
        return { ptkIdA: p1.id, rbIdA: rb.id, taIdA: ta.id };
      });

      // Sanity: row exists before the delete.
      const beforeByPtk = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, { ptkId: ptkIdA })
      );
      expect(beforeByPtk).toHaveLength(1);

      await withTenant(db, SEED_A, async (tx) => {
        await tx.delete(schema.ptk).where(eq(schema.ptk.id, ptkIdA));
      });

      const afterByPtk = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, { ptkId: ptkIdA })
      );
      expect(afterByPtk).toEqual([]);

      // Tree B: rombongan_belajar -> wali cascade.
      const { ptkIdB, rbIdB, taIdB: _taIdB } = await withTenant(db, SEED_A, async (tx) => {
        const { ta, rb, p1 } = await seedParents(tx, SEED_A, "casc-rombel");
        await upsertWaliKelas(tx, {
          ptkId: p1.id,
          rombonganBelajarId: rb.id,
          tahunAjaranId: ta.id,
          semester: "ganjil",
        });
        return { ptkIdB: p1.id, rbIdB: rb.id, taIdB: ta.id };
      });

      const beforeByRombel = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, { rombonganBelajarId: rbIdB })
      );
      expect(beforeByRombel).toHaveLength(1);

      await withTenant(db, SEED_A, async (tx) => {
        await tx
          .delete(schema.rombonganBelajar)
          .where(eq(schema.rombonganBelajar.id, rbIdB));
      });

      const afterByRombel = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, { rombonganBelajarId: rbIdB })
      );
      expect(afterByRombel).toEqual([]);

      // The ptk itself survives the rombel delete (only the wali row cascaded).
      const ptkSurvives = await withTenant(db, SEED_A, (tx) =>
        listWaliKelas(tx, { ptkId: ptkIdB })
      );
      expect(ptkSurvives).toEqual([]);
    });
  }
);
