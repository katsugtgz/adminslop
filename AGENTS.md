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

## Current state

Early scaffold. Only **WorkOS AuthKit** is wired (`src/middleware.ts`,
`src/app/api/auth/callback/route.ts`, `src/app/auth/actions.ts`,
`src/components/nav-auth.tsx`). `src/app/page.tsx` is still raw
`create-next-app` boilerplate; UI strings are English (target: Bahasa).
**Supabase, Drizzle, shadcn/ui are documented but NOT yet installed** — build
order in `hyperplan/plan.md`. `src/middleware.ts` matchers already gate
`/dashboard/:path*`, but the route does not exist yet.

## Structure

```
./
├── src/                    # Next.js App Router (src/ layout)
│   ├── app/
│   │   ├── api/auth/callback/route.ts   # handleAuth() — AuthKit-owned
│   │   ├── auth/actions.ts              # 'use server' (signOutAction)
│   │   ├── layout.tsx                   # AuthKitProvider root mount
│   │   └── page.tsx                     # boilerplate, uncustomized
│   ├── components/         # flat; 1 file (nav-auth.tsx)
│   └── middleware.ts       # authkitMiddleware() gates /, /dashboard/*, /api/auth/*
├── docs/
│   ├── architecture/identity-and-access.md   # REQUIRED before auth/tenancy work
│   └── vendor/workos/llms-full.txt           # vendored WorkOS docs (workos-docs ref)
├── hyperplan/              # planning history (plan.md, insights-bundle.md, round-{1,2,3}-*)
├── scrape/                 # source-app recon — Bahasa strings + screenshots for porting
│   └── pages/              # 28 numbered modules (.json + .png each)
├── CONTEXT.md              # domain glossary
├── .opencode/skills/       # workos-authkit, workos-widgets skills
└── opencode.json           # OpenCode references (workos-docs, workos-authkit-sdk)
```

## Where to look

| Task | Location | Notes |
|------|----------|-------|
| Add a route | `src/app/<route>/page.tsx` | Server components by default; `'use client'` for interactivity |
| Add an API endpoint | `src/app/api/<resource>/route.ts` | Anything under `api/auth/*` is AuthKit-owned |
| Add a server action | `src/app/<feature>/actions.ts` | `'use server'` file-mode; feature-folder convention |
| Touch auth/tenancy/roles | `docs/architecture/identity-and-access.md` | **MUST READ first** |
| WorkOS API behavior | `docs/vendor/workos/llms-full.txt` | `workos-docs` reference — consult, don't guess |
| WorkOS AuthKit SDK source | `@workos-inc/authkit-nextjs@^4.1.3` | `workos-authkit-sdk` reference |
| Domain vocabulary (Bahasa) | `CONTEXT.md` | Satuan Pendidikan, Guru, Keanggotaan, etc. |
| Bahasa UI strings to port | `scrape/pages/`, `scrape/dashboard.md` | source-app captures |
| Build order / sequencing | `hyperplan/plan.md` | converged decisions |

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

## Agent skills

### Issue tracker

Issues are tracked in this repo's private GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain-doc layout: root `CONTEXT.md` plus root `docs/adr/` when ADRs are added. See `docs/agents/domain.md`.

## Notes

- `package.json` is intentionally minimal — only `next`, `react`, `react-dom`,
  `@workos-inc/authkit-nextjs`. Drizzle/Supabase/shadcn get added when their
  milestone lands (per `hyperplan/plan.md`).
- `<html lang="en">` in `src/app/layout.tsx` should be `lang="id"` — pending fix.
- `next.config.ts` is empty — any multi-tenant headers/CSP/redirects land here.
- No CI, Docker, Vercel link, or pre-commit hooks yet.
- `.env.example` covers WorkOS only — add `SUPABASE_*` / `DATABASE_URL` when DB
  layer lands.
- No tests yet — Vitest is the intended runner (per `hyperplan/plan.md`).
