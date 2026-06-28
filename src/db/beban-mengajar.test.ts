import path from "node:path";

import pg, { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "./client";
import { runMigrations } from "./migrate";
import * as schema from "./schema";
import { cleanupTestTenants } from "./test-cleanup";

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

// Tenant seeds — PRIVATE to this file (org_BM_*). Distinct per beban-mengajar
// test file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_BM_a";
const SEED_B = "org_BM_b";

/**
 * Assert that `promise` rejects with a Postgres integrity-constraint violation
 * (SQLSTATE 23xxx — covers CHECK 23514, UNIQUE 23505, FOREIGN KEY 23503).
 * Drizzle wraps the raw `pg` error as a `DrizzleQueryError` with the original
 * on `.cause`, so we walk the cause chain. Typed via `DatabaseError` + a type
 * guard — no `as any`; a non-pg error is rethrown so a genuine failure is not
 * masked as a false pass.
 */
function hasCause(e: unknown): e is { cause: unknown } {
  return typeof e === "object" && e !== null && "cause" in e;
}

function unwrapPgError(err: unknown): DatabaseError | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur != null; i++) {
    if (cur instanceof DatabaseError) return cur;
    cur = hasCause(cur) ? cur.cause : null;
  }
  return null;
}

async function expectConstraintViolation(
  promise: Promise<unknown>
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const pgErr = unwrapPgError(err);
    if (pgErr) {
      expect(pgErr.code).toMatch(/^23/);
      return;
    }
    throw err;
  }
  throw new Error(
    "expected promise to reject with a constraint violation, but it resolved"
  );
}

// Monotonic counters for unique literals across tests. mata_pelajaran is GLOBAL
// (UNIQUE nama/kode, no tenant isolation) so distinct names avoid cross-test
// collisions. tingkat has UNIQUE (tenant, urutan) and (tenant, nama) within a
// tenant, so urutan must be distinct across cases that share org_BM_a.
let _seq = 0;
const seq = (): number => ++_seq;

// Insert/DELETE on GLOBAL mata_pelajaran run as the migrator superuser
// (app_user has SELECT only — ADR 0001). Tenant-scoped writes use the app
// client (`db`) inside `withTenant` so RLS is enforced.
let migDb: Db;
let db: Db;

