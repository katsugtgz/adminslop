import path from "node:path";

import pg, { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "./client";
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

// Tenant seeds — PRIVATE to this file (org_pdS_*). Distinct per peserta-didik
// test file so parallel vitest runs cannot delete each other's seed rows:
// all beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_pdS_a";
const SEED_B = "org_pdS_b";

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

describeOrSkip("peserta didik tables (#7, Wave 1 / T2)", () => {
  let db: Db;

  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(MIG_URL!, path.join(process.cwd(), "src/db/migrations"));

    // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear the
    //    peserta-didik layer in FK-safe order so each run starts clean
    //    (superuser bypasses RLS).
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_pdS_a', 'Satuan Pendidikan A'),
        ('org_pdS_b', 'Satuan Pendidikan B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from kontak_darurat where tenant_id in ('org_pdS_a', 'org_pdS_b');
      delete from wali_peserta_didik where tenant_id in ('org_pdS_a', 'org_pdS_b');
      delete from mutasi_peserta_didik where tenant_id in ('org_pdS_a', 'org_pdS_b');
      delete from riwayat_status_peserta_didik where tenant_id in ('org_pdS_a', 'org_pdS_b');
      delete from peserta_didik where tenant_id in ('org_pdS_a', 'org_pdS_b');
    `);
    await seed.end();

    // 3. App client uses the non-superuser role — RLS enforced.
    db = createDb(APP_URL!).db;
  });

  // 1. CRUD + seed: peserta_didik + riwayat_status round-trip, all fields.
  itOrSkip("inserts and reads back peserta_didik and riwayat_status with all fields", async () => {
    const { pdRow, riwayatRow } = await withTenant(db, SEED_B, async (tx) => {
      const [pdRow] = await tx
        .insert(schema.pesertaDidik)
        .values({
          nama: "Andi Pelajar",
          nisn: "0012345678",
          nis: "PS-001",
          tanggalLahir: "2010-05-15",
          jenisKelamin: "L",
        })
        .returning();
      const [riwayatRow] = await tx
        .insert(schema.riwayatStatusPesertaDidik)
        .values({
          pesertaDidikId: pdRow.id,
          status: "aktif",
          catatan: "terdaftar awal",
          dibuatOleh: "user_seed",
        })
        .returning();
      return { pdRow, riwayatRow };
    });

    expect(pdRow.tenantId).toBe(SEED_B);
    expect(pdRow.nama).toBe("Andi Pelajar");
    expect(pdRow.nisn).toBe("0012345678");
    expect(pdRow.nis).toBe("PS-001");
    expect(pdRow.tanggalLahir).toBe("2010-05-15");
    expect(pdRow.jenisKelamin).toBe("L");
    expect(pdRow.status).toBe("aktif");
    expect(pdRow.id).toBeTruthy();
    expect(pdRow.dibuatPada).toBeTruthy();
    expect(pdRow.diperbaruiPada).toBeTruthy();

    expect(riwayatRow.tenantId).toBe(SEED_B);
    expect(riwayatRow.pesertaDidikId).toBe(pdRow.id);
    expect(riwayatRow.status).toBe("aktif");
    expect(riwayatRow.catatan).toBe("terdaftar awal");
    expect(riwayatRow.dibuatOleh).toBe("user_seed");
    expect(riwayatRow.dibuatPada).toBeTruthy();
  });

  // 2. RLS isolation: tenant A sees zero of tenant B's rows across all 5 tables.
  itOrSkip("tenant A cannot see tenant B's rows (RLS isolation, all 5 tables)", async () => {
    await withTenant(db, SEED_B, async (tx) => {
      const [pd] = await tx
        .insert(schema.pesertaDidik)
        .values({
          nama: "Isolasi B",
          tanggalLahir: "2011-01-01",
          jenisKelamin: "P",
        })
        .returning();
      await tx.insert(schema.riwayatStatusPesertaDidik).values({
        pesertaDidikId: pd.id,
        status: "aktif",
      });
      await tx.insert(schema.mutasiPesertaDidik).values({
        pesertaDidikId: pd.id,
        arah: "masuk",
        tanggal: "2024-07-01",
      });
      await tx.insert(schema.waliPesertaDidik).values({
        pesertaDidikId: pd.id,
        nama: "Wali B",
      });
      await tx.insert(schema.kontakDarurat).values({
        pesertaDidikId: pd.id,
        nama: "Kontak B",
      });
    });

    const [aPd, aRiwayat, aMutasi, aWali, aKontak] = await Promise.all([
      withTenant(db, SEED_A, (tx) => tx.select().from(schema.pesertaDidik)),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.riwayatStatusPesertaDidik)
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.mutasiPesertaDidik)
      ),
      withTenant(db, SEED_A, (tx) =>
        tx.select().from(schema.waliPesertaDidik)
      ),
      withTenant(db, SEED_A, (tx) => tx.select().from(schema.kontakDarurat)),
    ]);
    expect(aPd).toHaveLength(0);
    expect(aRiwayat).toHaveLength(0);
    expect(aMutasi).toHaveLength(0);
    expect(aWali).toHaveLength(0);
    expect(aKontak).toHaveLength(0);
  });

  // 3. RLS write isolation: FORCED WITH CHECK rejects a forged tenant_id literal.
  itOrSkip("forged tenant_id literal is rejected by WITH CHECK (FORCE RLS)", async () => {
    // GUC is SEED_B; an explicit SEED_A literal must be rejected by the policy's
    // WITH CHECK — proves FORCE ROW LEVEL SECURITY is on (owner would otherwise
    // bypass, and a non-FORCED policy would not check writes). RLS WITH CHECK
    // failures surface as SQLSTATE 42501 (insufficient_privilege), not a 23xxx
    // constraint violation, so this is an RLS-policy assertion (mirrors
    // akses.test.ts), not a CHECK/UNIQUE helper case.
    await expect(
      withTenant(db, SEED_B, (tx) =>
        tx
          .insert(schema.pesertaDidik)
          .values({
            nama: "FORGED",
            tanggalLahir: "2010-01-01",
            jenisKelamin: "L",
            tenantId: SEED_A,
          })
          .returning()
      )
    ).rejects.toThrow();
  });

  // 4. Status cache (denormalized): cache on peserta_didik + append-only history
  //    coexist. AC#2: a status change appends history; it never deletes it.
  itOrSkip("denormalized status cache and append-only history coexist", async () => {
    const pdId = await withTenant(db, SEED_B, async (tx) => {
      const [pd] = await tx
        .insert(schema.pesertaDidik)
        .values({
          nama: "Cache Status",
          tanggalLahir: "2009-03-03",
          jenisKelamin: "P",
        })
        .returning();
      expect(pd.status).toBe("aktif");

      // append history row for the new status...
      await tx.insert(schema.riwayatStatusPesertaDidik).values({
        pesertaDidikId: pd.id,
        status: "pindah",
        catatan: "pindah ke sekolah lain",
      });
      // ...and mirror it into the denormalized cache (atomic pairing done in the
      // repo layer T3; here we assert the DB-level shape holds both rows).
      await tx
        .update(schema.pesertaDidik)
        .set({ status: "pindah" })
        .where(eq(schema.pesertaDidik.id, pd.id));
      return pd.id;
    });

    const [cache] = await withTenant(db, SEED_B, (tx) =>
      tx.select().from(schema.pesertaDidik).where(eq(schema.pesertaDidik.id, pdId))
    );
    const history = await withTenant(db, SEED_B, (tx) =>
      tx
        .select()
        .from(schema.riwayatStatusPesertaDidik)
        .where(eq(schema.riwayatStatusPesertaDidik.pesertaDidikId, pdId))
    );

    expect(cache.status).toBe("pindah");
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("pindah");
  });

  // 5. FK CASCADE: deleting a peserta_didik removes all child rows.
  itOrSkip("deleting peserta_didik cascades to riwayat, mutasi, wali, kontak", async () => {
    const pdId = await withTenant(db, SEED_B, async (tx) => {
      const [pd] = await tx
        .insert(schema.pesertaDidik)
        .values({
          nama: "Cascade Target",
          tanggalLahir: "2012-02-02",
          jenisKelamin: "L",
        })
        .returning();
      await tx.insert(schema.riwayatStatusPesertaDidik).values({
        pesertaDidikId: pd.id,
        status: "aktif",
      });
      await tx.insert(schema.mutasiPesertaDidik).values({
        pesertaDidikId: pd.id,
        arah: "masuk",
        tanggal: "2024-01-01",
      });
      await tx.insert(schema.waliPesertaDidik).values({
        pesertaDidikId: pd.id,
        nama: "Wali Cascade",
      });
      await tx.insert(schema.kontakDarurat).values({
        pesertaDidikId: pd.id,
        nama: "Kontak Cascade",
      });
      return pd.id;
    });

    // sanity: children exist before the delete
    const beforeRiwayat = await withTenant(db, SEED_B, (tx) =>
      tx
        .select()
        .from(schema.riwayatStatusPesertaDidik)
        .where(eq(schema.riwayatStatusPesertaDidik.pesertaDidikId, pdId))
    );
    expect(beforeRiwayat).toHaveLength(1);

    // FK referential action fires under the table owner and bypasses RLS.
    await withTenant(db, SEED_B, async (tx) => {
      await tx
        .delete(schema.pesertaDidik)
        .where(eq(schema.pesertaDidik.id, pdId));
    });

    const [afterRiwayat, afterMutasi, afterWali, afterKontak] =
      await Promise.all([
        withTenant(db, SEED_B, (tx) =>
          tx
            .select()
            .from(schema.riwayatStatusPesertaDidik)
            .where(eq(schema.riwayatStatusPesertaDidik.pesertaDidikId, pdId))
        ),
        withTenant(db, SEED_B, (tx) =>
          tx
            .select()
            .from(schema.mutasiPesertaDidik)
            .where(eq(schema.mutasiPesertaDidik.pesertaDidikId, pdId))
        ),
        withTenant(db, SEED_B, (tx) =>
          tx
            .select()
            .from(schema.waliPesertaDidik)
            .where(eq(schema.waliPesertaDidik.pesertaDidikId, pdId))
        ),
        withTenant(db, SEED_B, (tx) =>
          tx
            .select()
            .from(schema.kontakDarurat)
            .where(eq(schema.kontakDarurat.pesertaDidikId, pdId))
        ),
      ]);
    expect(afterRiwayat).toHaveLength(0);
    expect(afterMutasi).toHaveLength(0);
    expect(afterWali).toHaveLength(0);
    expect(afterKontak).toHaveLength(0);
  });

  // 6. Partial unique index: multiple NULL NISN allowed; duplicate NISN rejected.
  itOrSkip("allows multiple NULL nisn; forbids two students sharing one nisn", async () => {
    // two NULL NISN rows — both allowed
    await withTenant(db, SEED_B, async (tx) => {
      await tx.insert(schema.pesertaDidik).values({
        nama: "NISN Null 1",
        tanggalLahir: "2013-01-01",
        jenisKelamin: "L",
      });
      await tx.insert(schema.pesertaDidik).values({
        nama: "NISN Null 2",
        tanggalLahir: "2013-02-02",
        jenisKelamin: "P",
      });
    });

    // first student with a given NISN — allowed
    await withTenant(db, SEED_B, async (tx) => {
      await tx.insert(schema.pesertaDidik).values({
        nama: "NISN Dup 1",
        nisn: "0099999999",
        tanggalLahir: "2013-03-03",
        jenisKelamin: "L",
      });
    });

    // a second student with the same NISN — rejected by the partial unique index
    await expectConstraintViolation(
      withTenant(db, SEED_B, (tx) =>
        tx
          .insert(schema.pesertaDidik)
          .values({
            nama: "NISN Dup 2",
            nisn: "0099999999",
            tanggalLahir: "2013-04-04",
            jenisKelamin: "P",
          })
          .returning()
      )
    );
  });

  // 7. CHECK jenis_kelamin: 'L'/'P' accepted, 'X' rejected.
  itOrSkip("rejects peserta_didik with invalid jenis_kelamin (CHECK)", async () => {
    await expectConstraintViolation(
      withTenant(db, SEED_B, (tx) =>
        tx.insert(schema.pesertaDidik).values({
          nama: "Bad JK",
          tanggalLahir: "2010-01-01",
          jenisKelamin: "X",
        })
      )
    );
  });

  // 8. CHECK status: valid values accepted, 'xyz' rejected.
  itOrSkip("rejects peserta_didik with invalid status (CHECK)", async () => {
    await expectConstraintViolation(
      withTenant(db, SEED_B, (tx) =>
        tx.insert(schema.pesertaDidik).values({
          nama: "Bad Status",
          tanggalLahir: "2010-01-01",
          jenisKelamin: "L",
          status: "xyz",
        })
      )
    );
  });

  // 9. CHECK arah: 'masuk'/'keluar' accepted, 'xxx' rejected.
  itOrSkip("rejects mutasi with invalid arah (CHECK)", async () => {
    const pdId = await withTenant(db, SEED_B, async (tx) => {
      const [pd] = await tx
        .insert(schema.pesertaDidik)
        .values({
          nama: "Mutasi Host",
          tanggalLahir: "2010-01-01",
          jenisKelamin: "L",
        })
        .returning();
      return pd.id;
    });

    await expectConstraintViolation(
      withTenant(db, SEED_B, (tx) =>
        tx.insert(schema.mutasiPesertaDidik).values({
          pesertaDidikId: pdId,
          arah: "xxx",
          tanggal: "2024-01-01",
        })
      )
    );
  });
});
