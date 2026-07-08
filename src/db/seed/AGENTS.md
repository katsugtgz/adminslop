# src/db/seed/AGENTS.md

Dev/e2e seed data. Destructive by design, deterministic by requirement.

## Safety gates

- `guard.ts` must keep `assertLocalOrForced` loopback-only unless `SEED_FORCE`
  is explicitly set.
- `SEED_LOCAL_HOSTS` exists for Docker aliases; do not broaden it silently.
- `assertSameDb` must keep migrator/app URLs pointed at the same DB before
  cleanup/reinsert.
- Never run seed against non-local/prod data without explicit owner approval.

## Role split

- GLOBAL reference seed uses `DATABASE_MIGRATOR_URL`.
- Tenant seed uses `DATABASE_URL` app role through `withTenant`; RLS `WITH CHECK`
  must validate inserts.
- Demo tenants are `org_smp_harapan` and `org_sma_negeri1`.

## Determinism

- Re-runs must be idempotent and bit-stable for URL-facing IDs.
- Stable UUIDs come from hash `(tenant:key)` via seed utilities.
- `dibuat_oleh` marker remains `seed-dev`.
- `DEV_MEMBERSHIP_ALL=true` is the local dev shortcut for broad demo access.

## Content rules

- `referensi.ts` GLOBAL Kurikulum rows use
  `status_persetujuan = 'memerlukan_tinjauan'`; AI output is not canonical.
- Fixture `fixtures/soal-firecrawl.json` keeps e2e usable without Firecrawl API.
- `scrape-soal.mjs` is a reproducible example parser, not universal scraping.
  Only scrape sources you have permission to use.

## Tests

- Primary guard: `npx vitest run --project db src/db/seed/seed.test.ts`.
- Test expectations include row counts, five bank-soal types, no-GUC/cross-tenant
  RLS denial, e-raport invariants, deterministic IDs, and `seed-dev` marker.
- `src/db/seed/README.md` is user-facing. Keep it synced with code; replace stale
  verification references with current tests when encountered.
