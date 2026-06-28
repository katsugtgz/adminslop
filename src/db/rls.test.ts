import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import pg from "pg";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";

import { catatAudit, createDb, withTenant, type Db } from "./client";
import { runMigrations } from "./migrate";
import * as schema from "./schema";
import type { RoleSlug } from "../lib/auth/types";

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

  // Invariant #3 (DB layer): a superuser/BYPASSRLS role skips RLS, collapsing
  // tenant isolation. Assert the app role has neither (per docker/init.sql).
  itOrSkip("app connection role is non-superuser with no BYPASSRLS (RLS cannot be bypassed)", async () => {
    const result = await db.execute(sql`
      select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
      from pg_roles where rolname = current_user
    `);
    const role = result.rows[0];
    expect(role, "current_user role row must exist").toBeDefined();
    expect(role!.rolname).toBe("app_user");
    expect(role!.rolsuper).toBe(false);
    expect(role!.rolbypassrls).toBe(false);
    expect(role!.rolcreatedb).toBe(false);
    expect(role!.rolcreaterole).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static identity invariants (#7): no-DB source/catalog checks. These always
// run — they guard against regressions even when DATABASE_URL is absent.
// ---------------------------------------------------------------------------

const SRC_ROOT = path.join(process.cwd(), "src");

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

const SOURCE_FILES = collectSourceFiles(SRC_ROOT);
const isTestFile = (f: string) => /\.test\.(ts|tsx)$/.test(f);
const isClientComponent = (content: string) =>
  /^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*['"]use client['"]/.test(content);

describe("identity invariants — static source checks (#7, no DB)", () => {
  // Invariant #3 (type layer): 'superuser' must never be a RoleSlug (would
  // grant cross-tenant reach). NOTE: this assertion is enforced by
  // `npm run typecheck`, not `vitest run`; the source scan below is the
  // runtime guard.
  it("RoleSlug type excludes 'superuser'", () => {
    expectTypeOf<"superuser">().not.toMatchTypeOf<RoleSlug>();
  });

  // Invariant #3 (runtime): catches `as any`/dynamic 'superuser' role
  // assignments the type check cannot see.
  it("no source file assigns 'superuser' to a tenant_role field", () => {
    const roleAssign = /(peran_akses|peranAkses|role_slug|roleSlug|tenant_role)\s*[:=]\s*['"]superuser['"]/;
    const offenders = SOURCE_FILES.filter((f) => {
      if (isTestFile(f)) return false;
      return roleAssign.test(readFileSync(f, "utf8"));
    }).map((f) => path.relative(SRC_ROOT, f));
    expect(offenders).toEqual([]);
  });

  // Invariant #4: server secrets must never ship in a client bundle.
  it("no client component ('use client') references any WORKOS_ env var", () => {
    const offenders = SOURCE_FILES.filter((f) => {
      const content = readFileSync(f, "utf8");
      return isClientComponent(content) && /WORKOS_/.test(content);
    }).map((f) => path.relative(SRC_ROOT, f));
    expect(offenders).toEqual([]);
  });

  // Invariant #4: a NEXT_PUBLIC_WORKOS_(API_KEY|COOKIE_PASSWORD) would be
  // inlined into every bundle at build time.
  it("no source file exposes a NEXT_PUBLIC_WORKOS server secret", () => {
    const publicSecret = /NEXT_PUBLIC_WORKOS_(API_KEY|COOKIE_PASSWORD)/;
    const offenders = SOURCE_FILES.filter((f) => {
      if (isTestFile(f)) return false;
      return publicSecret.test(readFileSync(f, "utf8"));
    }).map((f) => path.relative(SRC_ROOT, f));
    expect(offenders).toEqual([]);
  });
});
