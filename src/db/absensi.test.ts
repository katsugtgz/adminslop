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

// Tenant seeds — PRIVATE to this file (org_AB_*). Distinct per absensi test file
// so parallel vitest runs cannot delete each other's seed rows: all beforeAll
// DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_AB_a";
const SEED_B = "org_AB_b";

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

// Monotonic counter for unique literals across tests. tingkat has UNIQUE
// (tenant, urutan) and (tenant, nama), so urutan must be distinct across cases
// sharing org_AB_a. peserta_didik has a partial UNIQUE (tenant, nisn) index;
// seeding distinct nisn keeps that satisfied too.
let _seq = 0;
const seq = (): number => ++_seq;

let db: Db;

describeOrSkip("absensi_harian table (#15, Wave 1 / T1)", () => {
  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(
      MIG_URL!,
      path.join(process.cwd(), "src/db/migrations")
    );

    // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear the
    //    absensi layer + its FK parents in FK-safe order so each run starts
    //    clean (superuser bypasses RLS). Children first. The peserta_didik /
    //    rombongan_belajar / tingkat / tahun_ajaran parents carry per-tenant
    //    UNIQUE constraints with stable per-case tags, so they MUST be cleared
    //    or a re-run hits duplicate-key violations.
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_AB_a', 'Satuan Pendidikan AB A'),
        ('org_AB_b', 'Satuan Pendidikan AB B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from absensi_harian      where tenant_id in ('org_AB_a', 'org_AB_b');
      delete from peserta_didik       where tenant_id in ('org_AB_a', 'org_AB_b');
      delete from rombongan_belajar   where tenant_id in ('org_AB_a', 'org_AB_b');
      delete from tingkat             where tenant_id in ('org_AB_a', 'org_AB_b');
      delete from tahun_ajaran        where tenant_id in ('org_AB_a', 'org_AB_b');
    `);
    await seed.end();

    // 3. Client: app_user so RLS is enforced (no GLOBAL table dependency here).
    db = createDb(APP_URL!).db;
  });

  afterAll(async () => {
    await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
  });

  /**
   * Seed the tenant-scoped FK parents for an absensi row under `tenantId`:
   * tahun_ajaran, tingkat, rombongan_belajar, peserta_didik. Distinct `tag` +
   * monotonic urutan/nisn keep the per-tenant UNIQUE constraints satisfied
   * across cases.
   */
  async function seedParents(tx: Tx, tenantId: string, tag: string) {
    const [ta] = await tx
      .insert(schema.tahunAjaran)
      .values({ nama: `TA ${tag}`, aktif: false })
      .returning();
    const [tk] = await tx
      .insert(schema.tingkat)
      .values({ nama: `Tingkat ${tag} ${tenantId}`, urutan: seq() + 3000 })
      .returning();
    const [rb] = await tx
      .insert(schema.rombonganBelajar)
      .values({ nama: `Rombel ${tag}`, tingkatId: tk.id, tahunAjaranId: ta.id })
      .returning();
    const [pd] = await tx
      .insert(schema.pesertaDidik)
      .values({
        nama: `Peserta Didik ${tag}`,
        nisn: `AB${seq()}`,
        tanggalLahir: "2015-01-01",
        jenisKelamin: "L",
      })
      .returning();
    return { ta, tk, rb, pd };
  }

  // 1. CRUD: insert with status='hadir', metode='manual' -> ok; read back every
  //    field.
  itOrSkip("inserts absensi_harian (manual hadir); reads it back", async () => {
    const { row, pdId, rbId } = await withTenant(db, SEED_A, async (tx) => {
      const { rb, pd } = await seedParents(tx, SEED_A, "crud");
      const [row] = await tx
        .insert(schema.absensiHarian)
        .values({
          pesertaDidikId: pd.id,
          rombonganBelajarId: rb.id,
          tanggal: "2026-06-26",
          statusKehadiran: "hadir",
          metodeInput: "manual",
          dibuatOleh: "user_guru",
        })
        .returning();
      return { row, pdId: pd.id, rbId: rb.id };
    });

    expect(row.tenantId).toBe(SEED_A);
    expect(row.pesertaDidikId).toBe(pdId);
    expect(row.rombonganBelajarId).toBe(rbId);
    expect(row.tanggal).toBe("2026-06-26");
    expect(row.statusKehadiran).toBe("hadir");
    expect(row.metodeInput).toBe("manual");
    expect(row.sumberQr).toBeNull();
    expect(row.dibuatOleh).toBe("user_guru");
    expect(row.dibuatPada).toBeTruthy();
    expect(row.diperbaruiPada).toBeTruthy();
  });

  // 2. UNIQUE (tenant, peserta_didik, tanggal): a second attendance row for the
  //    SAME student on the SAME date -> rejected. A different date for the same
  //    student -> ok.
  itOrSkip("rejects a second absensi for same peserta_didik + tanggal; allows a different date", async () => {
    const { pdId, rbId } = await withTenant(db, SEED_A, async (tx) => {
      const { rb, pd } = await seedParents(tx, SEED_A, "unique");
      await tx.insert(schema.absensiHarian).values({
        pesertaDidikId: pd.id,
        rombonganBelajarId: rb.id,
        tanggal: "2026-06-26",
        statusKehadiran: "hadir",
        metodeInput: "manual",
        dibuatOleh: "user_guru",
      });
      return { pdId: pd.id, rbId: rb.id };
    });

    // same peserta_didik + tanggal -> rejected (UNIQUE)
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.absensiHarian)
          .values({
            pesertaDidikId: pdId,
            rombonganBelajarId: rbId,
            tanggal: "2026-06-26",
            statusKehadiran: "alpa",
            metodeInput: "manual",
            dibuatOleh: "user_guru",
          })
          .returning()
      )
    );

    // same peserta_didik but a DIFFERENT date -> ok
    const [otherDate] = await withTenant(db, SEED_A, (tx) =>
      tx
        .insert(schema.absensiHarian)
        .values({
          pesertaDidikId: pdId,
          rombonganBelajarId: rbId,
          tanggal: "2026-06-27",
          statusKehadiran: "sakit",
          metodeInput: "manual",
          dibuatOleh: "user_guru",
        })
        .returning()
    );
    expect(otherDate.tanggal).toBe("2026-06-27");
    expect(otherDate.statusKehadiran).toBe("sakit");
  });

  // 3. CHECK constraints: invalid status_kehadiran -> rejected; invalid
  //    metode_input -> rejected.
  itOrSkip("rejects invalid status_kehadiran and invalid metode_input (CHECK)", async () => {
    const { pdId, rbId } = await withTenant(db, SEED_A, async (tx) => {
      const { rb, pd } = await seedParents(tx, SEED_A, "check");
      return { pdId: pd.id, rbId: rb.id };
    });

    // invalid status_kehadiran -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.absensiHarian)
          .values({
            pesertaDidikId: pdId,
            rombonganBelajarId: rbId,
            tanggal: "2026-06-26",
            statusKehadiran: "terlambat",
            metodeInput: "manual",
            dibuatOleh: "user_guru",
          })
          .returning()
      )
    );

    // invalid metode_input -> rejected
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.absensiHarian)
          .values({
            pesertaDidikId: pdId,
            rombonganBelajarId: rbId,
            tanggal: "2026-06-26",
            statusKehadiran: "hadir",
            metodeInput: "rfid",
            dibuatOleh: "user_guru",
          })
          .returning()
      )
    );
  });

  // 4. QR method: insert metode='qr', sumber_qr='session-xyz' -> ok; UPDATE to
  //    status='izin' -> ok (AC#3: QR assists but attendance is CORRECTABLE —
  //    presence of sumber_qr does NOT lock the record).
  itOrSkip("inserts a QR-sourced absensi and allows correction (AC#3 correctable)", async () => {
    const { id, pdId } = await withTenant(db, SEED_A, async (tx) => {
      const { rb, pd } = await seedParents(tx, SEED_A, "qr");
      const [row] = await tx
        .insert(schema.absensiHarian)
        .values({
          pesertaDidikId: pd.id,
          rombonganBelajarId: rb.id,
          tanggal: "2026-06-26",
          statusKehadiran: "hadir",
          metodeInput: "qr",
          sumberQr: "session-xyz",
          dibuatOleh: "user_guru",
        })
        .returning();
      return { id: row.id, pdId: pd.id };
    });

    expect(pdId).toBeTruthy();

    // AC#3: a QR-sourced record is still correctable via UPDATE (not locked).
    const [updated] = await withTenant(db, SEED_A, (tx) =>
      tx
        .update(schema.absensiHarian)
        .set({ statusKehadiran: "izin", catatan: "Diperbaiki manual" })
        .where(eq(schema.absensiHarian.id, id))
        .returning()
    );
    expect(updated.statusKehadiran).toBe("izin");
    expect(updated.catatan).toBe("Diperbaiki manual");
    expect(updated.sumberQr).toBe("session-xyz"); // sumber_qr retained
  });

  // 5. RLS isolation: tenant B cannot see tenant A's absensi rows.
  //    Asserts on the inserted id (not "B is empty") so B's own legitimate data
  //    does not produce a false failure.
  itOrSkip("tenant B cannot see tenant A's absensi_harian (RLS)", async () => {
    const { id } = await withTenant(db, SEED_A, async (tx) => {
      const { rb, pd } = await seedParents(tx, SEED_A, "rls");
      const [row] = await tx
        .insert(schema.absensiHarian)
        .values({
          pesertaDidikId: pd.id,
          rombonganBelajarId: rb.id,
          tanggal: "2026-06-26",
          statusKehadiran: "hadir",
          metodeInput: "manual",
          dibuatOleh: "user_guru",
        })
        .returning();
      return { id: row.id };
    });

    // tenant B reads by id -> 0 rows (RLS hides A's rows)
    const bRows = await withTenant(db, SEED_B, (tx) =>
      tx.select().from(schema.absensiHarian).where(eq(schema.absensiHarian.id, id))
    );
    expect(bRows).toHaveLength(0);

    // sanity: tenant A itself CAN see its own row (proves the insert worked and
    // the empty read from B is due to RLS, not a failed insert).
    const aRows = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.absensiHarian).where(eq(schema.absensiHarian.id, id))
    );
    expect(aRows).toHaveLength(1);
  });

  // 6. FK CASCADE: deleting peserta_didik removes its absensi; deleting
  //    rombongan_belajar removes its absensi.
  itOrSkip("cascades peserta_didik -> absensi and rombongan_belajar -> absensi", async () => {
    // Tree A: peserta_didik -> absensi cascade.
    const { idA, pdIdA } = await withTenant(db, SEED_A, async (tx) => {
      const { rb, pd } = await seedParents(tx, SEED_A, "casc-pd");
      const [row] = await tx
        .insert(schema.absensiHarian)
        .values({
          pesertaDidikId: pd.id,
          rombonganBelajarId: rb.id,
          tanggal: "2026-06-26",
          statusKehadiran: "hadir",
          metodeInput: "manual",
          dibuatOleh: "user_guru",
        })
        .returning();
      return { idA: row.id, pdIdA: pd.id };
    });

    // sanity: row exists before the delete
    const beforeByPd = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.absensiHarian).where(eq(schema.absensiHarian.id, idA))
    );
    expect(beforeByPd).toHaveLength(1);

    await withTenant(db, SEED_A, async (tx) => {
      await tx.delete(schema.pesertaDidik).where(eq(schema.pesertaDidik.id, pdIdA));
    });

    const afterByPd = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.absensiHarian).where(eq(schema.absensiHarian.id, idA))
    );
    expect(afterByPd).toHaveLength(0);

    // Tree B: rombongan_belajar -> absensi cascade.
    const { idB, rbIdB } = await withTenant(db, SEED_A, async (tx) => {
      const { rb, pd } = await seedParents(tx, SEED_A, "casc-rb");
      const [row] = await tx
        .insert(schema.absensiHarian)
        .values({
          pesertaDidikId: pd.id,
          rombonganBelajarId: rb.id,
          tanggal: "2026-06-26",
          statusKehadiran: "hadir",
          metodeInput: "manual",
          dibuatOleh: "user_guru",
        })
        .returning();
      return { idB: row.id, rbIdB: rb.id };
    });

    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .delete(schema.rombonganBelajar)
        .where(eq(schema.rombonganBelajar.id, rbIdB));
    });

    const afterByRb = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.absensiHarian).where(eq(schema.absensiHarian.id, idB))
    );
    expect(afterByRb).toHaveLength(0);
  });
});
