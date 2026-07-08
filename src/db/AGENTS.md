# src/db/AGENTS.md

Database layer: Drizzle schema, hand-written SQL migrations, RLS, query modules,
seed, and DB tests.

## Shape

- `schema.ts` is a pure barrel re-export. Table definitions live in 15 domain
  files under `src/db/schema/` (core, kurikulum, akses, peserta-didik, akademik,
  beban-mengajar, penilaian, ai, absensi, notifikasi, eraport, bank-soal,
  perangkat-ajar, arsip, cetak). Importing consumers continue to use
  `@/db/schema` unchanged. DB names are `snake_case`; TypeScript properties are
  camelCase. Cross-domain FK references resolve via explicit imports between
  domain files in topological order; never add a cycle.
- `client.ts` exports `createDb`, `getDb`, `withTenant`, `catatAudit`, and DB
  types. Tenant-scoped app reads/writes go through `withTenant`.
- Query modules in `queries/` are pure repositories: `(db: Db | Tx, input) =>
  Promise<...>`. No authz, FormData parsing, audit, or UI decisions there.

## RLS and tenancy

- Tenant tables have `tenant_id text not null default current_setting('app.tenant_id', true)`
  referencing `satuan_pendidikan`.
- `withTenant(db, tenantId, fn)` opens a transaction and sets `app.tenant_id`
  with local `set_config(..., true)`. Do not pass tenant IDs from clients.
- Tenant-to-tenant foreign keys use composite `(tenant_id, id)` references.
- GLOBAL reference tables (`mata_pelajaran`, `fase`, `kurikulum`, `capaian`,
  `tujuan`, `alur`) have no `tenant_id` and no RLS per ADR 0001.
- No app role may be superuser or BYPASSRLS.

## Migrations

- Runtime migrations are hand-written SQL under `src/db/migrations`, sorted,
  idempotent, and tracked in `schema_migrations`.
- `drizzle.config.ts` outputs `./drizzle`; that output is not the runtime source
  of truth. Do not switch runtime migration flow to generated Drizzle SQL.
- Tenant-scoped migrations require `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL
  SECURITY`, and policies with both `USING` and `WITH CHECK` using
  `current_setting('app.tenant_id', true)`.
- Production migrations require explicit owner approval plus recent backup or
  restore proof.

## Roles and env

- `DATABASE_URL` = app role (`app_user`) for runtime/tests; no BYPASSRLS.
- `DATABASE_MIGRATOR_URL` = owner/superuser for migrations and global seed.
- Never use migrator URL at runtime. Never use app URL for migrations.
- `docker/init.sql` provisions local `app_user`.

## Tests

- DB tests run in Vitest project `db` and should skip cleanly when DB env is
  absent.
- Run migrations before DB assertions; use per-file private tenant IDs; clean
  with `cleanupTestTenants`.
- Keep `fileParallelism:false` unless every DB test has isolated tenants and
  cleanup.

## Forbidden patterns

- Client/request/FormData-supplied `tenant_id`.
- Single-column foreign keys between tenant tables.
- Missing `FORCE RLS`, missing `WITH CHECK`, or missing GUC default on tenant
  tables.
- Updating/deleting append-only histories; hard-deleting soft-delete tables.
- Composite FK `ON DELETE SET NULL` without an explicit column list.
