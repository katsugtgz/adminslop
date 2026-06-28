import path from "node:path";

import pg, { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "./client";
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

// Tenant seeds — PRIVATE to this file (org_RB_*). Distinct per rombongan-belajar
// test file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_RB_a";
const SEED_B = "org_RB_b";

/**
 * Assert that `promise` rejects with a Postgres integrity-constraint violation
 * (SQLSTATE 23xxx — covers CHECK 23514 and UNIQUE 23505). Drizzle wraps the
 * raw `pg` error as a `DrizzleQueryError` with the original on `.cause`, so we
 * walk the cause chain. Typed via `DatabaseError` + a type guard — no `as any`;
 * a non-pg error is rethrown so a genuine failure is not masked as a false pass.
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

describeOrSkip("rombongan belajar tables (#8, Wave 1 / T1)", () => {
  let db: Db;

  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(
      MIG_URL!,
      path.join(process.cwd(), "src/db/migrations")
    );

    // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear the
    //    rombongan-belajar layer in FK-safe order so each run starts clean
    //    (superuser bypasses RLS). peserta_didik is cleared too because
    //    penempatan references it (tests create their own PD rows here).
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_RB_a', 'Satuan Pendidikan RB A'),
        ('org_RB_b', 'Satuan Pendidikan RB B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from penempatan_rombongan_belajar where tenant_id in ('org_RB_a', 'org_RB_b');
      delete from rombongan_belajar       where tenant_id in ('org_RB_a', 'org_RB_b');
      delete from tingkat                 where tenant_id in ('org_RB_a', 'org_RB_b');
      delete from tahun_ajaran            where tenant_id in ('org_RB_a', 'org_RB_b');
      delete from peserta_didik           where tenant_id in ('org_RB_a', 'org_RB_b');
    `);
    await seed.end();

    // 3. App client uses the non-superuser role — RLS enforced.
    db = createDb(APP_URL!).db;
  });

  afterAll(async () => {
    await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
  });

  // 1. tahun_ajaran CRUD + partial unique on active: at most one aktif per
  //    tenant; inactive years coexist; aktif is per-tenant (different tenants
  //    may each have their own aktif).
  itOrSkip("inserts tahun_ajaran; rejects a second active year per tenant, allows it cross-tenant", async () => {
    const { inactiveRow, activeRow } = await withTenant(db, SEED_A, async (tx) => {
      const [inactiveRow] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: "2025/2026", aktif: false })
        .returning();
      const [activeRow] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: "2024/2025", aktif: true })
        .returning();
      return { inactiveRow, activeRow };
    });

    expect(inactiveRow.tenantId).toBe(SEED_A);
    expect(inactiveRow.nama).toBe("2025/2026");
    expect(inactiveRow.aktif).toBe(false);
    expect(activeRow.nama).toBe("2024/2025");
    expect(activeRow.aktif).toBe(true);

    // a second aktif=true in the SAME tenant -> rejected (partial unique)
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.tahunAjaran)
          .values({ nama: "2023/2024", aktif: true })
          .returning()
      )
    );

    // aktif=true in a DIFFERENT tenant -> allowed (isolation per tenant)
    const [bActive] = await withTenant(db, SEED_B, (tx) =>
      tx
        .insert(schema.tahunAjaran)
        .values({ nama: "2024/2025", aktif: true })
        .returning()
    );
    expect(bActive.tenantId).toBe(SEED_B);
    expect(bActive.aktif).toBe(true);
  });

  // 2. tingkat CRUD + unique: unique per (tenant,nama) and per (tenant,urutan).
  itOrSkip("inserts tingkat; rejects duplicate (tenant,nama) and duplicate (tenant,urutan)", async () => {
    const { t1, t2 } = await withTenant(db, SEED_A, async (tx) => {
      const [t1] = await tx
        .insert(schema.tingkat)
        .values({ nama: "Kelas 1", urutan: 1 })
        .returning();
      const [t2] = await tx
        .insert(schema.tingkat)
        .values({ nama: "Kelas 2", urutan: 2 })
        .returning();
      return { t1, t2 };
    });

    expect(t1.nama).toBe("Kelas 1");
    expect(t1.urutan).toBe(1);
    expect(t2.nama).toBe("Kelas 2");
    expect(t2.urutan).toBe(2);

    // duplicate (tenant, nama) -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.tingkat)
          .values({ nama: "Kelas 1", urutan: 3 })
          .returning()
      )
    );

    // duplicate (tenant, urutan) -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.tingkat)
          .values({ nama: "Kelas 3", urutan: 1 })
          .returning()
      )
    );
  });

  // 3. rombongan_belajar CRUD + unique: unique per (tenant,tahun_ajaran,nama).
  itOrSkip("inserts rombongan_belajar; rejects duplicate (tenant, tahun_ajaran, nama)", async () => {
    const { rombelRow, taId, tingkatId } = await withTenant(db, SEED_A, async (tx) => {
      const [ta] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: "Rombel TA", aktif: false })
        .returning();
      const [tk] = await tx
        .insert(schema.tingkat)
        .values({ nama: "Rombel Tingkat", urutan: 10 })
        .returning();
      const [rombelRow] = await tx
        .insert(schema.rombonganBelajar)
        .values({ nama: "1A", tingkatId: tk.id, tahunAjaranId: ta.id })
        .returning();
      return { rombelRow, taId: ta.id, tingkatId: tk.id };
    });

    expect(rombelRow.nama).toBe("1A");
    expect(rombelRow.tingkatId).toBe(tingkatId);
    expect(rombelRow.tahunAjaranId).toBe(taId);

    // duplicate (tenant, tahun_ajaran, nama) -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.rombonganBelajar)
          .values({ nama: "1A", tingkatId, tahunAjaranId: taId })
          .returning()
      )
    );
  });

  // 4. penempatan append-only CRUD: one placement per (tenant, pd, ta, semester).
  itOrSkip("inserts penempatan; rejects a second placement for same peserta_didik + tahun_ajaran + semester", async () => {
    const { penempatanRow, pdId, rombelId, taId } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const [pd] = await tx
          .insert(schema.pesertaDidik)
          .values({
            nama: "Andi Rombel",
            tanggalLahir: "2012-01-01",
            jenisKelamin: "L",
          })
          .returning();
        const [ta] = await tx
          .insert(schema.tahunAjaran)
          .values({ nama: "Penempatan TA", aktif: false })
          .returning();
        const [tk] = await tx
          .insert(schema.tingkat)
          .values({ nama: "Penempatan Tingkat", urutan: 20 })
          .returning();
        const [rb] = await tx
          .insert(schema.rombonganBelajar)
          .values({ nama: "Penempatan 1A", tingkatId: tk.id, tahunAjaranId: ta.id })
          .returning();
        const [penempatanRow] = await tx
          .insert(schema.penempatanRombonganBelajar)
          .values({
            pesertaDidikId: pd.id,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
            status: "aktif",
            catatan: "penempatan awal",
            dibuatOleh: "user_seed",
          })
          .returning();
        return {
          penempatanRow,
          pdId: pd.id,
          rombelId: rb.id,
          taId: ta.id,
        };
      }
    );

    expect(penempatanRow.tenantId).toBe(SEED_A);
    expect(penempatanRow.pesertaDidikId).toBe(pdId);
    expect(penempatanRow.rombonganBelajarId).toBe(rombelId);
    expect(penempatanRow.tahunAjaranId).toBe(taId);
    expect(penempatanRow.semester).toBe("ganjil");
    expect(penempatanRow.status).toBe("aktif");
    expect(penempatanRow.catatan).toBe("penempatan awal");

    // a second placement for the SAME (pd, ta, semester) -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.penempatanRombonganBelajar)
          .values({
            pesertaDidikId: pdId,
            rombonganBelajarId: rombelId,
            tahunAjaranId: taId,
            semester: "ganjil",
            status: "naik",
          })
          .returning()
      )
    );
  });

  // 5. semester_aktif on satuan_pendidikan: 'ganjil'/'genap' ok, NULL ok,
  //    'xyz' rejected (CHECK). satuan_pendidikan is NOT RLS'd (it IS the tenant
  //    boundary), so updates are plain (no withTenant GUC needed).
  itOrSkip("accepts valid semester_aktif on satuan_pendidikan; rejects invalid", async () => {
    await db
      .update(schema.satuanPendidikan)
      .set({ semesterAktif: "ganjil" })
      .where(eq(schema.satuanPendidikan.id, SEED_A));
    let [row] = await db
      .select()
      .from(schema.satuanPendidikan)
      .where(eq(schema.satuanPendidikan.id, SEED_A));
    expect(row.semesterAktif).toBe("ganjil");

    await db
      .update(schema.satuanPendidikan)
      .set({ semesterAktif: "genap" })
      .where(eq(schema.satuanPendidikan.id, SEED_A));
    [row] = await db
      .select()
      .from(schema.satuanPendidikan)
      .where(eq(schema.satuanPendidikan.id, SEED_A));
    expect(row.semesterAktif).toBe("genap");

    // NULL is allowed (column is nullable)
    await db
      .update(schema.satuanPendidikan)
      .set({ semesterAktif: null })
      .where(eq(schema.satuanPendidikan.id, SEED_A));
    [row] = await db
      .select()
      .from(schema.satuanPendidikan)
      .where(eq(schema.satuanPendidikan.id, SEED_A));
    expect(row.semesterAktif).toBeNull();

    // invalid value -> rejected by CHECK
    await expectConstraintViolation(
      db
        .update(schema.satuanPendidikan)
        .set({ semesterAktif: "xyz" })
        .where(eq(schema.satuanPendidikan.id, SEED_A))
    );
  });

  // 6. RLS isolation (all 4 academic tables): tenant B cannot see tenant A's
  //    specific rows. Asserts on the inserted ids (not "B is empty") so B's own
  //    legitimate data — e.g. the aktif tahun_ajaran seeded cross-tenant in
  //    case 1 — does not produce a false failure.
  itOrSkip("tenant B cannot see tenant A's rows (RLS isolation, all 4 tables)", async () => {
    const ids = await withTenant(db, SEED_A, async (tx) => {
      const [ta] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: "Isolasi TA", aktif: false })
        .returning();
      const [tk] = await tx
        .insert(schema.tingkat)
        .values({ nama: "Isolasi Tingkat", urutan: 30 })
        .returning();
      const [rb] = await tx
        .insert(schema.rombonganBelajar)
        .values({ nama: "Isolasi 1A", tingkatId: tk.id, tahunAjaranId: ta.id })
        .returning();
      const [pd] = await tx
        .insert(schema.pesertaDidik)
        .values({
          nama: "Isolasi PD",
          tanggalLahir: "2013-01-01",
          jenisKelamin: "P",
        })
        .returning();
      const [pen] = await tx
        .insert(schema.penempatanRombonganBelajar)
        .values({
          pesertaDidikId: pd.id,
          rombonganBelajarId: rb.id,
          tahunAjaranId: ta.id,
          semester: "genap",
          status: "aktif",
        })
        .returning();
      return { taId: ta.id, tkId: tk.id, rbId: rb.id, penId: pen.id };
    });

    const [bTa, bTingkat, bRombel, bPenempatan] = await Promise.all([
      withTenant(db, SEED_B, (tx) =>
        tx.select().from(schema.tahunAjaran).where(eq(schema.tahunAjaran.id, ids.taId))
      ),
      withTenant(db, SEED_B, (tx) =>
        tx.select().from(schema.tingkat).where(eq(schema.tingkat.id, ids.tkId))
      ),
      withTenant(db, SEED_B, (tx) =>
        tx
          .select()
          .from(schema.rombonganBelajar)
          .where(eq(schema.rombonganBelajar.id, ids.rbId))
      ),
      withTenant(db, SEED_B, (tx) =>
        tx
          .select()
          .from(schema.penempatanRombonganBelajar)
          .where(eq(schema.penempatanRombonganBelajar.id, ids.penId))
      ),
    ]);
    expect(bTa).toHaveLength(0);
    expect(bTingkat).toHaveLength(0);
    expect(bRombel).toHaveLength(0);
    expect(bPenempatan).toHaveLength(0);

    // sanity: tenant A itself CAN see its own rows (proves the inserts worked
    // and the empty reads from B are due to RLS, not a failed insert).
    const [aTa, aTingkat, aRombel, aPenempatan] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.tahunAjaran).where(eq(schema.tahunAjaran.id, ids.taId))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.tingkat).where(eq(schema.tingkat.id, ids.tkId))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.rombonganBelajar)
          .where(eq(schema.rombonganBelajar.id, ids.rbId))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.penempatanRombonganBelajar)
          .where(eq(schema.penempatanRombonganBelajar.id, ids.penId))
      ),
    ]);
    expect(aTa).toHaveLength(1);
    expect(aTingkat).toHaveLength(1);
    expect(aRombel).toHaveLength(1);
    expect(aPenempatan).toHaveLength(1);
  });

  // 7. RLS write isolation: FORCED WITH CHECK rejects a forged tenant_id literal.
  itOrSkip("forged tenant_id literal is rejected by WITH CHECK (FORCE RLS)", async () => {
    // GUC is SEED_B; an explicit SEED_A literal must be rejected by the policy's
    // WITH CHECK — proves FORCE ROW LEVEL SECURITY is on (owner would otherwise
    // bypass, and a non-FORCED policy would not check writes). RLS WITH CHECK
    // failures surface as SQLSTATE 42501 (insufficient_privilege), not a 23xxx
    // constraint violation, so this is a plain rejects-assertion (mirrors
    // akses.test.ts), not a CHECK/UNIQUE helper case.
    await expect(
      withTenant(db, SEED_B, (tx) =>
        tx
          .insert(schema.tahunAjaran)
          .values({ nama: "FORGED", aktif: false, tenantId: SEED_A })
          .returning()
      )
    ).rejects.toThrow();
  });

  // 8. FK CASCADE: deleting tahun_ajaran removes its rombongan_belajar, which
  //    removes their penempatan. Deleting peserta_didik removes its penempatan.
  itOrSkip("cascades tahun_ajaran -> rombongan_belajar -> penempatan, and peserta_didik -> penempatan", async () => {
    // Tree A: tahun_ajaran -> rombongan_belajar -> penempatan cascade.
    const taId = await withTenant(db, SEED_A, async (tx) => {
      const [ta] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: "Cascade TA", aktif: false })
        .returning();
      const [tk] = await tx
        .insert(schema.tingkat)
        .values({ nama: "Cascade Tingkat", urutan: 40 })
        .returning();
      const [rb] = await tx
        .insert(schema.rombonganBelajar)
        .values({ nama: "Cascade 1A", tingkatId: tk.id, tahunAjaranId: ta.id })
        .returning();
      const [pd] = await tx
        .insert(schema.pesertaDidik)
        .values({
          nama: "Cascade PD",
          tanggalLahir: "2014-01-01",
          jenisKelamin: "L",
        })
        .returning();
      await tx.insert(schema.penempatanRombonganBelajar).values({
        pesertaDidikId: pd.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
        status: "aktif",
      });
      return ta.id;
    });

    // sanity: rombongan_belajar + penempatan exist before the delete
    const beforeRombel = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.rombonganBelajar).where(eq(schema.rombonganBelajar.tahunAjaranId, taId))
    );
    const beforePenempatan = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.penempatanRombonganBelajar)
        .where(eq(schema.penempatanRombonganBelajar.tahunAjaranId, taId))
    );
    expect(beforeRombel).toHaveLength(1);
    expect(beforePenempatan).toHaveLength(1);

    // delete the tahun_ajaran -> cascades rombongan_belajar -> penempatan
    // (FK referential action fires under the table owner, bypassing RLS).
    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .delete(schema.tahunAjaran)
        .where(eq(schema.tahunAjaran.id, taId));
    });

    const [afterRombel, afterPenempatan] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.rombonganBelajar).where(eq(schema.rombonganBelajar.tahunAjaranId, taId))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.penempatanRombonganBelajar)
          .where(eq(schema.penempatanRombonganBelajar.tahunAjaranId, taId))
      ),
    ]);
    expect(afterRombel).toHaveLength(0);
    expect(afterPenempatan).toHaveLength(0);

    // Tree B: peserta_didik -> penempatan cascade.
    const { pdId } = await withTenant(db, SEED_A, async (tx) => {
      const [ta2] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: "Cascade PD TA", aktif: false })
        .returning();
      const [tk2] = await tx
        .insert(schema.tingkat)
        .values({ nama: "Cascade PD Tingkat", urutan: 50 })
        .returning();
      const [rb2] = await tx
        .insert(schema.rombonganBelajar)
        .values({ nama: "Cascade PD 1A", tingkatId: tk2.id, tahunAjaranId: ta2.id })
        .returning();
      const [pd2] = await tx
        .insert(schema.pesertaDidik)
        .values({
          nama: "Cascade PD Host",
          tanggalLahir: "2015-01-01",
          jenisKelamin: "P",
        })
        .returning();
      await tx.insert(schema.penempatanRombonganBelajar).values({
        pesertaDidikId: pd2.id,
        rombonganBelajarId: rb2.id,
        tahunAjaranId: ta2.id,
        semester: "genap",
        status: "aktif",
      });
      return { pdId: pd2.id };
    });

    // delete the peserta_didik -> cascades its penempatan
    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .delete(schema.pesertaDidik)
        .where(eq(schema.pesertaDidik.id, pdId));
    });

    const afterPdPenempatan = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.penempatanRombonganBelajar)
        .where(eq(schema.penempatanRombonganBelajar.pesertaDidikId, pdId))
    );
    expect(afterPdPenempatan).toHaveLength(0);
  });

  // 9. CHECK status + CHECK semester: valid values accepted, 'xyz' rejected.
  itOrSkip("rejects penempatan with invalid status or invalid semester (CHECK)", async () => {
    const { pdId, rombelId, taId } = await withTenant(db, SEED_A, async (tx) => {
      const [pd] = await tx
        .insert(schema.pesertaDidik)
        .values({
          nama: "Check PD",
          tanggalLahir: "2016-01-01",
          jenisKelamin: "L",
        })
        .returning();
      const [ta] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: "Check TA", aktif: false })
        .returning();
      const [tk] = await tx
        .insert(schema.tingkat)
        .values({ nama: "Check Tingkat", urutan: 60 })
        .returning();
      const [rb] = await tx
        .insert(schema.rombonganBelajar)
        .values({ nama: "Check 1A", tingkatId: tk.id, tahunAjaranId: ta.id })
        .returning();
      return { pdId: pd.id, rombelId: rb.id, taId: ta.id };
    });

    // valid status + semester -> accepted (sanity)
    await withTenant(db, SEED_A, async (tx) => {
      await tx.insert(schema.penempatanRombonganBelajar).values({
        pesertaDidikId: pdId,
        rombonganBelajarId: rombelId,
        tahunAjaranId: taId,
        semester: "genap",
        status: "naik",
      });
    });

    // invalid status -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx.insert(schema.penempatanRombonganBelajar).values({
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tahunAjaranId: taId,
          semester: "ganjil",
          status: "xyz",
        })
      )
    );

    // invalid semester -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx.insert(schema.penempatanRombonganBelajar).values({
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tahunAjaranId: taId,
          semester: "xyz",
          status: "aktif",
        })
      )
    );
  });
});
