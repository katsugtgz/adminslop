import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  buatBebanMengajar,
  getBebanMengajarSaya,
  hapusBebanMengajar,
  listBebanMengajar,
  ubahBebanMengajar,
} from "./beban-mengajar";

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

// Tenant seeds — PRIVATE to this file (org_BM2_*). Distinct per beban-mengajar
// query test file (the schema-level beban-mengajar.test.ts uses org_BM_*) so
// parallel vitest runs cannot delete each other's seed rows: all beforeAll
// DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_BM2_a";
const SEED_B = "org_BM2_b";

// Monotonic counter for unique GLOBAL mata_pelajaran names + tenant-scoped
// UNIQUE keys (tingkat urutan/nama, tahun_ajaran nama, rombel nama). mata_
// pelajaran is GLOBAL (UNIQUE nama/kode, no tenant isolation) so distinct
// names avoid cross-test collisions.
let _seq = 0;
const seq = (): number => ++_seq;

describeOrSkip(
  "beban mengajar repository (queries/beban-mengajar.ts — #10 Wave 2 / T3)",
  () => {
    // Insert/DELETE on GLOBAL mata_pelajaran run as the migrator superuser
    // (app_user has SELECT only — ADR 0001). Tenant-scoped writes use the app
    // client (`db`) inside `withTenant` so RLS is enforced.
    let migDb: Db;
    let db: Db;

    // Shared FK parents in SEED_A (seeded in beforeAll; reused across cases).
    // Beban references ptk + mata_pelajaran + (rombongan_belajar XOR tingkat)
    // + tahun_ajaran. Seeding these once avoids per-case UNIQUE collisions on
    // tingkat/tahun_ajaran/rombel.
    let ptkAId: string;
    let tingkatAId: string;
    let taAId: string;
    let rombelAId: string;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT) and clear the beban-mengajar layer +
      //    its FK parents in FK-safe order (children first) so each run starts
      //    clean. Scoped to this file's tenants only — parallel test files use
      //    distinct tenants. Superuser bypasses RLS. The GLOBAL mata_pelajaran
      //    clear is scoped to this file's kode prefix (BM2-MP-*) and runs
      //    AFTER beban_mengajar so the ON DELETE RESTRICT FK cannot fire.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_BM2_a', 'Satuan Pendidikan BM2 A'),
          ('org_BM2_b', 'Satuan Pendidikan BM2 B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from beban_mengajar    where tenant_id in ('org_BM2_a', 'org_BM2_b');
        delete from rombongan_belajar where tenant_id in ('org_BM2_a', 'org_BM2_b');
        delete from tingkat           where tenant_id in ('org_BM2_a', 'org_BM2_b');
        delete from tahun_ajaran      where tenant_id in ('org_BM2_a', 'org_BM2_b');
        delete from ptk               where tenant_id in ('org_BM2_a', 'org_BM2_b');
      `);
      await seed.query(`delete from mata_pelajaran where kode like 'BM2-MP-%';`);
      await seed.end();

      // 3. Clients: migrator (GLOBAL mata_pelajaran writes) + app_user (RLS).
      migDb = createDb(MIG_URL!).db;
      db = createDb(APP_URL!).db;

      // 4. Seed shared FK parents in SEED_A (RLS-aware via app role). Stable
      //    per-run; reused across cases.
      const [ptkA, tingkatA, taA, rombelA] = await withTenant(
        db,
        SEED_A,
        async (tx: Tx) => {
          const [p] = await tx
            .insert(schema.ptk)
            .values({ nama: "PTK Shared BM2", jenis: "pendidik" })
            .returning();
          const [tk] = await tx
            .insert(schema.tingkat)
            .values({ nama: "Tingkat BM2 1", urutan: seq() })
            .returning();
          const [ta] = await tx
            .insert(schema.tahunAjaran)
            .values({ nama: `TA BM2 ${seq()}`, aktif: false })
            .returning();
          const [rb] = await tx
            .insert(schema.rombonganBelajar)
            .values({
              nama: `Rombel BM2 ${seq()}`,
              tingkatId: tk.id,
              tahunAjaranId: ta.id,
            })
            .returning();
          return [p, tk, ta, rb] as const;
        }
      );
      ptkAId = ptkA.id;
      tingkatAId = tingkatA.id;
      taAId = taA.id;
      rombelAId = rombelA.id;
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    /** Seed a GLOBAL mata_pelajaran with a unique nama (migDb — SELECT-only for app). */
    async function seedMataPelajaran(tag: string) {
      const [mp] = await migDb
        .insert(schema.mataPelajaran)
        .values({ kode: `BM2-MP-${seq()}`, nama: `Beban BM2 Mapel ${tag}` })
        .returning();
      return mp;
    }

    // 1. buatBebanMengajar with rombel target: insert referencing ptk +
    //    mata_pelajaran + rombongan_belajar + tahun_ajaran + semester (ganjil),
    //    then assert every field round-trips. tingkatId must be null.
    itOrSkip("buatBebanMengajar (rombel target) round-trips every field", async () => {
      const mp = await seedMataPelajaran("rombel");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkAId,
          mataPelajaranId: mp.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "ganjil",
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.ptkId).toBe(ptkAId);
      expect(created.mataPelajaranId).toBe(mp.id);
      expect(created.rombonganBelajarId).toBe(rombelAId);
      expect(created.tingkatId).toBeNull();
      expect(created.tahunAjaranId).toBe(taAId);
      expect(created.semester).toBe("ganjil");
      expect(created.dibuatPada).toBeTruthy();
    });

    // 2. buatBebanMengajar with tingkat target: same FK parents but tingkat
    //    instead of rombel (XOR satisfied the other way). rombonganBelajarId
    //    must be null.
    itOrSkip("buatBebanMengajar (tingkat target) round-trips every field", async () => {
      const mp = await seedMataPelajaran("tingkat");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkAId,
          mataPelajaranId: mp.id,
          tingkatId: tingkatAId,
          tahunAjaranId: taAId,
          semester: "genap",
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.ptkId).toBe(ptkAId);
      expect(created.mataPelajaranId).toBe(mp.id);
      expect(created.rombonganBelajarId).toBeNull();
      expect(created.tingkatId).toBe(tingkatAId);
      expect(created.tahunAjaranId).toBe(taAId);
      expect(created.semester).toBe("genap");
    });

    // 3. listBebanMengajar: unfiltered returns all; filter by ptkId restricts
    //    to that PTK; filter by tahunAjaranId+semester narrows further. Uses
    //    baseline+delta so the case is order-independent of sibling cases.
    itOrSkip("listBebanMengajar returns all, narrows by ptkId, narrows by ta+semester", async () => {
      // Seed a second PTK in SEED_A so the ptkId filter is observable.
      const [ptkOther] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.ptk)
          .values({ nama: "PTK Other BM2 list", jenis: "pendidik" })
          .returning()
      );

      const mpA = await seedMataPelajaran("list-a");
      const mpB = await seedMataPelajaran("list-b");
      const mpC = await seedMataPelajaran("list-c");

      // Baselines before the inserts so deltas are exact.
      const allBefore = await withTenant(db, SEED_A, (tx) =>
        listBebanMengajar(tx)
      );
      const byPtkBefore = await withTenant(db, SEED_A, (tx) =>
        listBebanMengajar(tx, { ptkId: ptkAId })
      );
      const byTaSemGanjilBefore = await withTenant(db, SEED_A, (tx) =>
        listBebanMengajar(tx, { tahunAjaranId: taAId, semester: "ganjil" })
      );
      const byTaSemGenapBefore = await withTenant(db, SEED_A, (tx) =>
        listBebanMengajar(tx, { tahunAjaranId: taAId, semester: "genap" })
      );

      // A: ptkA + ganjil; B: ptkA + genap; C: ptkOther + ganjil.
      const a = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkAId,
          mataPelajaranId: mpA.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "ganjil",
        })
      );
      const b = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkAId,
          mataPelajaranId: mpB.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "genap",
        })
      );
      const c = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkOther.id,
          mataPelajaranId: mpC.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "ganjil",
        })
      );

      // all: +3
      const allAfter = await withTenant(db, SEED_A, (tx) =>
        listBebanMengajar(tx)
      );
      expect(allAfter).toHaveLength(allBefore.length + 3);
      expect(allAfter.find((r) => r.id === a.id)).toBeDefined();
      expect(allAfter.find((r) => r.id === b.id)).toBeDefined();
      expect(allAfter.find((r) => r.id === c.id)).toBeDefined();

      // filter ptkId=ptkAId: +2 (A and B), excludes C
      const byPtkAfter = await withTenant(db, SEED_A, (tx) =>
        listBebanMengajar(tx, { ptkId: ptkAId })
      );
      expect(byPtkAfter).toHaveLength(byPtkBefore.length + 2);
      expect(byPtkAfter.find((r) => r.id === a.id)).toBeDefined();
      expect(byPtkAfter.find((r) => r.id === b.id)).toBeDefined();
      expect(byPtkAfter.find((r) => r.id === c.id)).toBeUndefined();

      // filter tahunAjaranId+semester=ganjil: +2 (A and C), excludes B (genap)
      const byTaSemGanjilAfter = await withTenant(db, SEED_A, (tx) =>
        listBebanMengajar(tx, { tahunAjaranId: taAId, semester: "ganjil" })
      );
      expect(byTaSemGanjilAfter).toHaveLength(byTaSemGanjilBefore.length + 2);
      expect(byTaSemGanjilAfter.find((r) => r.id === a.id)).toBeDefined();
      expect(byTaSemGanjilAfter.find((r) => r.id === c.id)).toBeDefined();
      expect(byTaSemGanjilAfter.find((r) => r.id === b.id)).toBeUndefined();

      // filter tahunAjaranId+semester=genap: +1 (B only) — the narrowest
      const byTaSemGenapAfter = await withTenant(db, SEED_A, (tx) =>
        listBebanMengajar(tx, { tahunAjaranId: taAId, semester: "genap" })
      );
      expect(byTaSemGenapAfter).toHaveLength(byTaSemGenapBefore.length + 1);
      expect(byTaSemGenapAfter.find((r) => r.id === b.id)).toBeDefined();
      expect(byTaSemGenapAfter.find((r) => r.id === a.id)).toBeUndefined();
      expect(byTaSemGenapAfter.find((r) => r.id === c.id)).toBeUndefined();

      // Ordering: dibuatPada ASC. Verify the unfiltered result is sorted
      // ascending by dibuatPada.
      const timestamps = allAfter.map((r) => r.dibuatPada.getTime());
      const sorted = [...timestamps].sort((x, y) => x - y);
      expect(timestamps).toEqual(sorted);
    });

    // 4. ubahBebanMengajar: update mataPelajaranId only; assert the changed
    //    field round-trips and id/tenantId stay stable.
    itOrSkip("ubahBebanMengajar updates mataPelajaranId", async () => {
      const mpOrig = await seedMataPelajaran("ubah-orig");
      const mpNext = await seedMataPelajaran("ubah-next");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkAId,
          mataPelajaranId: mpOrig.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "ganjil",
        })
      );

      const updated = await withTenant(db, SEED_A, (tx) =>
        ubahBebanMengajar(tx, created.id, { mataPelajaranId: mpNext.id })
      );

      expect(updated.id).toBe(created.id);
      expect(updated.tenantId).toBe(SEED_A);
      expect(updated.mataPelajaranId).toBe(mpNext.id);
      // Untouched fields stay put.
      expect(updated.ptkId).toBe(ptkAId);
      expect(updated.rombonganBelajarId).toBe(rombelAId);
      expect(updated.tingkatId).toBeNull();
      expect(updated.tahunAjaranId).toBe(taAId);
      expect(updated.semester).toBe("ganjil");
    });

    // 5. hapusBebanMengajar: buat then hapus; the row is gone (read by id
    //    returns nothing under RLS).
    itOrSkip("hapusBebanMengajar removes the row", async () => {
      const mp = await seedMataPelajaran("hapus");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkAId,
          mataPelajaranId: mp.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "ganjil",
        })
      );

      await withTenant(db, SEED_A, (tx) => hapusBebanMengajar(tx, created.id));

      const rows = await withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.bebanMengajar)
          .where(eq(schema.bebanMengajar.id, created.id))
      );
      expect(rows).toHaveLength(0);
    });

    // 6. getBebanMengajarSaya (AC#4 guru context): returns ONLY this PTK's
    //    beban for the (tahunAjaranId, semester) period. A second PTK's beban
    //    in the same period and the same PTK's beban in a different period
    //    are excluded.
    itOrSkip("getBebanMengajarSaya returns only this PTK's beban for the period", async () => {
      const [ptkGuru] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.ptk)
          .values({ nama: "PTK Guru Saya BM2", jenis: "pendidik" })
          .returning()
      );
      const [ptkLain] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.ptk)
          .values({ nama: "PTK Lain BM2", jenis: "pendidik" })
          .returning()
      );

      const mpMine1 = await seedMataPelajaran("saya-mine1");
      const mpMine2 = await seedMataPelajaran("saya-mine2");
      const mpMineOtherSem = await seedMataPelajaran("saya-mine-othersem");
      const mpLain = await seedMataPelajaran("saya-lain");

      // The guru's load for the target period (ganjil): 2 rows → returned.
      const mine1 = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkGuru.id,
          mataPelajaranId: mpMine1.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "ganjil",
        })
      );
      const mine2 = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkGuru.id,
          mataPelajaranId: mpMine2.id,
          tingkatId: tingkatAId,
          tahunAjaranId: taAId,
          semester: "ganjil",
        })
      );

      // The same guru's load in a DIFFERENT semester (genap) → excluded.
      const mineOtherSem = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkGuru.id,
          mataPelajaranId: mpMineOtherSem.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "genap",
        })
      );

      // A different PTK's load in the SAME period → excluded.
      await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkLain.id,
          mataPelajaranId: mpLain.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "ganjil",
        })
      );

      const saya = await withTenant(db, SEED_A, (tx) =>
        getBebanMengajarSaya(tx, ptkGuru.id, taAId, "ganjil")
      );

      // Exactly the guru's two ganjil rows; the genap row and the other-PTK
      // row are absent.
      expect(saya.map((r) => r.id).sort()).toEqual(
        [mine1.id, mine2.id].sort()
      );
      expect(saya.find((r) => r.id === mineOtherSem.id)).toBeUndefined();
      expect(saya.every((r) => r.ptkId === ptkGuru.id)).toBe(true);
      expect(saya.every((r) => r.semester === "ganjil")).toBe(true);
    });

    // 7. RLS isolation (§13): a beban created in SEED_A is NOT visible via
    //    listBebanMengajar from SEED_B (which is never written to in this
    //    file, so it is empty).
    itOrSkip("listBebanMengajar is tenant-isolated: SEED_B cannot see SEED_A's beban", async () => {
      const mp = await seedMataPelajaran("rls");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatBebanMengajar(tx, {
          ptkId: ptkAId,
          mataPelajaranId: mp.id,
          rombonganBelajarId: rombelAId,
          tahunAjaranId: taAId,
          semester: "ganjil",
        })
      );

      // Sanity: A can see its own row.
      const aList = await withTenant(db, SEED_A, (tx) =>
        listBebanMengajar(tx)
      );
      expect(aList.find((r) => r.id === created.id)).toBeDefined();

      // Cross-tenant: B's list does not include A's row (RLS hides it). SEED_B
      // is never written to in this file, so the filtered assertion is robust
      // against future additions.
      const bList = await withTenant(db, SEED_B, (tx) =>
        listBebanMengajar(tx)
      );
      expect(bList.find((r) => r.id === created.id)).toBeUndefined();
    });
  }
);
