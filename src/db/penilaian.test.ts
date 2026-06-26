import path from "node:path";

import pg, { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "./client";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

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

// Tenant seeds — PRIVATE to this file (org_PN_*). Distinct per penilaian test
// file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_PN_a";
const SEED_B = "org_PN_b";

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

// Monotonic counter for unique literals across tests. mata_pelajaran is GLOBAL
// (UNIQUE nama/kode, no tenant isolation) so distinct names avoid cross-test
// collisions. tingkat has UNIQUE (tenant, urutan) and (tenant, nama), so urutan
// must be distinct across cases sharing org_PN_a.
let _seq = 0;
const seq = (): number => ++_seq;

// Insert/DELETE on GLOBAL mata_pelajaran run as the migrator superuser
// (app_user has SELECT only — ADR 0001). Tenant-scoped writes use the app
// client (`db`) inside `withTenant` so RLS is enforced.
let migDb: Db;
let db: Db;

describeOrSkip("penilaian + nilai tables (#11, Wave 1 / T1)", () => {
  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(
      MIG_URL!,
      path.join(process.cwd(), "src/db/migrations")
    );

    // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear the
    //    full penilaian layer + its FK parents in FK-safe order so each run
    //    starts clean (superuser bypasses RLS). Children first. The beban /
    //    rombel / tingkat / TA / ptk / peserta_didik parents carry per-tenant
    //    UNIQUE constraints with stable per-case tags, so they MUST be cleared
    //    or a re-run hits duplicate-key violations. The GLOBAL mata_pelajaran
    //    clear is scoped to this file's kode prefix (PN-MP-*) and runs AFTER
    //    beban_mengajar so the ON DELETE RESTRICT FK cannot fire.
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_PN_a', 'Satuan Pendidikan PN A'),
        ('org_PN_b', 'Satuan Pendidikan PN B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from nilai_peserta_didik  where tenant_id in ('org_PN_a', 'org_PN_b');
      delete from penilaian            where tenant_id in ('org_PN_a', 'org_PN_b');
      delete from komponen_nilai       where tenant_id in ('org_PN_a', 'org_PN_b');
      delete from beban_mengajar       where tenant_id in ('org_PN_a', 'org_PN_b');
      delete from peserta_didik        where tenant_id in ('org_PN_a', 'org_PN_b');
      delete from rombongan_belajar    where tenant_id in ('org_PN_a', 'org_PN_b');
      delete from tingkat              where tenant_id in ('org_PN_a', 'org_PN_b');
      delete from tahun_ajaran         where tenant_id in ('org_PN_a', 'org_PN_b');
      delete from ptk                  where tenant_id in ('org_PN_a', 'org_PN_b');
    `);
    await seed.query(`delete from mata_pelajaran where kode like 'PN-MP-%';`);
    await seed.end();

    // 3. Clients: migrator (GLOBAL mata_pelajaran writes) + app_user (RLS).
    migDb = createDb(MIG_URL!).db;
    db = createDb(APP_URL!).db;
  });

  /** Seed a GLOBAL mata_pelajaran with a unique nama (migDb — SELECT-only for app). */
  async function seedMataPelajaran(tag: string) {
    const [mp] = await migDb
      .insert(schema.mataPelajaran)
      .values({ kode: `PN-MP-${seq()}`, nama: `Penilaian Mapel ${tag}` })
      .returning();
    return mp;
  }

  /**
   * Seed the tenant-scoped FK parents for a beban_mengajar under `tenantId`:
   * tahun_ajaran, tingkat, rombongan_belajar, ptk. Distinct `tag` + monotonic
   * urutan keep the per-tenant UNIQUE constraints satisfied across cases.
   */
  async function seedBebanParents(tx: Tx, tenantId: string, tag: string) {
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
    const [p] = await tx
      .insert(schema.ptk)
      .values({ nama: `PTK ${tag}`, jenis: "pendidik" })
      .returning();
    return { ta, tk, rb, p };
  }

  /** Seed a beban_mengajar (with a fresh GLOBAL mata_pelajaran) under `tenantId`. */
  async function seedBeban(tx: Tx, tenantId: string, tag: string) {
    const mp = await seedMataPelajaran(tag);
    const { ta, tk: _tk, rb, p } = await seedBebanParents(tx, tenantId, tag);
    const [beban] = await tx
      .insert(schema.bebanMengajar)
      .values({
        ptkId: p.id,
        mataPelajaranId: mp.id,
        rombonganBelajarId: rb.id,
        tahunAjaranId: ta.id,
        semester: "ganjil",
      })
      .returning();
    return { beban, mp, ta, rb, p };
  }

  /** Seed a peserta_didik under `tenantId`. Distinct nama per tag. */
  async function seedPesertaDidik(tx: Tx, tag: string) {
    const [pd] = await tx
      .insert(schema.pesertaDidik)
      .values({
        nama: `Peserta ${tag}`,
        tanggalLahir: "2010-01-01",
        jenisKelamin: "L",
      })
      .returning();
    return pd;
  }

  // 1. komponen_nilai CRUD: insert (beban, 'UTS', bobot 30) -> round-trip every
  //    field; a duplicate (beban, nama) -> rejected (UNIQUE).
  itOrSkip("inserts komponen_nilai (bobot 30); reads it back; rejects duplicate (beban, nama)", async () => {
    const { knRow, bebanId } = await withTenant(db, SEED_A, async (tx) => {
      const { beban } = await seedBeban(tx, SEED_A, "kn-crud");
      const [knRow] = await tx
        .insert(schema.komponenNilai)
        .values({ bebanMengajarId: beban.id, nama: "UTS", bobot: "30" })
        .returning();
      return { knRow, bebanId: beban.id };
    });

    expect(knRow.tenantId).toBe(SEED_A);
    expect(knRow.bebanMengajarId).toBe(bebanId);
    expect(knRow.nama).toBe("UTS");
    expect(String(knRow.bobot)).toBe("30");
    expect(knRow.dibuatPada).toBeTruthy();

    // duplicate (beban, nama) -> rejected (UNIQUE)
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.komponenNilai)
          .values({ bebanMengajarId: bebanId, nama: "UTS", bobot: "20" })
          .returning()
      )
    );
  });

  // 2. bobot CHECK: bobot 0 -> rejected; bobot -5 -> rejected; bobot 0.5 -> ok.
  itOrSkip("rejects komponen_nilai bobot 0 and -5; accepts 0.5", async () => {
    const bebanId = await withTenant(db, SEED_A, async (tx) => {
      const { beban } = await seedBeban(tx, SEED_A, "bobot-check");
      return beban.id;
    });

    // bobot 0 -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.komponenNilai)
          .values({ bebanMengajarId: bebanId, nama: "Bobot Nol", bobot: "0" })
          .returning()
      )
    );

    // bobot -5 -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.komponenNilai)
          .values({ bebanMengajarId: bebanId, nama: "Bobot Negatif", bobot: "-5" })
          .returning()
      )
    );

    // bobot 0.5 -> ok
    const [half] = await withTenant(db, SEED_A, (tx) =>
      tx
        .insert(schema.komponenNilai)
        .values({ bebanMengajarId: bebanId, nama: "Bobot Setengah", bobot: "0.5" })
        .returning()
    );
    expect(String(half.bobot)).toBe("0.5");
  });

  // 3. penilaian CRUD: insert (komponen, 'Tugas 1', tanggal) -> round-trip;
  //    a duplicate (komponen, nama) -> rejected (UNIQUE).
  itOrSkip("inserts penilaian (tanggal); reads it back; rejects duplicate (komponen, nama)", async () => {
    const { pRow, komponenId } = await withTenant(db, SEED_A, async (tx) => {
      const { beban } = await seedBeban(tx, SEED_A, "penilaian-crud");
      const [kn] = await tx
        .insert(schema.komponenNilai)
        .values({ bebanMengajarId: beban.id, nama: "Tugas Harian", bobot: "40" })
        .returning();
      const [pRow] = await tx
        .insert(schema.penilaian)
        .values({
          komponenNilaiId: kn.id,
          nama: "Tugas 1",
          tanggal: "2025-09-15",
          dibuatOleh: "user_seed",
        })
        .returning();
      return { pRow, komponenId: kn.id };
    });

    expect(pRow.tenantId).toBe(SEED_A);
    expect(pRow.komponenNilaiId).toBe(komponenId);
    expect(pRow.nama).toBe("Tugas 1");
    expect(pRow.tanggal).toBe("2025-09-15");
    expect(pRow.dibuatOleh).toBe("user_seed");
    expect(pRow.dibuatPada).toBeTruthy();

    // duplicate (komponen, nama) -> rejected (UNIQUE)
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.penilaian)
          .values({ komponenNilaiId: komponenId, nama: "Tugas 1", tanggal: "2025-09-16" })
          .returning()
      )
    );
  });

  // 4. nilai_peserta_didik CRUD: insert (penilaian, pd, nilai 85) -> round-trip;
  //    a duplicate (penilaian, pd) -> rejected (UNIQUE).
  itOrSkip("inserts nilai_peserta_didik (nilai 85); reads it back; rejects duplicate (penilaian, pd)", async () => {
    const { npdRow, penilaianId, pdId } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const { beban } = await seedBeban(tx, SEED_A, "nilai-crud");
        const [kn] = await tx
          .insert(schema.komponenNilai)
          .values({ bebanMengajarId: beban.id, nama: "UAS", bobot: "40" })
          .returning();
        const [p] = await tx
          .insert(schema.penilaian)
          .values({ komponenNilaiId: kn.id, nama: "Ujian Akhir", tanggal: "2025-12-10" })
          .returning();
        const pd = await seedPesertaDidik(tx, "nilai-crud");
        const [npdRow] = await tx
          .insert(schema.nilaiPesertaDidik)
          .values({
            penilaianId: p.id,
            pesertaDidikId: pd.id,
            nilai: "85",
            catatan: "Bagus",
          })
          .returning();
        return { npdRow, penilaianId: p.id, pdId: pd.id };
      }
    );

    expect(npdRow.tenantId).toBe(SEED_A);
    expect(npdRow.penilaianId).toBe(penilaianId);
    expect(npdRow.pesertaDidikId).toBe(pdId);
    expect(String(npdRow.nilai)).toBe("85");
    expect(npdRow.catatan).toBe("Bagus");
    expect(npdRow.dibuatPada).toBeTruthy();

    // duplicate (penilaian, pd) -> rejected (UNIQUE)
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.nilaiPesertaDidik)
          .values({ penilaianId, pesertaDidikId: pdId, nilai: "90" })
          .returning()
      )
    );
  });

  // 5. nilai CHECK: 0 ok; 100 ok; 101 rejected; -1 rejected; NULL ok (absent).
  itOrSkip("nilai CHECK accepts 0, 100, NULL; rejects 101 and -1", async () => {
    const { penilaianId } = await withTenant(db, SEED_A, async (tx) => {
      const { beban } = await seedBeban(tx, SEED_A, "nilai-check");
      const [kn] = await tx
        .insert(schema.komponenNilai)
        .values({ bebanMengajarId: beban.id, nama: "UTS", bobot: "30" })
        .returning();
      const [p] = await tx
        .insert(schema.penilaian)
        .values({ komponenNilaiId: kn.id, nama: "Ujian Tengah", tanggal: "2025-10-05" })
        .returning();
      return { penilaianId: p.id };
    });

    // helper: seed a fresh peserta_didik + insert nilai row for this case
    async function insertNilai(nilai: string | null) {
      return withTenant(db, SEED_A, async (tx) => {
        const pd = await seedPesertaDidik(tx, `nilai-${nilai ?? "null"}-${seq()}`);
        return tx
          .insert(schema.nilaiPesertaDidik)
          .values({ penilaianId, pesertaDidikId: pd.id, nilai })
          .returning();
      });
    }

    // nilai 0 -> ok
    const [zero] = await insertNilai("0");
    expect(String(zero.nilai)).toBe("0");

    // nilai 100 -> ok
    const [hundred] = await insertNilai("100");
    expect(String(hundred.nilai)).toBe("100");

    // nilai 101 -> rejected
    await expectConstraintViolation(insertNilai("101"));

    // nilai -1 -> rejected
    await expectConstraintViolation(insertNilai("-1"));

    // nilai NULL -> ok (absent)
    const [absent] = await insertNilai(null);
    expect(absent.nilai).toBeNull();
  });

  // 6. RLS isolation (all 3 tables): tenant B cannot see tenant A's rows.
  //    Asserts on the inserted ids (not "B is empty") so B's own legitimate
  //    data does not produce a false failure.
  itOrSkip("tenant B cannot see tenant A's komponen_nilai / penilaian / nilai (RLS)", async () => {
    const { knId, pId, npdId } = await withTenant(db, SEED_A, async (tx) => {
      const { beban } = await seedBeban(tx, SEED_A, "rls");
      const [kn] = await tx
        .insert(schema.komponenNilai)
        .values({ bebanMengajarId: beban.id, nama: "UTS", bobot: "30" })
        .returning();
      const [p] = await tx
        .insert(schema.penilaian)
        .values({ komponenNilaiId: kn.id, nama: "Ujian", tanggal: "2025-10-01" })
        .returning();
      const pd = await seedPesertaDidik(tx, "rls");
      const [npd] = await tx
        .insert(schema.nilaiPesertaDidik)
        .values({ penilaianId: p.id, pesertaDidikId: pd.id, nilai: "75" })
        .returning();
      return { knId: kn.id, pId: p.id, npdId: npd.id };
    });

    // tenant B reads by id -> 0 rows each (RLS hides A's rows)
    const [bKn, bP, bNpd] = await Promise.all([
      withTenant(db, SEED_B, (tx) =>
        tx.select().from(schema.komponenNilai).where(eq(schema.komponenNilai.id, knId))
      ),
      withTenant(db, SEED_B, (tx) =>
        tx.select().from(schema.penilaian).where(eq(schema.penilaian.id, pId))
      ),
      withTenant(db, SEED_B, (tx) =>
        tx.select().from(schema.nilaiPesertaDidik).where(eq(schema.nilaiPesertaDidik.id, npdId))
      ),
    ]);
    expect(bKn).toHaveLength(0);
    expect(bP).toHaveLength(0);
    expect(bNpd).toHaveLength(0);

    // sanity: tenant A itself CAN see its own rows (proves the inserts worked
    // and the empty reads from B are due to RLS, not a failed insert).
    const [aKn, aP, aNpd] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.komponenNilai).where(eq(schema.komponenNilai.id, knId))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.penilaian).where(eq(schema.penilaian.id, pId))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.nilaiPesertaDidik).where(eq(schema.nilaiPesertaDidik.id, npdId))
      ),
    ]);
    expect(aKn).toHaveLength(1);
    expect(aP).toHaveLength(1);
    expect(aNpd).toHaveLength(1);
  });

  // 7. FK CASCADE: deleting beban_mengajar rips the whole grading subtree
  //    (komponen_nilai -> penilaian -> nilai_peserta_didik). Deleting
  //    peserta_didik removes its nilai rows across all penilaian.
  itOrSkip("cascades beban_mengajar -> komponen_nilai -> penilaian -> nilai; peserta_didik -> nilai", async () => {
    // Tree A: beban_mengajar cascade rips the whole grading subtree.
    const { bebanIdA, knIdA, pIdA, npdIdA } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const { beban } = await seedBeban(tx, SEED_A, "casc-beban");
        const [kn] = await tx
          .insert(schema.komponenNilai)
          .values({ bebanMengajarId: beban.id, nama: "UTS", bobot: "30" })
          .returning();
        const [p] = await tx
          .insert(schema.penilaian)
          .values({ komponenNilaiId: kn.id, nama: "Ujian", tanggal: "2025-10-01" })
          .returning();
        const pd = await seedPesertaDidik(tx, "casc-beban");
        const [npd] = await tx
          .insert(schema.nilaiPesertaDidik)
          .values({ penilaianId: p.id, pesertaDidikId: pd.id, nilai: "80" })
          .returning();
        return {
          bebanIdA: beban.id,
          knIdA: kn.id,
          pIdA: p.id,
          npdIdA: npd.id,
        };
      }
    );

    // sanity: rows exist before the delete (prove the chain was built)
    const [beforeKn, beforeP, beforeNpd] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.komponenNilai).where(eq(schema.komponenNilai.id, knIdA))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.penilaian).where(eq(schema.penilaian.id, pIdA))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.nilaiPesertaDidik).where(eq(schema.nilaiPesertaDidik.id, npdIdA))
      ),
    ]);
    expect(beforeKn).toHaveLength(1);
    expect(beforeP).toHaveLength(1);
    expect(beforeNpd).toHaveLength(1);

    await withTenant(db, SEED_A, async (tx) => {
      await tx.delete(schema.bebanMengajar).where(eq(schema.bebanMengajar.id, bebanIdA));
    });

    const [afterKn, afterP, afterNpd] = await Promise.all([
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.komponenNilai).where(eq(schema.komponenNilai.id, knIdA))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.penilaian).where(eq(schema.penilaian.id, pIdA))
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.nilaiPesertaDidik).where(eq(schema.nilaiPesertaDidik.id, npdIdA))
      ),
    ]);
    expect(afterKn).toHaveLength(0);
    expect(afterP).toHaveLength(0);
    expect(afterNpd).toHaveLength(0);

    // Tree B: peserta_didik cascade removes its nilai rows across all penilaian.
    const pdIdB = await withTenant(db, SEED_A, async (tx) => {
      const { beban } = await seedBeban(tx, SEED_A, "casc-pd");
      const [kn] = await tx
        .insert(schema.komponenNilai)
        .values({ bebanMengajarId: beban.id, nama: "UAS", bobot: "40" })
        .returning();
      const [p] = await tx
        .insert(schema.penilaian)
        .values({ komponenNilaiId: kn.id, nama: "Ujian Akhir", tanggal: "2025-12-10" })
        .returning();
      const pd = await seedPesertaDidik(tx, "casc-pd");
      await tx.insert(schema.nilaiPesertaDidik).values({
        penilaianId: p.id,
        pesertaDidikId: pd.id,
        nilai: "90",
      });
      return pd.id;
    });

    // sanity: the nilai row exists before the delete
    const beforeNpdByPd = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.nilaiPesertaDidik).where(eq(schema.nilaiPesertaDidik.pesertaDidikId, pdIdB))
    );
    expect(beforeNpdByPd).toHaveLength(1);

    await withTenant(db, SEED_A, async (tx) => {
      await tx.delete(schema.pesertaDidik).where(eq(schema.pesertaDidik.id, pdIdB));
    });

    const afterNpdByPd = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.nilaiPesertaDidik).where(eq(schema.nilaiPesertaDidik.pesertaDidikId, pdIdB))
    );
    expect(afterNpdByPd).toHaveLength(0);
  });
});
