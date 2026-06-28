import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import { cleanupTestTenants } from "../test-cleanup";

import {
  batalkanPermintaanAi,
  buatPermintaanAi,
  cariPermintaanAiById,
  listPermintaanAi,
  ubahStatusPermintaanAi,
} from "./permintaan-ai";

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

// Tenant seeds — PRIVATE to this file (org_PA_*). Distinct per permintaan-ai
// repo test file so parallel vitest runs cannot delete each other's seed rows:
// all beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_PA_a";
const SEED_B = "org_PA_b";

let db: Db;

describeOrSkip(
  "permintaan-ai repository (queries/permintaan-ai.ts — #12 Wave 2 / T3)",
  () => {
    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear
      //    the AI layer in FK-safe order so each run starts clean (superuser
      //    bypasses RLS). Children first: draf_ai references permintaan_ai.
      //    Scoped to this file's tenants only — other files' seeds untouched.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_PA_a', 'Satuan Pendidikan PA A'),
          ('org_PA_b', 'Satuan Pendidikan PA B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from draf_ai       where tenant_id in ('org_PA_a', 'org_PA_b');
        delete from permintaan_ai where tenant_id in ('org_PA_a', 'org_PA_b');
      `);
      await seed.end();

      // 3. App client uses the non-superuser role — RLS enforced.
      db = createDb(APP_URL!).db;
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    // 1. buat -> cari -> list happy path: a new permintaan starts at 'dibuat'
    //    with all default fields populated. cariPermintaanAiById reads it
    //    back; listPermintaanAi returns it (newest first). konteks JSONB
    //    round-trips verbatim.
    itOrSkip("buatPermintaanAi creates a 'dibuat' row; cari + list read it back", async () => {
      const { row, id } = await withTenant(db, SEED_A, async (tx) => {
        const row = await buatPermintaanAi(tx, {
          jenis: "deskripsi_cp",
          konteks: { mapel: "Matematika", fase: "E", elemen: "bilangan" },
          dibuatOleh: "user_pa_crud",
        });
        return { row, id: row.id };
      });

      // Insert returned the full row with defaults applied.
      expect(row.tenantId).toBe(SEED_A);
      expect(row.id).toBe(id);
      expect(row.jenis).toBe("deskripsi_cp");
      expect(row.konteks).toEqual({
        mapel: "Matematika",
        fase: "E",
        elemen: "bilangan",
      });
      expect(row.status).toBe("dibuat");
      expect(row.pesanError).toBeNull();
      expect(row.permintaanTerkaitId).toBeNull();
      expect(row.dibuatOleh).toBe("user_pa_crud");
      expect(row.dibuatPada).toBeTruthy();
      expect(row.diprosesPada).toBeNull();
      expect(row.selesaiPada).toBeNull();

      // cariPermintaanAiById reads the row back inside the tenant.
      const found = await withTenant(db, SEED_A, (tx) =>
        cariPermintaanAiById(tx, id)
      );
      expect(found).not.toBeNull();
      expect(found!.id).toBe(id);
      expect(found!.konteks).toEqual(row.konteks);

      // Unknown id -> null (no throw).
      const missing = await withTenant(db, SEED_A, (tx) =>
        cariPermintaanAiById(tx, "00000000-0000-0000-0000-000000000000")
      );
      expect(missing).toBeNull();

      // listPermintaanAi (newest first) includes the new row.
      const list = await withTenant(db, SEED_A, (tx) => listPermintaanAi(tx));
      expect(list.find((r) => r.id === id)).toBeDefined();
      // Ordering: dibuatPada DESC.
      const created = list.map((r) => r.dibuatPada.getTime());
      const sorted = [...created].sort((a, b) => b - a);
      expect(created).toEqual(sorted);
    });

    // 2. AC#4 state machine happy path: dibuat -> diproses -> selesai.
    //    diprosesPada stamped on 'diproses'; selesaiPada stamped on 'selesai'.
    //    pesanError untouched throughout.
    itOrSkip("state machine dibuat -> diproses -> selesai stamps diprosesPada + selesaiPada", async () => {
      const { id, diprosesPada, selesaiPada } = await withTenant(
        db,
        SEED_A,
        async (tx) => {
          const created = await buatPermintaanAi(tx, {
            jenis: "deskripsi_tp",
            konteks: { mapel: "IPA" },
            dibuatOleh: "user_pa_sm_ok",
          });
          expect(created.diprosesPada).toBeNull();
          expect(created.selesaiPada).toBeNull();

          const processing = await ubahStatusPermintaanAi(
            tx,
            created.id,
            "diproses"
          );
          expect(processing.status).toBe("diproses");
          expect(processing.diprosesPada).not.toBeNull();
          expect(processing.selesaiPada).toBeNull();
          expect(processing.pesanError).toBeNull();

          const done = await ubahStatusPermintaanAi(tx, created.id, "selesai");
          expect(done.status).toBe("selesai");
          expect(done.diprosesPada).not.toBeNull();
          expect(done.selesaiPada).not.toBeNull();
          expect(done.pesanError).toBeNull();

          return {
            id: created.id,
            diprosesPada: processing.diprosesPada,
            selesaiPada: done.selesaiPada,
          };
        }
      );

      // Final state observable via cari.
      const final = await withTenant(db, SEED_A, (tx) =>
        cariPermintaanAiById(tx, id)
      );
      expect(final!.status).toBe("selesai");
      expect(final!.diprosesPada).toEqual(diprosesPada);
      expect(final!.selesaiPada).toEqual(selesaiPada);
    });

    // 3. AC#4 failure path: dibuat -> diproses -> gagal w/ pesanError.
    //    pesanError is set ONLY on the 'gagal' transition.
    itOrSkip("state machine -> gagal sets pesanError; other transitions leave it alone", async () => {
      const { id } = await withTenant(db, SEED_A, async (tx) => {
        const created = await buatPermintaanAi(tx, {
          jenis: "narasi_raport",
          konteks: { kelas: "7A" },
          dibuatOleh: "user_pa_sm_fail",
        });

        // Transition to diproses WITH a pesanError opt — must be IGNORED
        // (pesanError is only honored on 'gagal').
        const processing = await ubahStatusPermintaanAi(
          tx,
          created.id,
          "diproses",
          { pesanError: "should be ignored" }
        );
        expect(processing.pesanError).toBeNull();

        const failed = await ubahStatusPermintaanAi(tx, created.id, "gagal", {
          pesanError: "model timeout",
        });
        expect(failed.status).toBe("gagal");
        expect(failed.pesanError).toBe("model timeout");
        expect(failed.selesaiPada).not.toBeNull();

        return { id: created.id };
      });

      const final = await withTenant(db, SEED_A, (tx) =>
        cariPermintaanAiById(tx, id)
      );
      expect(final!.status).toBe("gagal");
      expect(final!.pesanError).toBe("model timeout");
    });

    // 4. AC#4 retry linkage: a retry is a NEW row carrying permintaanTerkaitId
    //    pointing at the prior (failed) attempt. Plus batalkanPermintaanAi
    //    convenience stamps selesaiPada and sets status='dibatalkan'.
    itOrSkip("retry carries permintaanTerkaitId; batalkanPermintaanAi sets 'dibatalkan'", async () => {
      const { retryId, originalId, cancelId } = await withTenant(
        db,
        SEED_A,
        async (tx) => {
          // Original attempt fails.
          const first = await buatPermintaanAi(tx, {
            jenis: "deskripsi_atp",
            konteks: { attempt: 1 },
            dibuatOleh: "user_pa_retry",
          });
          await ubahStatusPermintaanAi(tx, first.id, "gagal", {
            pesanError: "first failed",
          });

          // Retry links back to the original.
          const retry = await buatPermintaanAi(tx, {
            jenis: "deskripsi_atp",
            konteks: { attempt: 2 },
            dibuatOleh: "user_pa_retry",
            permintaanTerkaitId: first.id,
          });
          expect(retry.permintaanTerkaitId).toBe(first.id);

          // batalkanPermintaanAi is a convenience for 'dibatalkan'.
          const toCancel = await buatPermintaanAi(tx, {
            jenis: "deskripsi_cp",
            konteks: { will: "cancel" },
            dibuatOleh: "user_pa_retry",
          });
          const cancelled = await batalkanPermintaanAi(tx, toCancel.id);
          expect(cancelled.status).toBe("dibatalkan");
          expect(cancelled.selesaiPada).not.toBeNull();

          return {
            retryId: retry.id,
            originalId: first.id,
            cancelId: toCancel.id,
          };
        }
      );

      // Retry linkage observable via cari.
      const retry = await withTenant(db, SEED_A, (tx) =>
        cariPermintaanAiById(tx, retryId)
      );
      expect(retry!.permintaanTerkaitId).toBe(originalId);
      expect(retry!.status).toBe("dibuat");

      const cancelled = await withTenant(db, SEED_A, (tx) =>
        cariPermintaanAiById(tx, cancelId)
      );
      expect(cancelled!.status).toBe("dibatalkan");
    });

    // 5. listPermintaanAi filters: status + dibuatOleh narrow independently.
    //    Other tenants' rows are invisible (proven in case 6).
    itOrSkip("listPermintaanAi filters by status and dibuatOleh independently", async () => {
      const { userXId, userYId, doneX, processingY } = await withTenant(
        db,
        SEED_A,
        async (tx) => {
          const userXId = "user_pa_list_x";
          const userYId = "user_pa_list_y";

          const x1 = await buatPermintaanAi(tx, {
            jenis: "deskripsi_cp",
            konteks: {},
            dibuatOleh: userXId,
          });
          await ubahStatusPermintaanAi(tx, x1.id, "selesai");

          const y1 = await buatPermintaanAi(tx, {
            jenis: "deskripsi_tp",
            konteks: {},
            dibuatOleh: userYId,
          });
          await ubahStatusPermintaanAi(tx, y1.id, "diproses");

          return {
            userXId,
            userYId,
            doneX: x1.id,
            processingY: y1.id,
          };
        }
      );

      // Filter by status only.
      const done = await withTenant(db, SEED_A, (tx) =>
        listPermintaanAi(tx, { status: "selesai" })
      );
      expect(done.find((r) => r.id === doneX)).toBeDefined();
      expect(done.every((r) => r.status === "selesai")).toBe(true);
      expect(done.find((r) => r.id === processingY)).toBeUndefined();

      // Filter by dibuatOleh only.
      const byY = await withTenant(db, SEED_A, (tx) =>
        listPermintaanAi(tx, { dibuatOleh: userYId })
      );
      expect(byY.every((r) => r.dibuatOleh === userYId)).toBe(true);
      expect(byY.find((r) => r.id === processingY)).toBeDefined();
      expect(byY.find((r) => r.dibuatOleh === userXId)).toBeUndefined();

      // Combined filter narrows further.
      const both = await withTenant(db, SEED_A, (tx) =>
        listPermintaanAi(tx, { status: "diproses", dibuatOleh: userYId })
      );
      expect(both).toHaveLength(
        (await withTenant(db, SEED_A, (tx) =>
          listPermintaanAi(tx, { dibuatOleh: userYId })
        )).filter((r) => r.status === "diproses").length
      );
      expect(both.find((r) => r.id === processingY)).toBeDefined();
    });

    // 6. ubahStatusPermintaanAi on a missing id -> throws (no silent no-op).
    itOrSkip("ubahStatusPermintaanAi throws on missing id", async () => {
      await expect(
        withTenant(db, SEED_A, (tx) =>
          ubahStatusPermintaanAi(
            tx,
            "00000000-0000-0000-0000-000000000000",
            "diproses"
          )
        )
      ).rejects.toThrow(/tidak ditemukan/);
    });

    // 7. §13 RLS isolation: SEED_B cannot see SEED_A's permintaan by id or in
    //    its list. SEED_B's list is empty in this file (only SEED_A written).
    itOrSkip("permintaan_ai is tenant-isolated: SEED_B cannot see SEED_A's rows (RLS)", async () => {
      const { aId } = await withTenant(db, SEED_A, async (tx) => {
        const row = await buatPermintaanAi(tx, {
          jenis: "deskripsi_cp",
          konteks: { rls: true },
          dibuatOleh: "user_pa_rls",
        });
        return { aId: row.id };
      });

      // SEED_A can see its own row.
      const aFound = await withTenant(db, SEED_A, (tx) =>
        cariPermintaanAiById(tx, aId)
      );
      expect(aFound).not.toBeNull();
      expect(aFound!.id).toBe(aId);

      // SEED_B cannot see SEED_A's row by id.
      const bFound = await withTenant(db, SEED_B, (tx) =>
        cariPermintaanAiById(tx, aId)
      );
      expect(bFound).toBeNull();

      // SEED_B's list does not contain SEED_A's row. SEED_B was never written
      // to in this file so its list is empty — proving the empty read is due
      // to RLS, not a failed insert in SEED_A.
      const bList = await withTenant(db, SEED_B, (tx) => listPermintaanAi(tx));
      expect(bList).toEqual([]);
      expect(bList.find((r) => r.id === aId)).toBeUndefined();

      // RLS also gates writes: a status update from SEED_B is a no-op that
      // throws (zero rows returned).
      await expect(
        withTenant(db, SEED_B, (tx) =>
          ubahStatusPermintaanAi(tx, aId, "diproses")
        )
      ).rejects.toThrow(/tidak ditemukan/);

      // SEED_A's row is untouched after the rejected B update.
      const aAfter = await withTenant(db, SEED_A, (tx) =>
        cariPermintaanAiById(tx, aId)
      );
      expect(aAfter!.status).toBe("dibuat");
    });
  }
);
