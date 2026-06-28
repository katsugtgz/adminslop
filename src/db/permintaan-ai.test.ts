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

// Tenant seeds — PRIVATE to this file (org_AI_*). Distinct per permintaan-ai
// test file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_AI_a";
const SEED_B = "org_AI_b";

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

// Monotonic counter for unique tahun_ajaran `nama` literals across cases.
// tahun_ajaran has UNIQUE (tenant, nama) so distinct names avoid cross-test
// collisions within a tenant.
let _seq = 0;
const seq = (): number => ++_seq;

let db: Db;

describeOrSkip("permintaan_ai + draf_ai + kuota_ai tables (#12, Wave 1 / T1)", () => {
  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(
      MIG_URL!,
      path.join(process.cwd(), "src/db/migrations")
    );

    // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear the
    //    AI layer + its FK parent (tahun_ajaran) in FK-safe order so each run
    //    starts clean (superuser bypasses RLS). Children first. tahun_ajaran
    //    carries per-tenant UNIQUE on nama, so it MUST be cleared or a re-run
    //    hits duplicate-key violations.
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_AI_a', 'Satuan Pendidikan AI A'),
        ('org_AI_b', 'Satuan Pendidikan AI B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from draf_ai       where tenant_id in ('org_AI_a', 'org_AI_b');
      delete from permintaan_ai where tenant_id in ('org_AI_a', 'org_AI_b');
      delete from kuota_ai      where tenant_id in ('org_AI_a', 'org_AI_b');
      delete from tahun_ajaran  where tenant_id in ('org_AI_a', 'org_AI_b');
    `);
    await seed.end();

    // 3. App client (RLS-enforced). AI tables have no GLOBAL FK parents so no
    //    migrator client is needed here (unlike beban_mengajar).
    db = createDb(APP_URL!).db;
  });

  afterAll(async () => {
    await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
  });

  /**
   * Seed a tahun_ajaran under `tenantId` with a unique `nama`. kuota_ai has a
   * composite UNIQUE on (tenant, tahun_ajaran, semester) and permintaan_ai
   * does not reference tahun_ajaran directly, but the kuota_ai tests do.
   */
  async function seedTahunAjaran(tx: Tx, tenantId: string, tag: string) {
    const [ta] = await tx
      .insert(schema.tahunAjaran)
      .values({ nama: `TA ${tag} ${tenantId} ${seq()}`, aktif: false })
      .returning();
    return ta;
  }

  // 1. permintaan_ai CRUD: insert (jenis, konteks, status='dibuat',
  //    dibuat_oleh) -> ok; read back every field including the default status.
  itOrSkip("inserts permintaan_ai; reads it back with default status", async () => {
    const { row, dibuatOleh } = await withTenant(db, SEED_A, async (tx) => {
      const [row] = await tx
        .insert(schema.permintaanAi)
        .values({
          jenis: "deskripsi_cp",
          konteks: { mapel: "Matematika", fase: "E" },
          dibuatOleh: "user_permintaan_crud",
        })
        .returning();
      return { row, dibuatOleh: row.dibuatOleh };
    });

    expect(row.tenantId).toBe(SEED_A);
    expect(row.jenis).toBe("deskripsi_cp");
    expect(row.konteks).toEqual({ mapel: "Matematika", fase: "E" });
    expect(row.status).toBe("dibuat");
    expect(row.pesanError).toBeNull();
    expect(row.permintaanTerkaitId).toBeNull();
    expect(row.dibuatOleh).toBe(dibuatOleh);
    expect(row.dibuatPada).toBeTruthy();
    expect(row.diprosesPada).toBeNull();
    expect(row.selesaiPada).toBeNull();
  });

  // 2. draf_ai CRUD: insert linked to a permintaan -> ok; read back every
  //    field including the default status_verifikasi.
  itOrSkip("inserts draf_ai linked to a permintaan; reads it back", async () => {
    const { row, permintaanId } = await withTenant(db, SEED_A, async (tx) => {
      const [permintaan] = await tx
        .insert(schema.permintaanAi)
        .values({
          jenis: "deskripsi_tp",
          konteks: { mapel: "IPA" },
          dibuatOleh: "user_draf_crud",
        })
        .returning();
      const [row] = await tx
        .insert(schema.drafAi)
        .values({
          permintaanAiId: permintaan.id,
          konten: "Tujuan pembelajaran: ...",
          provenance: "model=gpt-4o;prompt_hash=abc123;ts=2026-01-01T00:00:00Z",
        })
        .returning();
      return { row, permintaanId: permintaan.id };
    });

    expect(row.tenantId).toBe(SEED_A);
    expect(row.permintaanAiId).toBe(permintaanId);
    expect(row.konten).toBe("Tujuan pembelajaran: ...");
    expect(row.provenance).toContain("model=gpt-4o");
    expect(row.statusVerifikasi).toBe("menunggu");
    expect(row.diverifikasiOleh).toBeNull();
    expect(row.diverifikasiPada).toBeNull();
    expect(row.dibuatPada).toBeTruthy();
  });

  // 2b. draf_ai UNIQUE: a second draf for the SAME permintaan_ai_id -> rejected
  //     (1:1 enforced). A draf for a different permintaan -> ok.
  itOrSkip("rejects a second draf_ai for the same permintaan (1:1 UNIQUE)", async () => {
    const { permintaanId, otherPermintaanId } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const [p1] = await tx
          .insert(schema.permintaanAi)
          .values({
            jenis: "deskripsi_atp",
            konteks: { fase: "E" },
            dibuatOleh: "user_draf_unique_p1",
          })
          .returning();
        const [p2] = await tx
          .insert(schema.permintaanAi)
          .values({
            jenis: "deskripsi_atp",
            konteks: { fase: "E" },
            dibuatOleh: "user_draf_unique_p2",
          })
          .returning();
        await tx.insert(schema.drafAi).values({
          permintaanAiId: p1.id,
          konten: "first draft",
          provenance: "model=test;prompt_hash=h1;ts=t",
        });
        return { permintaanId: p1.id, otherPermintaanId: p2.id };
      }
    );

    // second draf for the SAME permintaan -> rejected (UNIQUE)
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.drafAi)
          .values({
            permintaanAiId: permintaanId,
            konten: "second draft",
            provenance: "model=test;prompt_hash=h2;ts=t",
          })
          .returning()
      )
    );

    // a draf for a DIFFERENT permintaan -> ok
    const [other] = await withTenant(db, SEED_A, (tx) =>
      tx
        .insert(schema.drafAi)
        .values({
          permintaanAiId: otherPermintaanId,
          konten: "draft for other",
          provenance: "model=test;prompt_hash=h3;ts=t",
        })
        .returning()
    );
    expect(other.permintaanAiId).toBe(otherPermintaanId);
  });

  // 3. kuota_ai CRUD: insert (TA, semester, terpakai=0, batas=100) -> ok;
  //    read back every field including defaults.
  itOrSkip("inserts kuota_ai; reads it back with defaults", async () => {
    const { row, taId } = await withTenant(db, SEED_A, async (tx) => {
      const ta = await seedTahunAjaran(tx, SEED_A, "kuota-crud");
      const [row] = await tx
        .insert(schema.kuotaAi)
        .values({
          tahunAjaranId: ta.id,
          semester: "ganjil",
        })
        .returning();
      return { row, taId: ta.id };
    });

    expect(row.tenantId).toBe(SEED_A);
    expect(row.tahunAjaranId).toBe(taId);
    expect(row.semester).toBe("ganjil");
    expect(row.terpakai).toBe(0);
    expect(row.batas).toBe(100);
  });

  // 3b. kuota_ai UNIQUE: a second quota for the SAME (tenant, TA, semester) ->
  //     rejected. A different semester for the same TA -> ok.
  itOrSkip("rejects a second kuota_ai for same TA+semester; allows different semester", async () => {
    const { taId } = await withTenant(db, SEED_A, async (tx) => {
      const ta = await seedTahunAjaran(tx, SEED_A, "kuota-unique");
      await tx.insert(schema.kuotaAi).values({
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
      return { taId: ta.id };
    });

    // second quota for the SAME (TA, semester) -> rejected (UNIQUE)
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.kuotaAi)
          .values({
            tahunAjaranId: taId,
            semester: "ganjil",
          })
          .returning()
      )
    );

    // a quota for the SAME TA but a DIFFERENT semester -> ok
    const [otherSem] = await withTenant(db, SEED_A, (tx) =>
      tx
        .insert(schema.kuotaAi)
        .values({
          tahunAjaranId: taId,
          semester: "genap",
        })
        .returning()
    );
    expect(otherSem.semester).toBe("genap");
  });

  // 4. RLS isolation (all 3 tables): tenant B cannot see tenant A's rows.
  //    Asserts on the inserted ids so B's own legitimate data cannot produce a
  //    false failure.
  itOrSkip("tenant B cannot see tenant A's permintaan/draf/kuota (RLS)", async () => {
    const { permintaanId, drafId, kuotaId } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const [p] = await tx
          .insert(schema.permintaanAi)
          .values({
            jenis: "narasi_raport",
            konteks: { kelas: "7A" },
            dibuatOleh: "user_rls",
          })
          .returning();
        const [d] = await tx
          .insert(schema.drafAi)
          .values({
            permintaanAiId: p.id,
            konten: "rls-isolated draft",
            provenance: "model=test;prompt_hash=rls;ts=t",
          })
          .returning();
        const ta = await seedTahunAjaran(tx, SEED_A, "rls");
        const [k] = await tx
          .insert(schema.kuotaAi)
          .values({ tahunAjaranId: ta.id, semester: "ganjil" })
          .returning();
        return { permintaanId: p.id, drafId: d.id, kuotaId: k.id };
      }
    );

    // tenant B reads by id -> 0 rows (RLS hides A's rows)
    const [bPermintaan, bDraf, bKuota] = await Promise.all([
      withTenant(db, SEED_B, (tx) =>
        tx
          .select()
          .from(schema.permintaanAi)
          .where(eq(schema.permintaanAi.id, permintaanId))
      ),
      withTenant(db, SEED_B, (tx) =>
        tx.select().from(schema.drafAi).where(eq(schema.drafAi.id, drafId))
      ),
      withTenant(db, SEED_B, (tx) =>
        tx.select().from(schema.kuotaAi).where(eq(schema.kuotaAi.id, kuotaId))
      ),
    ]);
    expect(bPermintaan).toHaveLength(0);
    expect(bDraf).toHaveLength(0);
    expect(bKuota).toHaveLength(0);

    // sanity: tenant A itself CAN see its own rows (proves the inserts worked
    // and the empty reads from B are due to RLS, not a failed insert).
    const [aPermintaan, aDraf, aKuota] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.permintaanAi)
          .where(eq(schema.permintaanAi.id, permintaanId))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.drafAi).where(eq(schema.drafAi.id, drafId))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.kuotaAi).where(eq(schema.kuotaAi.id, kuotaId))
      ),
    ]);
    expect(aPermintaan).toHaveLength(1);
    expect(aDraf).toHaveLength(1);
    expect(aKuota).toHaveLength(1);
  });

  // 5. FK CASCADE: deleting permintaan_ai -> draf_ai gone. Deleting
  //    tahun_ajaran -> kuota_ai gone.
  itOrSkip("cascades permintaan_ai -> draf_ai and tahun_ajaran -> kuota_ai", async () => {
    // Tree A: permintaan_ai -> draf_ai cascade.
    const permintaanIdA = await withTenant(db, SEED_A, async (tx) => {
      const [p] = await tx
        .insert(schema.permintaanAi)
        .values({
          jenis: "deskripsi_cp",
          konteks: { s: "casc-draf" },
          dibuatOleh: "user_casc_draf",
        })
        .returning();
      await tx.insert(schema.drafAi).values({
        permintaanAiId: p.id,
        konten: "to be cascaded",
        provenance: "model=test;prompt_hash=casc;ts=t",
      });
      return p.id;
    });

    // sanity: row exists before the delete
    const beforeDraf = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.drafAi)
        .where(eq(schema.drafAi.permintaanAiId, permintaanIdA))
    );
    expect(beforeDraf).toHaveLength(1);

    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .delete(schema.permintaanAi)
        .where(eq(schema.permintaanAi.id, permintaanIdA));
    });

    const afterDraf = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.drafAi)
        .where(eq(schema.drafAi.permintaanAiId, permintaanIdA))
    );
    expect(afterDraf).toHaveLength(0);

    // Tree B: tahun_ajaran -> kuota_ai cascade.
    const taIdB = await withTenant(db, SEED_A, async (tx) => {
      const ta = await seedTahunAjaran(tx, SEED_A, "casc-kuota");
      await tx.insert(schema.kuotaAi).values({
        tahunAjaranId: ta.id,
        semester: "ganjil",
      });
      return ta.id;
    });

    // sanity: row exists before the delete
    const beforeKuota = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.kuotaAi)
        .where(eq(schema.kuotaAi.tahunAjaranId, taIdB))
    );
    expect(beforeKuota).toHaveLength(1);

    await withTenant(db, SEED_A, async (tx) => {
      await tx.delete(schema.tahunAjaran).where(eq(schema.tahunAjaran.id, taIdB));
    });

    const afterKuota = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.kuotaAi)
        .where(eq(schema.kuotaAi.tahunAjaranId, taIdB))
    );
    expect(afterKuota).toHaveLength(0);
  });

  // 6. CHECK constraints: invalid jenis -> rejected. invalid status ->
  //    rejected. invalid status_verifikasi -> rejected.
  itOrSkip("rejects invalid jenis, status, and status_verifikasi (CHECK)", async () => {
    // invalid jenis -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.permintaanAi)
          .values({
            jenis: "invalid_jenis",
            konteks: {},
            dibuatOleh: "user_check_jenis",
          })
          .returning()
      )
    );

    // invalid status -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.permintaanAi)
          .values({
            jenis: "deskripsi_cp",
            konteks: {},
            status: "invalid_status",
            dibuatOleh: "user_check_status",
          })
          .returning()
      )
    );

    // invalid status_verifikasi -> rejected (needs a permintaan to link)
    const { permintaanId } = await withTenant(db, SEED_A, async (tx) => {
      const [p] = await tx
        .insert(schema.permintaanAi)
        .values({
          jenis: "deskripsi_cp",
          konteks: {},
          dibuatOleh: "user_check_verifikasi",
        })
        .returning();
      return { permintaanId: p.id };
    });

    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.drafAi)
          .values({
            permintaanAiId: permintaanId,
            konten: "x",
            provenance: "model=test;prompt_hash=c;ts=t",
            statusVerifikasi: "invalid_verifikasi",
          })
          .returning()
      )
    );
  });

  // 7. permintaan_terkait_id retry linkage: insert permintaan_2 with
  //    permintaan_terkait_id = permintaan_1.id -> ok. Delete permintaan_1 ->
  //    permintaan_2.terkait_id set NULL (ON DELETE SET NULL).
  itOrSkip("permintaan_terkait_id retry: ON DELETE SET NULL", async () => {
    const { permintaan1Id, permintaan2Id } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const [p1] = await tx
          .insert(schema.permintaanAi)
          .values({
            jenis: "deskripsi_cp",
            konteks: { attempt: 1 },
            status: "gagal",
            pesanError: "model timeout",
            dibuatOleh: "user_retry",
          })
          .returning();
        const [p2] = await tx
          .insert(schema.permintaanAi)
          .values({
            jenis: "deskripsi_cp",
            konteks: { attempt: 2 },
            permintaanTerkaitId: p1.id,
            dibuatOleh: "user_retry",
          })
          .returning();
        return { permintaan1Id: p1.id, permintaan2Id: p2.id };
      }
    );

    // sanity: p2.terkait_id points at p1
    const beforeP2 = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.permintaanAi)
        .where(eq(schema.permintaanAi.id, permintaan2Id))
    );
    expect(beforeP2).toHaveLength(1);
    expect(beforeP2[0].permintaanTerkaitId).toBe(permintaan1Id);

    // delete p1 -> p2.terkait_id becomes NULL (ON DELETE SET NULL); p2 stays.
    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .delete(schema.permintaanAi)
        .where(eq(schema.permintaanAi.id, permintaan1Id));
    });

    const afterP2 = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.permintaanAi)
        .where(eq(schema.permintaanAi.id, permintaan2Id))
    );
    expect(afterP2).toHaveLength(1);
    expect(afterP2[0].permintaanTerkaitId).toBeNull();

    // p1 itself is gone
    const afterP1 = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.permintaanAi)
        .where(eq(schema.permintaanAi.id, permintaan1Id))
    );
    expect(afterP1).toHaveLength(0);
  });
});
