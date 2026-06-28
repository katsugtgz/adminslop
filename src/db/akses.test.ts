import path from "node:path";

import pg from "pg";
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

// Tenant seeds (shared registry with rls.test.ts; UPSERT so concurrent runs do
// not collide). No audit rows written here -> avoids the known cross-test
// contamination of org_A's catatan_audit.
const SEED_A = "org_A";
const SEED_B = "org_B";

describeOrSkip("akses & PTK tables (#6, Wave 1)", () => {
  let db: Db;

  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(MIG_URL!, path.join(process.cwd(), "src/db/migrations"));

    // 2. Seed tenant registry (UPSERT — survives concurrent runs with rls.test.ts)
    //    and clear akses-layer rows in FK-safe order so each run starts clean
    //    (superuser bypasses RLS).
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_A', 'Satuan Pendidikan A'),
        ('org_B', 'Satuan Pendidikan B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from pembatasan_akses;
      delete from izin_akses;
      delete from pengguna;
      delete from ptk;
    `);
    await seed.end();

    // 3. App client uses the non-superuser role — RLS enforced.
    db = createDb(APP_URL!).db;
  });

  afterAll(async () => {
    await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
  });

  // 1. Seed + CRUD: ptk, pengguna (unlinked), izin_akses round-trip.
  itOrSkip("inserts and reads back ptk, pengguna (unlinked), izin_akses", async () => {
    const { ptkRow, penggunaRow, izinRow } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const [ptkRow] = await tx
          .insert(schema.ptk)
          .values({ nama: "Budi Guru", nip: "198001012005011001", jenis: "pendidik" })
          .returning();
        const [penggunaRow] = await tx
          .insert(schema.pengguna)
          .values({ userId: "workos_user_crud", peranAkses: "guru" })
          .returning();
        const [izinRow] = await tx
          .insert(schema.izinAkses)
          .values({ penggunaId: penggunaRow.id, slug: "ptk:baca" })
          .returning();
        return { ptkRow, penggunaRow, izinRow };
      }
    );

    expect(ptkRow.tenantId).toBe(SEED_A);
    expect(ptkRow.nama).toBe("Budi Guru");
    expect(ptkRow.nip).toBe("198001012005011001");
    expect(ptkRow.jenis).toBe("pendidik");
    expect(ptkRow.id).toBeTruthy();
    expect(ptkRow.dibuatPada).toBeTruthy();

    expect(penggunaRow.tenantId).toBe(SEED_A);
    expect(penggunaRow.userId).toBe("workos_user_crud");
    expect(penggunaRow.peranAkses).toBe("guru");
    expect(penggunaRow.ptkId).toBeNull();

    expect(izinRow.tenantId).toBe(SEED_A);
    expect(izinRow.penggunaId).toBe(penggunaRow.id);
    expect(izinRow.slug).toBe("ptk:baca");
  });

  // 2. RLS isolation (core §13 guarantee): tenant B sees zero of tenant A's rows.
  itOrSkip("tenant B cannot see tenant A's ptk rows (RLS isolation)", async () => {
    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .insert(schema.ptk)
        .values({ nama: "PTK Isolasi A", jenis: "pendidik" });
    });

    const bRows = await withTenant(db, SEED_B, (tx) =>
      tx.select().from(schema.ptk)
    );
    expect(bRows).toHaveLength(0);
  });

  // 3. RLS write isolation + FORCED WITH CHECK on a forged tenant_id literal.
  itOrSkip("write under tenant B does not leak to A; forged tenant_id rejected by WITH CHECK", async () => {
    await withTenant(db, SEED_B, async (tx) => {
      await tx
        .insert(schema.ptk)
        .values({ nama: "PTK B-only", jenis: "tenaga_kependidikan" });
    });

    const aHits = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.ptk).where(eq(schema.ptk.nama, "PTK B-only"))
    );
    expect(aHits).toHaveLength(0);

    // GUC is org_B; an explicit org_A literal must be rejected by the policy's
    // WITH CHECK — proves FORCE ROW LEVEL SECURITY is on (owner would otherwise
    // bypass, and a non-FORCED policy would not check writes).
    await expect(
      withTenant(db, SEED_B, (tx) =>
        tx
          .insert(schema.ptk)
          .values({ nama: "FORGED", jenis: "pendidik", tenantId: SEED_A })
          .returning()
      )
    ).rejects.toThrow();
  });

  // 4. pengguna <-> ptk link + ON DELETE SET NULL.
  itOrSkip("links pengguna to ptk, then ON DELETE SET NULL clears ptk_id", async () => {
    const { ptkId, penggunaId } = await withTenant(db, SEED_A, async (tx) => {
      const [p] = await tx
        .insert(schema.ptk)
        .values({ nama: "Siti Link", jenis: "pendidik" })
        .returning();
      const [u] = await tx
        .insert(schema.pengguna)
        .values({ userId: "workos_link_user", peranAkses: "guru" })
        .returning();
      const [linked] = await tx
        .update(schema.pengguna)
        .set({ ptkId: p.id })
        .where(eq(schema.pengguna.id, u.id))
        .returning();
      expect(linked.ptkId).toBe(p.id);
      return { ptkId: p.id, penggunaId: u.id };
    });

    // Delete the PTK -> pengguna persists, ptk_id nulled (FK referential action,
    // which bypasses RLS, fires under the table owner).
    await withTenant(db, SEED_A, async (tx) => {
      await tx.delete(schema.ptk).where(eq(schema.ptk.id, ptkId));
    });

    const [after] = await withTenant(db, SEED_A, (tx) =>
      tx.select().from(schema.pengguna).where(eq(schema.pengguna.id, penggunaId))
    );
    expect(after).toBeTruthy();
    expect(after.id).toBe(penggunaId);
    expect(after.ptkId).toBeNull();
  });

  // 5. CASCADE delete: pengguna removal cascades to izin_akses + pembatasan_akses.
  itOrSkip("deleting pengguna cascades to its izin_akses and pembatasan_akses", async () => {
    const penggunaId = await withTenant(db, SEED_A, async (tx) => {
      const [u] = await tx
        .insert(schema.pengguna)
        .values({
          userId: "workos_cascade_user",
          peranAkses: "admin_satuan_pendidikan",
        })
        .returning();
      await tx.insert(schema.izinAkses).values([
        { penggunaId: u.id, slug: "ptk:baca" },
        { penggunaId: u.id, slug: "ptk:buat" },
      ]);
      await tx.insert(schema.pembatasanAkses).values([
        { penggunaId: u.id, slug: "ptk:hapus", alasan: "rotasi" },
        { penggunaId: u.id, slug: "akses:kelola", alasan: "demosi" },
      ]);
      return u.id;
    });

    // sanity: the granted rows exist before the delete
    const beforeIzin = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.izinAkses)
        .where(eq(schema.izinAkses.penggunaId, penggunaId))
    );
    const beforeBatas = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.pembatasanAkses)
        .where(eq(schema.pembatasanAkses.penggunaId, penggunaId))
    );
    expect(beforeIzin).toHaveLength(2);
    expect(beforeBatas).toHaveLength(2);

    await withTenant(db, SEED_A, async (tx) => {
      await tx.delete(schema.pengguna).where(eq(schema.pengguna.id, penggunaId));
    });

    const afterIzin = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.izinAkses)
        .where(eq(schema.izinAkses.penggunaId, penggunaId))
    );
    const afterBatas = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.pembatasanAkses)
        .where(eq(schema.pembatasanAkses.penggunaId, penggunaId))
    );
    expect(afterIzin).toHaveLength(0);
    expect(afterBatas).toHaveLength(0);
  });

  // 6. UNIQUE constraints: duplicate (tenant,user) and duplicate izin slug fail.
  itOrSkip("rejects duplicate (tenant_id, user_id) and duplicate izin_akses slug", async () => {
    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .insert(schema.pengguna)
        .values({ userId: "workos_unique_user", peranAkses: "guru" });
    });
    await expect(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.pengguna)
          .values({ userId: "workos_unique_user", peranAkses: "guru" })
      )
    ).rejects.toThrow();

    const penggunaId = await withTenant(db, SEED_A, async (tx) => {
      const [u] = await tx
        .insert(schema.pengguna)
        .values({ userId: "workos_unique_izin", peranAkses: "guru" })
        .returning();
      await tx
        .insert(schema.izinAkses)
        .values({ penggunaId: u.id, slug: "ptk:baca" });
      return u.id;
    });
    await expect(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.izinAkses)
          .values({ penggunaId, slug: "ptk:baca" })
      )
    ).rejects.toThrow();
  });

  // 7. Partial unique index on pengguna.ptk_id: multiple NULLs OK, double-link fails.
  itOrSkip("allows multiple unlinked penggunas; forbids two linked to the same ptk", async () => {
    // two unlinked (NULL ptk_id) — both allowed
    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .insert(schema.pengguna)
        .values({ userId: "workos_unlinked_1", peranAkses: "guru" });
      await tx
        .insert(schema.pengguna)
        .values({ userId: "workos_unlinked_2", peranAkses: "guru" });
    });

    // create a ptk + first linked pengguna
    const ptkId = await withTenant(db, SEED_A, async (tx) => {
      const [p] = await tx
        .insert(schema.ptk)
        .values({ nama: "PTK Shared", jenis: "pendidik" })
        .returning();
      await tx
        .insert(schema.pengguna)
        .values({
          userId: "workos_link_share_1",
          peranAkses: "guru",
          ptkId: p.id,
        });
      return p.id;
    });

    // a second pengguna linked to the same ptk, in its own transaction, is rejected
    await expect(
      withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.pengguna)
          .values({
            userId: "workos_link_share_2",
            peranAkses: "guru",
            ptkId,
          })
      )
    ).rejects.toThrow();
  });

  // 8. CHECK constraint: ptk.jenis must be one of the allowed domain values.
  itOrSkip("rejects ptk with invalid jenis (CHECK constraint)", async () => {
    await expect(
      withTenant(db, SEED_A, (tx) =>
        tx.insert(schema.ptk).values({ nama: "Bad Jenis", jenis: "invalid" })
      )
    ).rejects.toThrow();
  });
});
