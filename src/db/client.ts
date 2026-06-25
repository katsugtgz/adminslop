import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
/** Drizzle transaction handle (first arg of `db.transaction(cb)`). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type { schema };
export { schema as dbSchema };

/**
 * Build a Drizzle client on a node-postgres pool. `connectionString` must point
 * at the non-superuser application role so RLS is enforced.
 */
export function createDb(connectionString = process.env.DATABASE_URL): {
  db: Db;
  pool: pg.Pool;
} {
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required (application role, non-superuser)."
    );
  }
  const pool = new pg.Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

/**
 * Run `fn` inside a transaction bound to `tenantId` via the session GUC
 * `app.tenant_id`. `set_config(..., true)` is the PgBouncer-safe equivalent of
 * `SET LOCAL` and auto-resets at COMMIT. The tenant id MUST be derived
 * server-side (from the authenticated membership) — never from the client.
 */
export async function withTenant<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${tenantId}, true)`
    );
    return fn(tx);
  });
}

/** Insert a Catatan Audit row. Call inside `withTenant` (tenant GUC set). */
export async function catatAudit(
  tx: Tx,
  entry: {
    aktor: string;
    aksi: string;
    target?: string;
    beban?: unknown;
  }
) {
  const [row] = await tx
    .insert(schema.catatanAudit)
    .values({
      aktor: entry.aktor,
      aksi: entry.aksi,
      target: entry.target,
      beban: entry.beban as Record<string, unknown> | null,
    })
    .returning();
  return row;
}
