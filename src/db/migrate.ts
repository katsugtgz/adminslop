import fs from "node:fs/promises";
import path from "node:path";

import pg from "pg";

/**
 * Minimal idempotent SQL migrator. Reads `*.sql` (sorted) from `migrationsDir`,
 * tracks applied files in `schema_migrations`, and runs each in its own
 * transaction. Plain SQL (not drizzle-kit meta) so RLS policies stay
 * first-class and reviewable.
 *
 * Connect with a privileged/superuser URL — the application role does not own
 * the schema.
 */
export async function runMigrations(
  connectionString: string,
  migrationsDir: string
): Promise<string[]> {
  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock(hashtext('eduadmin:schema_migrations'))");
    await client.query(`
      create table if not exists schema_migrations (
        id          text primary key,
        applied_at  timestamptz not null default now()
      );
    `);

    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop — schema migrations must run in defined order on a shared client; each step depends on the prior committed DDL.
      const done = await client.query(
        "select 1 from schema_migrations where id = $1",
        [file]
      );
      if (done.rowCount && done.rowCount > 0) {
        applied.push(file);
        continue;
      }

      const sqlText = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sqlText);
        await client.query("insert into schema_migrations (id) values ($1)", [
          file,
        ]);
        await client.query("commit");
        applied.push(file);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`migration ${file} failed: ${(err as Error).message}`, {
          cause: err,
        });
      }
    }
    return applied;
  } finally {
    try {
      await client.query("select pg_advisory_unlock(hashtext('eduadmin:schema_migrations'))");
    } catch {
      /* connection already failed */
    }
    client.release();
    await pool.end();
  }
}