describeOrSkip("beban mengajar + wali kelas tables (#10, Wave 1 / T1)", () => {
  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(
      MIG_URL!,
      path.join(process.cwd(), "src/db/migrations")
    );

    // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear the
    //    full beban-mengajar layer + its FK parents in FK-safe order so each
    //    run starts clean (superuser bypasses RLS). Children first. Parents
    //    (ptk/rombel/tingkat/TA) carry per-tenant UNIQUE constraints with
    //    stable per-case tags, so they MUST be cleared or a re-run hits
    //    duplicate-key violations. The GLOBAL mata_pelajaran clear is scoped to
    //    this file's kode prefix (BM-MP-*) and runs AFTER beban_mengajar so the
    //    ON DELETE RESTRICT FK cannot fire.
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_BM_a', 'Satuan Pendidikan BM A'),
        ('org_BM_b', 'Satuan Pendidikan BM B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from wali_kelas        where tenant_id in ('org_BM_a', 'org_BM_b');
      delete from beban_mengajar    where tenant_id in ('org_BM_a', 'org_BM_b');
      delete from rombongan_belajar where tenant_id in ('org_BM_a', 'org_BM_b');
      delete from tingkat           where tenant_id in ('org_BM_a', 'org_BM_b');
      delete from tahun_ajaran      where tenant_id in ('org_BM_a', 'org_BM_b');
      delete from ptk               where tenant_id in ('org_BM_a', 'org_BM_b');
    `);
    await seed.query(`delete from mata_pelajaran where kode like 'BM-MP-%';`);
    await seed.end();

    // 3. Clients: migrator (GLOBAL mata_pelajaran writes) + app_user (RLS).
    migDb = createDb(MIG_URL!).db;
    db = createDb(APP_URL!).db;
  });

  afterAll(async () => {
    await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
  });

  /** Seed a GLOBAL mata_pelajaran with a unique nama (migDb — SELECT-only for app). */
  async function seedMataPelajaran(tag: string) {
    const [mp] = await migDb
      .insert(schema.mataPelajaran)
      .values({ kode: `BM-MP-${seq()}`, nama: `Beban Mapel ${tag}` })
      .returning();
    return mp;
  }

  /**
   * Seed the tenant-scoped FK parents for a beban/wali under `tenantId`:
   * tahun_ajaran, tingkat, rombongan_belajar, ptk. Distinct `tag` + monotonic
   * urutan keep the per-tenant UNIQUE constraints satisfied across cases.
   */
  async function seedParents(
    tx: Tx,
    tenantId: string,
    tag: string
  ) {
    const [ta] = await tx
      .insert(schema.tahunAjaran)
      .values({ nama: `TA ${tag}`, aktif: false })
      .returning();
    const [tk] = await tx
      .insert(schema.tingkat)
      .values({ nama: `Tingkat ${tag} ${tenantId}`, urutan: seq() + 1000 })
      .returning();
    const [rb] = await tx
      .insert(schema.rombonganBelajar)
      .values({ nama: `Rombel ${tag}`, tingkatId: tk.id, tahunAjaranId: ta.id })
      .returning();
    const [p] = await tx
      .insert(schema.ptk)
      .values({ nama: `PTK ${tag}`, jenis: "pendidik" })
      .returning();
    return { ta, tk, rb, p };
  }

  // 1. beban_mengajar CRUD: insert with rombongan_belajar_id set (tingkat_id
  //    null) -> ok; read back every field.
  itOrSkip("inserts beban_mengajar (rombel target); reads it back", async () => {
    const mp = await seedMataPelajaran("crud");
    const { bebanRow, rbId, ptkId, taId, mpId } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const { ta, tk, rb, p } = await seedParents(tx, SEED_A, "crud");
        const [bebanRow] = await tx
          .insert(schema.bebanMengajar)
          .values({
            ptkId: p.id,
            mataPelajaranId: mp.id,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
          })
          .returning();
        return {
          bebanRow,
          rbId: rb.id,
          tkId: tk.id,
          ptkId: p.id,
          taId: ta.id,
          mpId: mp.id,
        };
      }
    );

    expect(bebanRow.tenantId).toBe(SEED_A);
    expect(bebanRow.ptkId).toBe(ptkId);
    expect(bebanRow.mataPelajaranId).toBe(mpId);
    expect(bebanRow.rombonganBelajarId).toBe(rbId);
    expect(bebanRow.tingkatId).toBeNull();
    expect(bebanRow.tahunAjaranId).toBe(taId);
    expect(bebanRow.semester).toBe("ganjil");
    expect(bebanRow.dibuatPada).toBeTruthy();
  });

  // 2. CHECK XOR: BOTH rombongan_belajar_id AND tingkat_id set -> rejected;
  //    NEITHER set -> rejected. Exactly one is the only valid state.
  itOrSkip("rejects beban_mengajar with both or neither target (XOR CHECK)", async () => {
    const mp = await seedMataPelajaran("xor");
    const { ta, tk, rb, p } = await withTenant(db, SEED_A, async (tx) =>
      seedParents(tx, SEED_A, "xor")
    );

    // BOTH set -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.bebanMengajar)
          .values({
            ptkId: p.id,
            mataPelajaranId: mp.id,
            rombonganBelajarId: rb.id,
            tingkatId: tk.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
          })
          .returning()
      )
    );

    // NEITHER set -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.bebanMengajar)
          .values({
            ptkId: p.id,
            mataPelajaranId: mp.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
          })
          .returning()
      )
    );
  });

  // 3. tingkat-only beban: tingkat_id set, rombongan_belajar_id null -> ok.
  //    (A load targeting all classes in a grade level, not a specific class.)
  itOrSkip("inserts beban_mengajar with tingkat target only (no rombel)", async () => {
    const mp = await seedMataPelajaran("tingkat-only");
    const { bebanRow, tkId } = await withTenant(db, SEED_A, async (tx) => {
      const { ta, tk, p } = await seedParents(tx, SEED_A, "tingkat-only");
      const [bebanRow] = await tx
        .insert(schema.bebanMengajar)
        .values({
          ptkId: p.id,
          mataPelajaranId: mp.id,
          tingkatId: tk.id,
          tahunAjaranId: ta.id,
          semester: "genap",
        })
        .returning();
      return { bebanRow, tkId: tk.id };
    });

    expect(bebanRow.tingkatId).toBe(tkId);
    expect(bebanRow.rombonganBelajarId).toBeNull();
  });

  // 4. wali_kelas CRUD: insert -> ok; read back every field.
  itOrSkip("inserts wali_kelas; reads it back", async () => {
    const { waliRow, rbId, ptkId, taId } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const { ta, tk, rb, p } = await seedParents(tx, SEED_A, "wali-crud");
        const [waliRow] = await tx
          .insert(schema.waliKelas)
          .values({
            ptkId: p.id,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
            dibuatOleh: "user_seed",
          })
          .returning();
        return { waliRow, rbId: rb.id, ptkId: p.id, taId: ta.id, tkId: tk.id };
      }
    );

    expect(waliRow.tenantId).toBe(SEED_A);
    expect(waliRow.ptkId).toBe(ptkId);
    expect(waliRow.rombonganBelajarId).toBe(rbId);
    expect(waliRow.tahunAjaranId).toBe(taId);
    expect(waliRow.semester).toBe("ganjil");
    expect(waliRow.dibuatOleh).toBe("user_seed");
    expect(waliRow.dibuatPada).toBeTruthy();
  });

  // 5. wali_kelas UNIQUE: a second wali for the SAME (tenant, rombel, TA,
  //    semester) -> rejected. A different semester for the same rombel+TA ->
  //    both ok (historical across periods).
  itOrSkip("rejects a second wali_kelas for same rombel+TA+semester; allows different semester", async () => {
    const { rbId, ptkId, taId } = await withTenant(db, SEED_A, async (tx) => {
      const { ta, tk, rb, p } = await seedParents(tx, SEED_A, "wali-unique");
      await tx.insert(schema.waliKelas).values({
        ptkId: p.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
      return { rbId: rb.id, ptkId: p.id, taId: ta.id, tkId: tk.id };
    });

    // a second wali for the SAME (rombel, TA, semester) -> rejected (UNIQUE)
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.waliKelas)
          .values({
            ptkId,
            rombonganBelajarId: rbId,
            tahunAjaranId: taId,
            semester: "ganjil",
          })
          .returning()
      )
    );

    // a wali for the SAME rombel+TA but a DIFFERENT semester -> ok (historical)
    const [otherSem] = await withTenant(db, SEED_A, (tx) =>
      tx
        .insert(schema.waliKelas)
        .values({
          ptkId,
          rombonganBelajarId: rbId,
          tahunAjaranId: taId,
          semester: "genap",
        })
        .returning()
    );
    expect(otherSem.semester).toBe("genap");
  });

  // 6. RLS isolation (both tables): tenant B cannot see tenant A's rows.
  //    Asserts on the inserted ids (not "B is empty") so B's own legitimate
  //    data does not produce a false failure.
  itOrSkip("tenant B cannot see tenant A's beban_mengajar or wali_kelas (RLS)", async () => {
    const mp = await seedMataPelajaran("rls");
    const { bebanId, waliId } = await withTenant(db, SEED_A, async (tx) => {
      const { ta, tk, rb, p } = await seedParents(tx, SEED_A, "rls");
      const [b] = await tx
        .insert(schema.bebanMengajar)
        .values({
          ptkId: p.id,
          mataPelajaranId: mp.id,
          rombonganBelajarId: rb.id,
          tahunAjaranId: ta.id,
          semester: "ganjil",
        })
        .returning();
      const [w] = await tx
        .insert(schema.waliKelas)
        .values({
          ptkId: p.id,
          rombonganBelajarId: rb.id,
          tahunAjaranId: ta.id,
          semester: "ganjil",
        })
        .returning();
      return { bebanId: b.id, waliId: w.id, tkId: tk.id };
    });

    // tenant B reads by id -> 0 rows (RLS hides A's rows)
    const [bBeban, bWali] = await Promise.all([
      withTenant(db, SEED_B, (tx) =>
        tx
          .select()
          .from(schema.bebanMengajar)
          .where(eq(schema.bebanMengajar.id, bebanId))
      ),
      withTenant(db, SEED_B, (tx) =>
        tx.select().from(schema.waliKelas).where(eq(schema.waliKelas.id, waliId))
      ),
    ]);
    expect(bBeban).toHaveLength(0);
    expect(bWali).toHaveLength(0);

    // sanity: tenant A itself CAN see its own rows (proves the inserts worked
    // and the empty reads from B are due to RLS, not a failed insert).
    const [aBeban, aWali] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.bebanMengajar)
          .where(eq(schema.bebanMengajar.id, bebanId))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.waliKelas).where(eq(schema.waliKelas.id, waliId))
      ),
    ]);
    expect(aBeban).toHaveLength(1);
    expect(aWali).toHaveLength(1);
  });

  // 7. FK CASCADE: deleting ptk removes its beban_mengajar + wali_kelas;
  //    deleting rombongan_belajar removes its beban_mengajar (rombel ref) +
  //    wali_kelas; deleting tahun_ajaran removes both (direct + via rombel).
  itOrSkip("cascades ptk -> beban/wali, rombel -> beban(rombel)/wali, tahun_ajaran -> both", async () => {
    // Tree A: ptk -> beban + wali cascade.
    const mpA = await seedMataPelajaran("casc-ptk");
    const ptkIdA = await withTenant(db, SEED_A, async (tx) => {
      const { ta, tk: _tk, rb, p } = await seedParents(tx, SEED_A, "casc-ptk");
      await tx.insert(schema.bebanMengajar).values({
        ptkId: p.id,
        mataPelajaranId: mpA.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
      await tx.insert(schema.waliKelas).values({
        ptkId: p.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
      return p.id;
    });

    // sanity: rows exist before the delete
    const beforeBebanByPtk = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.bebanMengajar).where(eq(schema.bebanMengajar.ptkId, ptkIdA))
    );
    const beforeWaliByPtk = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.waliKelas).where(eq(schema.waliKelas.ptkId, ptkIdA))
    );
    expect(beforeBebanByPtk).toHaveLength(1);
    expect(beforeWaliByPtk).toHaveLength(1);

    await withTenant(db, SEED_A, async (tx) => {
      await tx.delete(schema.ptk).where(eq(schema.ptk.id, ptkIdA));
    });

    const [afterBebanByPtk, afterWaliByPtk] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.bebanMengajar).where(eq(schema.bebanMengajar.ptkId, ptkIdA))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.waliKelas).where(eq(schema.waliKelas.ptkId, ptkIdA))
      ),
    ]);
    expect(afterBebanByPtk).toHaveLength(0);
    expect(afterWaliByPtk).toHaveLength(0);

    // Tree B: rombongan_belajar -> beban(rombel ref) + wali cascade.
    const mpB = await seedMataPelajaran("casc-rombel");
    const rbIdB = await withTenant(db, SEED_A, async (tx) => {
      const { ta, tk: _tk, rb, p } = await seedParents(tx, SEED_A, "casc-rombel");
      await tx.insert(schema.bebanMengajar).values({
        ptkId: p.id,
        mataPelajaranId: mpB.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
      await tx.insert(schema.waliKelas).values({
        ptkId: p.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
      return rb.id;
    });

    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .delete(schema.rombonganBelajar)
        .where(eq(schema.rombonganBelajar.id, rbIdB));
    });

    const [afterBebanByRombel, afterWaliByRombel] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.bebanMengajar)
          .where(eq(schema.bebanMengajar.rombonganBelajarId, rbIdB))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.waliKelas)
          .where(eq(schema.waliKelas.rombonganBelajarId, rbIdB))
      ),
    ]);
    expect(afterBebanByRombel).toHaveLength(0);
    expect(afterWaliByRombel).toHaveLength(0);

    // Tree C: tahun_ajaran -> beban + wali cascade (direct FK + via rombel).
    const mpC = await seedMataPelajaran("casc-ta");
    const taIdC = await withTenant(db, SEED_A, async (tx) => {
      const { ta, tk: _tk, rb, p } = await seedParents(tx, SEED_A, "casc-ta");
      await tx.insert(schema.bebanMengajar).values({
        ptkId: p.id,
        mataPelajaranId: mpC.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
      await tx.insert(schema.waliKelas).values({
        ptkId: p.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
      return ta.id;
    });

    await withTenant(db, SEED_A, async (tx) => {
      await tx.delete(schema.tahunAjaran).where(eq(schema.tahunAjaran.id, taIdC));
    });

    const [afterBebanByTa, afterWaliByTa] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.bebanMengajar)
          .where(eq(schema.bebanMengajar.tahunAjaranId, taIdC))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.waliKelas)
          .where(eq(schema.waliKelas.tahunAjaranId, taIdC))
      ),
    ]);
    expect(afterBebanByTa).toHaveLength(0);
    expect(afterWaliByTa).toHaveLength(0);
  });

  // 8. FK RESTRICT: deleting a mata_pelajaran referenced by a beban_mengajar is
  //    rejected (23503, GLOBAL ON DELETE RESTRICT). The beban must be removed
  //    first. Deleted via migDb — app_user lacks permission on GLOBAL tables.
  itOrSkip("rejects deleting mata_pelajaran referenced by a beban_mengajar (RESTRICT)", async () => {
    const mp = await seedMataPelajaran("restrict");
    await withTenant(db, SEED_A, async (tx) => {
      const { ta, tk: _tk, rb, p } = await seedParents(tx, SEED_A, "restrict");
      await tx.insert(schema.bebanMengajar).values({
        ptkId: p.id,
        mataPelajaranId: mp.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
    });

    await expectConstraintViolation(
      migDb
        .delete(schema.mataPelajaran)
        .where(eq(schema.mataPelajaran.id, mp.id))
    );
  });
});
