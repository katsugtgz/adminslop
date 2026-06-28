# Runbook — Database migrations

Audience: engineers and operators running schema migrations against EduAdmin
Pro Premium databases. Applies to **plain-SQL migrations** tracked under
`src/db/migrations/` (the project's canonical migrator) — **not**
`drizzle-kit` migrations.

> **Autonomy boundary.** Local disposable DBs are safe to provision and tear
> down at will. **Staging and production DBs require explicit owner approval
> per apply** (see §5 and §6). No agent or engineer may run migrations against
> staging or production without that approval, recorded in writing.

---

## 1. Canonical migration directory

**Path:** `src/db/migrations/` (relative to repo root).

**Evidence:**

- `src/db/migrate-cli.ts` hard-codes the directory:
  ```ts
  const dir = path.join(process.cwd(), "src", "db", "migrations");
  const applied = await runMigrations(url, dir);
  ```
- `src/db/migrate.ts` reads `*.sql` (sorted ascending) and tracks applied
  files in a `schema_migrations` table.
- `package.json` script `db:migrate` → `tsx src/db/migrate-cli.ts` is the only
  migration entrypoint exposed to users.
- Glob confirmed **23 SQL files** under `src/db/migrations/`
  (`0000_tenant_spine.sql` … `0015_fk_tenant_scoping.sql`, including the
  `0001b`/`0002b`/`0003b`/`0006b` tenant-scoping follow-ups).
- `drizzle/*` does **not** exist on disk.

**The `out: "./drizzle"` field in `drizzle.config.ts` is dead config for the
runtime migrator.** It would only take effect if someone ran `drizzle-kit
generate` / `push` / `migrate`, but **none of those commands are wired into
`package.json` scripts** and the hand-written migrator ignores `drizzle-kit`
output entirely. Treat `src/db/migrations/` as the single source of truth.

**Naming convention:**

- Zero-padded 4-digit sequence prefix (`0000_`, `0001_`, …, `0015_`).
- Optional lowercase-`b` suffix on the sequence for tenant-scoping follow-ups
  (`0001b_fk_tenant_scoping.sql`). These sort immediately after their parent
  number and must run before the next integer.
- Snake-case slug after the prefix describing the module.
- Only `.sql` files are read; everything else is ignored.

**Format:** Plain SQL. Each file is applied in its own transaction by
`runMigrations`. **Do not** wrap a migration in `BEGIN`/`COMMIT` yourself —
the migrator handles that and will `ROLLBACK` on any error.

---

## 2. Fresh DB cold apply

Use this for local development, CI, or verifying a branch applies cleanly
from zero. **Never** run this against an existing populated database without
§3 (backup) first.

### 2.1 Bring up Postgres

```bash
npm run db:up          # = docker compose up -d --wait
                       # provisions postgres:17-alpine on :5432
                       # creates non-superuser role app_user via docker/init.sql
```

Verify the container is healthy:

```bash
docker ps --filter "name=eduadmin-db" --format "{{.Names}}: {{.Status}}"
# expect: eduadmin-db: Up ... (healthy)
```

### 2.2 Create a disposable DB (recommended for verification)

The default `eduadmin` DB may already contain seed data you do not want to
disturb. Create a throwaway DB instead:

```bash
docker exec eduadmin-db psql -U postgres -c \
  'CREATE DATABASE "eduadmin_migration_test";'
```

### 2.3 Run the migrator

The migrator prefers the privileged **migrator** URL over the
non-superuser **app** URL (the app role does not own the schema — see
`docker/init.sql` and `.env.example`):

```bash
DATABASE_MIGRATOR_URL=postgresql://postgres:postgres@localhost:5432/eduadmin_migration_test \
  npm run db:migrate
```

For the default dev DB, simply:

```bash
npm run db:migrate     # uses DATABASE_MIGRATOR_URL (or DATABASE_URL) from .env
```

### 2.4 Expected output

On a fresh DB you should see exactly this shape:

```
> eduadmin-pro-premium@0.1.0 db:migrate
> tsx src/db/migrate-cli.ts

migrations applied (23): 0000_tenant_spine.sql, 0001_akses_ptk.sql, \
0001_profil_pengaturan_satuan.sql, 0001b_fk_tenant_scoping.sql, \
0002_peserta_didik.sql, 0002b_fk_tenant_scoping.sql, \
0003_rombongan_belajar.sql, 0003b_fk_tenant_scoping.sql, \
0004_referensi_kurikulum.sql, 0005_kurikulum_seed_review_required.sql, \
0006_beban_mengajar.sql, 0006b_fk_tenant_scoping.sql, 0007_penilaian.sql, \
0008_permintaan_ai.sql, 0009_absensi_harian.sql, 0009_eraport.sql, \
0010_bank_soal.sql, 0011_notifikasi.sql, 0011_perangkat_ajar.sql, \
0012_template_cetak.sql, 0013_arsip.sql, 0014_mode_offline.sql, \
0015_fk_tenant_scoping.sql
```

- **Exit code:** `0`
- **Public-schema tables created:** `43` (42 domain tables + `schema_migrations`)
- **`schema_migrations` rows:** `23`

Verify the count:

```bash
docker exec eduadmin-db psql -U postgres -d eduadmin_migration_test -t -A -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
# expect: 43
```

**Cold-apply gate evidence** captured by Task 8 lives at
`.omo/evidence/task-8-cold-apply.log`.

### 2.5 Tear down the disposable DB

```bash
docker exec eduadmin-db psql -U postgres -c \
  'DROP DATABASE IF EXISTS "eduadmin_migration_test";'
```

### 2.6 Idempotency

`runMigrations` is idempotent: re-running `npm run db:migrate` against an
already-migrated DB records each filename in `schema_migrations` and skips
its body. The migrator still echoes all filenames in the
`migrations applied (...)` line — this is the set of files seen, **not** the
set re-executed. The true signal of a no-op is exit code `0` and zero new
rows in `schema_migrations`:

```bash
docker exec eduadmin-db psql -U postgres -d <db> -t -A -c \
  "SELECT count(*) FROM schema_migrations;"
# compare to file count: ls src/db/migrations/*.sql | wc -l
```

---

## 3. Backup procedure

**Before every non-local apply** (staging, production, or any DB with data
you cannot afford to lose).

### 3.1 pg_dump the schema and data

```bash
# From a host with network access to the target DB:
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="backup_$(date -u +%Y%m%dT%H%M%SZ)_<env>.dump" \
  "<DATABASE_MIGRATOR_URL for that env>"
```

- `--format=custom` (`-Fc`) gives you selective restore and parallelism via
  `pg_restore -j`.
- `--no-owner --no-privileges` makes the dump portable across roles.
- Always include the env name and UTC timestamp in the filename.

### 3.2 Where to store

- **Staging backups:** the operator's machine or the deploy host is fine;
  keep at least the most recent two.
- **Production backups:** must be stored **off-host** (object storage, a
  separate volume, or your managed-DB provider's snapshot system). The
  `.dump` file must be downloadable before the apply begins. Confirm the
  restore path works on a scratch DB before depending on it.

### 3.3 Sanity-check the backup before proceeding

```bash
# Restore to a throwaway DB and confirm row counts are sane:
createdb backup_verify
pg_restore -d backup_verify --no-owner --no-privileges backup_*.dump
psql -d backup_verify -c "SELECT count(*) FROM satuan_pendidikan;"
dropdb backup_verify
```

If the restore fails, **stop** — do not proceed to the apply.

### 3.4 Managed-DB snapshots

If the target is a managed Postgres (Supabase, RDS, Cloud SQL, etc.),
trigger a **manual snapshot** in the provider console before the apply in
addition to the `pg_dump`. Name the snapshot with the same timestamp
convention. Snapshots are the fastest rollback path for catastrophic
failures.

---

## 4. Rollback procedure

**The migrator only applies forward.** There is no automatic `down`
migration. Rollback is one of:

### 4.1 Restore from backup (preferred for data-loss failures)

```bash
# Drop the corrupted DB and restore from the §3 backup.
dropdb "<target url>"
createdb "<target url>"
pg_restore -d "<target url>" --no-owner --no-privileges backup_*.dump
```

For managed-DB snapshots, use the provider's point-in-time-restore flow.

### 4.2 Manual SQL reversal (for safe, reversible changes)

If a migration is purely additive and you only need to undo its DDL (no data
loss), write a hand-rolled `revert_<N>_<slug>.sql` and apply it via `psql`
**before** adjusting `schema_migrations`:

```bash
# Apply the reversal:
psql "<DATABASE_MIGRATOR_URL>" -f revert_<N>_<slug>.sql

# Remove the migration's row so the migrator will re-apply it next time:
psql "<DATABASE_MIGRATOR_URL>" -c \
  "DELETE FROM schema_migrations WHERE id = '<N>_<slug>.sql';"
```

**Never** delete a row from `schema_migrations` without first reversing the
schema change, or the next apply will fail on `relation already exists`.

### 4.3 Things rollback cannot undo

- `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, destructive `UPDATE`/`DELETE`
  inside a migration → only a backup restore recovers the data.
- Anything that called an external service or sent a webhook.

If you are unsure whether a migration is reversible, treat it as
non-reversible and require §3 backup + §6 approval.

---

## 5. Staging apply checklist

Staging exists to catch issues before production. Treat it as mandatory.

- [ ] **Branch merged or about to merge.** Do not apply unreviewed migrations
      to staging.
- [ ] **§3 backup taken** and restore-verified.
- [ ] **Cold-apply gate green locally.** Re-run §2 against a fresh disposable
      DB on the same branch; exit code must be `0` and table count must match
      expectations.
- [ ] **Reviewer approval on the PR.** The PR description must list every new
      migration filename and a one-line summary of what it changes.
- [ ] **Apply command** uses the staging `DATABASE_MIGRATOR_URL` (not the
      app role):
      ```bash
      DATABASE_MIGRATOR_URL="<staging migrator url>" npm run db:migrate
      ```
- [ ] **Post-apply smoke tests.** Confirm row counts on protected tables
      (`satuan_pendidikan`, `peserta_didik`, `ptk`) match pre-apply. Confirm
      RLS still blocks cross-tenant reads (the `src/db/rls.test.ts` suite
      covers this — run it against staging if practical).
- [ ] **Sign-off recorded** with operator name, timestamp, and migration
      filenames applied.

---

## 6. Production apply checklist

**Production approval is REQUIRED and EXPLICIT.** No agent or engineer may
run migrations against production without written **production approval**
from the project owner, granted per-apply. Record the production approval
(message link, email, or signed comment) in the deploy log before starting.

- [ ] **Production approval secured** for this specific set of migration
      filenames, recorded in writing.
- [ ] **Staging apply completed and signed off** (§5) using the same branch.
- [ ] **§3 backup taken within the last hour** and restore-verified on a
      scratch DB. For managed Postgres, confirm the manual snapshot shows as
      `available` in the provider console.
- [ ] **Rollback plan written down** before apply. Specify which §4 path you
      will use and the conditions under which you will invoke it (e.g.
      "non-zero exit code", "post-apply smoke test fails",
      "any error within 5 minutes of traffic shifting").
- [ ] **Maintenance window** agreed if the migration is non-trivial
      (column type changes, long-running `ALTER TABLE`, index builds on large
      tables — these lock).
- [ ] **Apply command:**
      ```bash
      DATABASE_MIGRATOR_URL="<production migrator url>" npm run db:migrate
      ```
      Capture stdout, stderr, and exit code to a log file and retain for 90
      days minimum.
- [ ] **Post-apply monitoring.** Watch error rate, latency, and DB connection
      metrics for at least 15 minutes. Confirm health endpoint
      (`GET /health → { "status": "ok" }`) stays green.
- [ ] **Sign-off recorded:** operator, approver, timestamp, filenames
      applied, rollback path chosen, monitoring outcome.

**If anything looks wrong after apply, roll back first and investigate
second.** Do not attempt to forward-fix in place under pressure.

---

## 7. Failure modes

Symptom → cause → fix.

| Symptom | Likely cause | Fix |
|---|---|---|
| `DATABASE_MIGRATOR_URL (or DATABASE_URL) is required` then exit 1 | Env var not set and `.env` absent | Set `DATABASE_MIGRATOR_URL` (preferred) or `DATABASE_URL`. The migrator loads `.env` via `process.loadEnvFile` if present. |
| `permission denied for table ...` mid-apply | Connecting with the `app_user` role, which does not own the schema | Use `DATABASE_MIGRATOR_URL` (the privileged role from `.env.example`), not the app role. |
| `relation already exists` | `schema_migrations` row was deleted without reversing the schema, or two migrator processes ran concurrently | Restore the missing row, or drop the orphaned relation, then re-run. Never run two applies against the same DB at once. |
| `database "eduadmin_migration_test" does not exist, skipping` (NOTICE) | You `DROP DATABASE IF EXISTS` on a DB that wasn't there | Informational only — safe to ignore; the subsequent `CREATE DATABASE` succeeds. |
| Migration fails mid-file | Bad SQL in the file; `runMigrations` wraps each file in a transaction and `ROLLBACK`s | The migrator aborts on first failure. Fix the SQL in the migration file, drop the partially-applied DB if testing locally, and re-run. Already-applied files are skipped via `schema_migrations`. |
| `migrations applied (N)` echoes all filenames even on a no-op rerun | The migrator pushes the filename into the `applied` array for both first-apply and skip paths — this is the set *seen*, not *executed* | Verify idempotency by diffing `SELECT count(*) FROM schema_migrations` against `ls src/db/migrations/*.sql \| wc -l`, not by reading the `applied` line. |
| `docker compose up` exits non-zero | Port 5432 already in use by another Postgres | Stop the other Postgres or remap the port in `docker-compose.yml`. |
| `relation "schema_migrations" does not exist` | Connecting to a fresh DB with a tool other than the migrator before first apply | Run `npm run db:migrate` once; the migrator creates `schema_migrations` itself. |

---

## Pointers

- Migrator source: `src/db/migrate.ts`, `src/db/migrate-cli.ts`.
- Drizzle schema (ORM, not migrations): `src/db/schema.ts`.
- Drizzle Kit config (dead `out:` for runtime, used only if you adopt
  `drizzle-kit generate`): `drizzle.config.ts`.
- Container / roles: `docker-compose.yml`, `docker/init.sql`.
- Env defaults: `.env.example`.
- Cold-apply gate evidence: `.omo/evidence/task-8-cold-apply.log`.
