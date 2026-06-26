import path from "node:path";

import pg, { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "./client";
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

/**
 * Assert that `promise` rejects with SQLSTATE 42501 (insufficient_privilege) —
 * the GRANT SELECT ONLY security boundary. app_user may read but never write
 * global reference tables; a write attempt must be denied by Postgres.
 */
async function expectPermissionDenied(
  promise: Promise<unknown>
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const pgErr = unwrapPgError(err);
    if (pgErr) {
      expect(pgErr.code).toBe("42501");
      return;
    }
    throw err;
  }
  throw new Error(
    "expected promise to reject with permission denied (42501), but it resolved"
  );
}

// Monotonic counter for unique literal keys across tests — these are GLOBAL
// tables with no per-run isolation, so distinct names avoid cross-test
// collisions on the UNIQUE constraints (mata_pelajaran.nama, fase.kode, ...).
let _seq = 0;
const uniq = (prefix: string): string => `${prefix}${++_seq}`;

// Insert/DELETE run as the migrator superuser (app_user has SELECT only).
// SELECT-ONLY boundary is proven via the separate app client.
let migDb: Db;
let appDb: Db;

describeOrSkip("kurikulum reference tables (#9, T3 — GLOBAL / ADR 0001)", () => {
  beforeAll(async () => {
    // 1. Migrate as superuser (creates global tables + GRANT SELECT ONLY).
    await runMigrations(
      MIG_URL!,
      path.join(process.cwd(), "src/db/migrations")
    );

    // 2. Clear the 6 global tables in FK-safe order so each run starts clean.
    //    Children first (ATP -> TP -> CP), then parents. No tenant seeding —
    //    these tables carry no tenant_id.
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      delete from alur_tujuan_pembelajaran;
      delete from tujuan_pembelajaran;
      delete from capaian_pembelajaran;
      delete from kurikulum;
      -- beban_mengajar references mata_pelajaran ON DELETE RESTRICT (#10);
      -- must clear before mata_pelajaran deletion in parallel test runs.
      delete from beban_mengajar;
      delete from wali_kelas;
      delete from mata_pelajaran;
      delete from fase;
    `);
    await seed.end();

    // 3. Two clients: migrator (read/write) + app_user (SELECT only).
    migDb = createDb(MIG_URL!).db;
    appDb = createDb(APP_URL!).db;
  });

  /**
   * Seed a full kurikulum -> CP -> TP -> ATP chain (plus the referenced
   * mata_pelajaran + fase). Returns every created row so callers can assert
   * fields and drive FK/UNIQUE tests. All literal keys use `uniq()` so
   * repeated invocations cannot collide on UNIQUE constraints.
   */
  async function seedChain(tag: string) {
    const [k] = await migDb
      .insert(schema.kurikulum)
      .values({
        nama: uniq("Kurikulum-"),
        versi: "2022",
        deskripsi: "deskripsi " + tag,
        sumber: "Kemdikbud",
        sumberUrl: "https://kurikulum.kemdikbud.go.id",
      })
      .returning();
    const [mp] = await migDb
      .insert(schema.mataPelajaran)
      .values({ kode: uniq("MP-"), nama: uniq("Mata Pelajaran-") })
      .returning();
    const [f] = await migDb
      .insert(schema.fase)
      .values({
        kode: uniq("F-"),
        nama: "Fase " + tag,
        rentangKelas: "Kelas 1-2",
        jenjang: "SD",
      })
      .returning();
    const [cp] = await migDb
      .insert(schema.capaianPembelajaran)
      .values({
        kurikulumId: k.id,
        mataPelajaranId: mp.id,
        faseId: f.id,
        kode: uniq("CP-"),
        elemen: "elemen " + tag,
        deskripsi: "Capaian " + tag,
        sumber: "Kemdikbud",
      })
      .returning();
    const [tp] = await migDb
      .insert(schema.tujuanPembelajaran)
      .values({
        capaianPembelajaranId: cp.id,
        urutan: 1,
        deskripsi: "Tujuan " + tag,
        sumber: "Kemdikbud",
      })
      .returning();
    const [atp] = await migDb
      .insert(schema.alurTujuanPembelajaran)
      .values({
        tujuanPembelajaranId: tp.id,
        urutan: 1,
        deskripsi: "Alur " + tag,
        sumber: "Kemdikbud",
      })
      .returning();
    return { k, mp, f, cp, tp, atp };
  }

  // 1. CRUD: insert the full chain, read every field back.
  itOrSkip("inserts and reads back kurikulum, mata_pelajaran, fase, CP, TP, ATP", async () => {
    const { k, mp, f, cp, tp, atp } = await seedChain("crud");

    const [kRead] = await migDb
      .select()
      .from(schema.kurikulum)
      .where(eq(schema.kurikulum.id, k.id));
    expect(kRead.nama).toBe(k.nama);
    expect(kRead.versi).toBe("2022");
    expect(kRead.deskripsi).toBe("deskripsi crud");
    expect(kRead.sumber).toBe("Kemdikbud");
    expect(kRead.sumberUrl).toBe("https://kurikulum.kemdikbud.go.id");
    expect(kRead.tanggalAmbil).toBeTruthy();
    expect(kRead.disetujuiOleh).toBeNull();
    expect(kRead.statusPersetujuan).toBe("memerlukan_tinjauan");
    expect(kRead.dibuatPada).toBeTruthy();

    const [mpRead] = await migDb
      .select()
      .from(schema.mataPelajaran)
      .where(eq(schema.mataPelajaran.id, mp.id));
    expect(mpRead.kode).toBe(mp.kode);
    expect(mpRead.nama).toBe(mp.nama);

    const [fRead] = await migDb
      .select()
      .from(schema.fase)
      .where(eq(schema.fase.id, f.id));
    expect(fRead.kode).toBe(f.kode);
    expect(fRead.nama).toBe("Fase crud");
    expect(fRead.rentangKelas).toBe("Kelas 1-2");
    expect(fRead.jenjang).toBe("SD");

    const [cpRead] = await migDb
      .select()
      .from(schema.capaianPembelajaran)
      .where(eq(schema.capaianPembelajaran.id, cp.id));
    expect(cpRead.kurikulumId).toBe(k.id);
    expect(cpRead.mataPelajaranId).toBe(mp.id);
    expect(cpRead.faseId).toBe(f.id);
    expect(cpRead.kode).toBe(cp.kode);
    expect(cpRead.elemen).toBe("elemen crud");
    expect(cpRead.deskripsi).toBe("Capaian crud");
    expect(cpRead.sumber).toBe("Kemdikbud");
    expect(cpRead.catatan).toBeNull();

    const [tpRead] = await migDb
      .select()
      .from(schema.tujuanPembelajaran)
      .where(eq(schema.tujuanPembelajaran.id, tp.id));
    expect(tpRead.capaianPembelajaranId).toBe(cp.id);
    expect(tpRead.urutan).toBe(1);
    expect(tpRead.deskripsi).toBe("Tujuan crud");
    expect(tpRead.sumber).toBe("Kemdikbud");
    expect(tpRead.catatan).toBeNull();

    const [atpRead] = await migDb
      .select()
      .from(schema.alurTujuanPembelajaran)
      .where(eq(schema.alurTujuanPembelajaran.id, atp.id));
    expect(atpRead.tujuanPembelajaranId).toBe(tp.id);
    expect(atpRead.urutan).toBe(1);
    expect(atpRead.deskripsi).toBe("Alur crud");
    expect(atpRead.sumber).toBe("Kemdikbud");
    expect(atpRead.catatan).toBeNull();
  });

  // 2. GRANT SELECT ONLY — the SECURITY BOUNDARY for global tables. app_user
  //    (DATABASE_URL) may SELECT but any INSERT must be denied (42501).
  itOrSkip("app_user can SELECT but cannot INSERT (GRANT SELECT ONLY boundary)", async () => {
    // SELECT succeeds — app_user has read access.
    const rows = await appDb.select().from(schema.kurikulum).limit(1);
    expect(Array.isArray(rows)).toBe(true);

    // INSERT as app_user -> permission denied. This proves the GRANT SELECT
    // ONLY constraint is the security boundary (RLS does not apply here).
    await expectPermissionDenied(
      appDb.insert(schema.kurikulum).values({
        nama: uniq("Should-Fail-"),
        versi: "x",
        sumber: "test",
      })
    );

    // Same boundary on a child table (capaian_pembelajaran).
    await expectPermissionDenied(
      appDb.insert(schema.mataPelajaran).values({ nama: uniq("No-Write-") })
    );
  });

  // 3. UNIQUE constraints across the four unique keys.
  itOrSkip("rejects duplicate CP(kur,mp,fase,kode), TP(cp,urutan), mata_pelajaran.nama, fase.kode", async () => {
    const { k, mp, f, cp } = await seedChain("unique");

    // duplicate (kurikulum_id, mata_pelajaran_id, fase_id, kode)
    await expectConstraintViolation(
      migDb.insert(schema.capaianPembelajaran).values({
        kurikulumId: k.id,
        mataPelajaranId: mp.id,
        faseId: f.id,
        kode: cp.kode,
        deskripsi: "dup CP",
      })
    );

    // duplicate (capaian_pembelajaran_id, urutan) — seedChain inserted urutan 1
    await expectConstraintViolation(
      migDb.insert(schema.tujuanPembelajaran).values({
        capaianPembelajaranId: cp.id,
        urutan: 1,
        deskripsi: "dup TP",
      })
    );

    // duplicate mata_pelajaran.nama
    await expectConstraintViolation(
      migDb.insert(schema.mataPelajaran).values({ nama: mp.nama })
    );

    // duplicate fase.kode
    await expectConstraintViolation(
      migDb.insert(schema.fase).values({ kode: f.kode, nama: "dup fase" })
    );

    // duplicate mata_pelajaran.kode (column-level UNIQUE; kode is nullable but
    // a repeated non-null value must be rejected)
    await expectConstraintViolation(
      migDb.insert(schema.mataPelajaran).values({
        kode: mp.kode,
        nama: uniq("Dup-Kode-Nama-"),
      })
    );
  });

  // 4. FK CASCADE: deleting kurikulum removes its CP, which removes their TP,
  //    which removes their ATP. mata_pelajaran + fase are NOT cascaded.
  itOrSkip("deleting kurikulum cascades CP -> TP -> ATP; leaves mata_pelajaran + fase", async () => {
    const { k, mp, f, cp, tp, atp } = await seedChain("cascade");

    // sanity: all six rows exist before the delete
    const [cpBefore] = await migDb
      .select()
      .from(schema.capaianPembelajaran)
      .where(eq(schema.capaianPembelajaran.id, cp.id));
    const [tpBefore] = await migDb
      .select()
      .from(schema.tujuanPembelajaran)
      .where(eq(schema.tujuanPembelajaran.id, tp.id));
    const [atpBefore] = await migDb
      .select()
      .from(schema.alurTujuanPembelajaran)
      .where(eq(schema.alurTujuanPembelajaran.id, atp.id));
    expect(cpBefore).toBeTruthy();
    expect(tpBefore).toBeTruthy();
    expect(atpBefore).toBeTruthy();

    await migDb.delete(schema.kurikulum).where(eq(schema.kurikulum.id, k.id));

    const [cpAfter] = await migDb
      .select()
      .from(schema.capaianPembelajaran)
      .where(eq(schema.capaianPembelajaran.id, cp.id));
    const [tpAfter] = await migDb
      .select()
      .from(schema.tujuanPembelajaran)
      .where(eq(schema.tujuanPembelajaran.id, tp.id));
    const [atpAfter] = await migDb
      .select()
      .from(schema.alurTujuanPembelajaran)
      .where(eq(schema.alurTujuanPembelajaran.id, atp.id));
    expect(cpAfter).toBeUndefined();
    expect(tpAfter).toBeUndefined();
    expect(atpAfter).toBeUndefined();

    // mata_pelajaran + fase are referenced via RESTRICT, so they survive the
    // kurikulum cascade (the cascade stops at CP).
    const [mpAfter] = await migDb
      .select()
      .from(schema.mataPelajaran)
      .where(eq(schema.mataPelajaran.id, mp.id));
    const [fAfter] = await migDb
      .select()
      .from(schema.fase)
      .where(eq(schema.fase.id, f.id));
    expect(mpAfter).toBeTruthy();
    expect(fAfter).toBeTruthy();
  });

  // 5. FK RESTRICT: deleting a mata_pelajaran that a CP references is rejected
  //    (SQLSTATE 23503). The CP must be removed first.
  itOrSkip("rejects deleting mata_pelajaran referenced by a CP (RESTRICT)", async () => {
    const { mp } = await seedChain("restrict");

    await expectConstraintViolation(
      migDb
        .delete(schema.mataPelajaran)
        .where(eq(schema.mataPelajaran.id, mp.id))
    );
  });

  // 6. CHECK status_persetujuan: the three allowed values accepted; anything
  //    else rejected (23514).
  itOrSkip("accepts valid status_persetujuan; rejects invalid (CHECK)", async () => {
    for (const s of ["memerlukan_tinjauan", "disetujui", "ditolak"]) {
      const [row] = await migDb
        .insert(schema.kurikulum)
        .values({
          nama: uniq("Kurikulum-Check-"),
          versi: "2022",
          sumber: "Kemdikbud",
          statusPersetujuan: s,
        })
        .returning();
      expect(row.statusPersetujuan).toBe(s);
    }

    await expectConstraintViolation(
      migDb.insert(schema.kurikulum).values({
        nama: uniq("Kurikulum-Bad-"),
        versi: "2022",
        sumber: "Kemdikbud",
        statusPersetujuan: "xyz",
      })
    );
  });
});
