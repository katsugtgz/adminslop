# AGENTS.md

Guidance for coding agents working in this repository.

## Project

**EduAdmin Pro Premium** — multi-tenant Indonesian school-administration
platform. Stack: **Next.js 15.3 (App Router) · WorkOS AuthKit · Supabase
(DB/RLS/pgvector only) · Drizzle · Tailwind v4 · shadcn/ui**. UI strings are
**Bahasa Indonesia**.

- Domain glossary: `CONTEXT.md` (e.g. **Satuan Pendidikan** = tenant,
  **Keanggotaan Satuan Pendidikan** = membership).
- Plan + converged decisions: `hyperplan/plan.md`, `hyperplan/insights-bundle.md`.
- Source-app recon: `scrape/`.

## Identity and access

- Authentication is implemented with **WorkOS AuthKit** (replaces the plan's
  original Supabase Auth choice — owner decision 2026-06-25).
- Read `docs/architecture/identity-and-access.md` **before** changing
  authentication, tenancy, organizations, roles, or permissions.
- Load the `workos-authkit` skill (`.opencode/skills/workos-authkit/`) for
  WorkOS-related implementation, review, or debugging.
- Consult the `workos-docs` OpenCode reference (`docs/vendor/workos/`) instead
  of guessing SDK behavior.
- **Authentication ≠ authorization.** Protected actions require server-side
  authorization.
- Organization-scoped queries must enforce organization isolation
  (`tenant_id` + RLS; tenant from the active membership, never client-supplied).
- `tenant_role` is **never superuser**.
- WorkOS secrets (`WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`) must remain
  server-only — never `NEXT_PUBLIC_*`, logs, API responses, or source control.
- Use the WorkOS **sandbox** environment (`sk_test_*`) for development.
- Do **not** alter production WorkOS resources without explicit approval.
- Enterprise features (SSO, Directory Sync/SCIM, MFA enforcement, Admin Portal,
  Widgets, FGA, Vault, Radar, Custom Domains) are **deferred** — surface their
  paid/enterprise status before implementing.

## Commands

- Dev: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`
- Type-check: `npx tsc --noEmit`

## Conventions

- Atomic commits, conventional messages (`feat:`, `fix:`, `chore:`, `docs:`,
  `test:`) — see `hyperplan/plan.md` §5.
- Never commit secrets; `.env` is gitignored. Use `.env.example` for placeholders.
