# AGENTS.md

Agent guidance for **EduAdmin Pro Premium** — multi-tenant Indonesian school
administration platform.

## Current project truth

- Stack: **Next.js 15 App Router (`next ^15.5.19`) · React 19 · WorkOS
  AuthKit · PostgreSQL/RLS via `pg` + Drizzle · Tailwind v4 · shadcn-style UI
  primitives · Vitest · Playwright automated tracer**.
- UI language is **Bahasa Indonesia**. Domain language is canonical in
  `CONTEXT.md`; do not invent English substitutes.
- App is not an early scaffold. Dashboard modules, DB schema/migrations/queries,
  seed data, tests, Docker Postgres, and CI workflows exist.
- Supabase is a planning term for DB/RLS/pgvector only. Current code uses
  PostgreSQL directly; no Supabase Auth.

## High-signal child docs

Read the nearest child `AGENTS.md` before edits:

- `src/app/AGENTS.md` — route/page/server-action conventions.
- `src/components/AGENTS.md` — UI component taxonomy and styling rules.
- `src/db/AGENTS.md` — schema, migrations, RLS, queries, tests.
- `src/lib/auth/AGENTS.md` — WorkOS/AuthKit, tenant resolution, authorization.
- `src/db/seed/AGENTS.md` — dev/e2e seed safety and determinism.
- `scrape/AGENTS.md` — source-app recon captures and regeneration rules.

Do not create child docs in `.omo/`, `.screenshots/`, `.playwright-mcp/`,
`.agents/`, or `.opencode/skills/*`; those are runtime/cache/vendor-skill areas.

## Domain vocabulary

- **Satuan Pendidikan** = tenant.
- **Keanggotaan Satuan Pendidikan** = membership.
- **Satuan Pendidikan Aktif** = active tenant context.
- **Peran Akses / Izin Akses / Pembatasan Akses** = role, permission, deny rule.
- **Peserta Didik** only; avoid `siswa`/`murid` in UI/domain code.
- Other canonical terms: PTK, Guru, Admin Satuan Pendidikan, Rombongan Belajar,
  Tahun Ajaran, Semester, Penilaian, Nilai Akhir, E-Raport, Absensi,
  Permintaan AI, Draf AI, Verifikasi Dokumen AI.

## Architecture decisions to respect

- Read `docs/architecture/identity-and-access.md` before auth, tenancy, role,
  organization, membership, or permission work.
- ADRs live in `docs/adr/0001`–`0008`:
  - 0001 global reference tables accepted.
  - 0002 PII at-rest encryption deferred owner checkpoint.
  - 0003 MVP AI mock-only deferred.
  - 0004 WorkOS role/session decisions partly accepted/deferred.
  - 0005 consent/notification deferred; no external channels.
  - 0006 RAG/help deferred.
  - 0007 BYO LLM clipboard accepted for Bank Soal only.
  - 0008 akses module deepening accepted.
- WorkOS owns users, organizations, memberships, roles, and sessions. App DB owns
  business data, tenant-scoped rows, RLS, and audit.
- Authentication is not authorization. UI hiding is not authorization.
- `tenant_id` must come from active WorkOS membership, never client input.
- `tenant_role` / role slugs are never `superuser`.

## Security hard rules

- WorkOS secrets (`WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`) are server-only:
  never `NEXT_PUBLIC_*`, logs, source, or responses. Only client ID may be public.
- Use WorkOS sandbox (`sk_test_*`) for development. Production WorkOS resource
  changes require explicit owner approval.
- Enterprise WorkOS features (SSO, Directory Sync/SCIM, MFA enforcement, Admin
  Portal, Widgets, FGA, Vault, Radar, Custom Domains) are deferred; mention paid
  status before implementing.
- No client-readable JWT/auth.uid tenant context. Do not store WorkOS tokens,
  sessions, or passwords in app DB.
- AI MVP is mock-only. Do not add provider SDKs/env vars. BYO LLM is external
  clipboard only for Bank Soal, with provenance and honest labels.

## Commands

- App: `npm run dev`, `npm run build`, `npm run start`.
- Quality: `npm run lint`, `npm run typecheck`, `npm run test`,
  `npm run test:run`, `npm run doctor`.
- DB: `npm run db:up`, `npm run db:down`, `npm run db:reset`,
  `npm run db:migrate`, `npm run db:seed`, `npm run db:seed:scrape`.
- E2E/tracer: `npm run e2e`, `npm run e2e:tracer`.
- Health: `GET /health` returns `{ "status": "ok" }`.

## Tests and verification

- Untested implementation is not done. After code changes, run relevant Vitest,
  typecheck/lint/build as appropriate.
- Vitest has `unit` (jsdom; excludes `src/db/**`) and `db` (node;
  `src/db/**/*.test.ts`, `fileParallelism:false`) projects.
- DB tests need live Postgres plus `DATABASE_URL` app role and
  `DATABASE_MIGRATOR_URL` owner role; absent env should skip cleanly.
- CI exists in `.github/workflows/ci.yml` with Postgres 17 service and Node 20.

## Browser-visible QA

- Manual/browser QA must use **`agent-browser`**. First command:
  `agent-browser skills get --all`.
- Evidence requires screenshot, accessibility snapshot, real interaction, and
  relevant console/network observations. A page load alone is not interaction.
- QA artifacts go to `/tmp` unless owner asks to keep them in repo.
- Visual verdicts require `vision-9router`.
- Do not use Playwright MCP/manual Playwright for QA. Existing Playwright code is
  allowed only for automated e2e/tracer and source recon scripts.

## UI/design defaults

- `src/app/globals.css` defines the Editorial Premium Indonesia system: warm
  cream background, batik earth tones, deep ink, terracotta accent, `oklch`,
  radius `0.75rem`, Plus Jakarta Sans, Bricolage Grotesque, Geist Mono.
- Avoid corporate-blue/purple-gradient defaults.
- Keep `<html lang="id" dir="ltr">` and root `AuthKitProvider` + `AppShell`.
- Locked copy: offline save failure says `Tidak dapat menyimpan saat offline`.

## Workflow

- Match existing patterns. Fix bugs minimally; do not refactor while fixing.
- Use `docs/agents/issue-tracker.md` for GitHub Issues via `gh`; triage labels
  are `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
  `wontfix`.
- Do not commit without explicit user request. Never commit secrets.
