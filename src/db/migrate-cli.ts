import path from "node:path";

import { runMigrations } from "./migrate";

// Load .env (Node native; no-op if file missing).
try {
  process.loadEnvFile?.();
} catch {
  /* .env absent — rely on real environment variables */
}

async function main() {
  const url =
    process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_MIGRATOR_URL (or DATABASE_URL) is required to run migrations."
    );
    process.exit(1);
  }
  const dir = path.join(process.cwd(), "src", "db", "migrations");
  const applied = await runMigrations(url, dir);
  console.log(`migrations applied (${applied.length}):`, applied.join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
