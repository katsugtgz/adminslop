import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { catatAudit, createDb, withTenant, type Db } from "./client";
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

describeOrSkip("tenant DB/RLS spine (#3)", () => {
  let db: Db;

  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(MIG_URL!, path.join(process.cwd(), "src/db/migrations"));

    // 2. Seed tenant registry + clear smoke rows (superuser; no RLS on registry).
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_A', 'Satuan Pendidikan A'),
        ('org_B', 'Satuan Pendidikan B')
      on conflict (id) do nothing;
    `);
    await seed.query("delete from catatan_audit; delete from contoh_catatan;");
    await seed.end();

    // 3. App client uses the non-superuser role — RLS enforced.
    db = createDb(APP_URL!).db;
  });

  itOrSkip("no tenant context -> read returns zero rows (RLS blocks)", async () => {
    const rows = await db.select().from(schema.contohCatatan);
    expect(rows).toHaveLength(0);
  });

  itOrSkip("write under tenant A creates record + audit; tenant B sees nothing", async () => {
    const created = await withTenant(db, "org_A", async (tx) => {
      const [row] = await tx
        .insert(schema.contohCatatan)
        .values({ judul: "Catatan A", isi: "rahasia sekolah A" })
        .returning();
      await catatAudit(tx, {
        aktor: "user_A",
        aksi: "buat_contoh",
        target: `contoh_catatan:${row.id}`,
      });
      return row;
    });

    // tenant_id came from the session GUC, not the insert payload.
    expect(created.tenantId).toBe("org_A");

    // A can read its own row.
    const aRows = await withTenant(db, "org_A", (tx) =>
      tx.select().from(schema.contohCatatan).where(eq(schema.contohCatatan.id, created.id))
    );
    expect(aRows).toHaveLength(1);

    // B cannot read A's row (cross-tenant isolation).
    const bRows = await withTenant(db, "org_B", (tx) =>
      tx.select().from(schema.contohCatatan)
    );
    expect(bRows).toHaveLength(0);

    // A read with no tenant context is also empty.
    const noCtx = await db.select().from(schema.contohCatatan);
    expect(noCtx).toHaveLength(0);
  });

  itOrSkip("Catatan Audit records who / what / when / Satuan Pendidikan", async () => {
    const audit = await withTenant(db, "org_A", (tx) =>
      tx.select().from(schema.catatanAudit)
    );
    expect(audit.length).toBeGreaterThan(0);
    const row = audit[0];
    expect(row.aktor).toBe("user_A");
    expect(row.aksi).toBe("buat_contoh");
    expect(row.tenantId).toBe("org_A");
    expect(row.dibuatPada).toBeTruthy();
  });

  itOrSkip("tenant_id is never client-supplied: insert without GUC is rejected", async () => {
    // No set_config -> GUC null -> NOT NULL default -> error.
    await expect(
      db.insert(schema.contohCatatan).values({ judul: "tanpa tenant" })
    ).rejects.toThrow();
  });
});
