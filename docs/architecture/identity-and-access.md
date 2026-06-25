# Identity and Access Architecture

> Status: **Active.** Source of truth for authentication, tenancy, roles, and
> authorization in EduAdmin Pro Premium.
>
> Read this **before** changing anything under auth, organizations, roles,
> memberships, or session handling. Load the `workos-authkit` OpenCode skill for
> WorkOS mechanics; this document defines the project's policy.

## 1. Why WorkOS was selected

The project's converged architecture (`hyperplan/insights-bundle.md` §A1, §A2)
requires, non-negotiably:

- **Multi-tenancy with M:N user↔tenant membership** (`Keanggotaan Satuan
  Pendidikan`).
- **`tenant_role` that is never superuser**, enforced server-side.
- **Opaque, server-side, httpOnly session** — the deliberate rejection of
  client-side JWT / `auth.uid()` as a tenant-escape vector (§A2).
- **Server-controlled session revocation** (a fired teacher's session dies
  immediately on role change).

WorkOS AuthKit maps onto this model with almost no impedance mismatch:

| Project requirement | WorkOS primitive |
|---|---|
| Operational data boundary (tenant) | `Organization` |
| M:N membership | `OrganizationMembership` |
| Never-superuser role | `Role` / membership `roleSlug` |
| Opaque server httpOnly session | AuthKit sealed session cookie |
| Server-controlled revocation | Session cookie is server-minted; role changes invalidate |

> **Decision (owner, 2026-06-25):** WorkOS AuthKit **replaces** the plan's
> original "Supabase Auth + Google OAuth" choice (§A2). **Supabase is retained
> for DB / Row-Level Security / pgvector only.** No Supabase Auth.

## 2. Ownership boundaries

### What WorkOS owns

- User identity (`User`), credentials, password/Passkey/Magic-Auth.
- `Organization` (the **Satuan Pendidikan**) lifecycle.
- `OrganizationMembership` (the **Keanggotaan Satuan Pendidikan**) lifecycle.
- `Role` definitions and `roleSlug` assignment per membership.
- Session minting, sealing, verification, and revocation.
- The sign-in / sign-out / callback flows.

### What the application database (Postgres/Supabase) owns

- All **business data**: students (siswa), grades (nilai), raports, attendance,
  teaching devices (perangkat ajar), AI job records, curriculum seed corpus,
  audit log.
- **`tenant_id`** column + Row-Level Security policy on **every** tenant-scoped
  table (§A1). RLS uses `SET LOCAL app.tenant_id` per transaction (PgBouncer-safe).
- **Stable WorkOS identifiers** where a join is needed (e.g. a `user.id`,
  `organization.id` foreign reference) — **not** tokens, sessions, or secrets.
- Application-level authorization decisions that depend on business state the
  WorkOS role alone cannot express.

> **Never store** in the app DB: WorkOS access tokens, refresh tokens, raw
> sealed sessions, or passwords. AuthKit owns those in the httpOnly cookie.

## 3. User identity model

- A **Pengguna** = one WorkOS `User` (stable `user.id`), shared across all their
  memberships.
- One person who teaches at two schools is **one** `User` with **two**
  `OrganizationMembership`s — matching the domain glossary's M:N rule
  (`CONTEXT.md`).
- `User ↔ Identity` (1:N, verified-email match) from §A2 is satisfied by WorkOS
  user identities; the app does not re-implement identity linking.

## 4. Organization / tenant model

- A **Satuan Pendidikan** (SD/SMP/SMA/SMK/madrasah) = one WorkOS `Organization`.
- The `Organization` is the **primary operational data boundary**. All
  tenant-scoped app data is partitioned by `tenant_id` = `organization.id`.
- **Instansi Pengelola** (oversight org, e.g. Yayasan/Dinas) is an **optional,
  deferred** layer above the Satuan Pendidikan. It is **not** provisioned in the
  WorkOS dashboard and **not** modeled as an org-of-orgs until a concrete
  requirement + owner approval exists.

> **Do not provision** organizations in the WorkOS dashboard until their meaning
> is backed by a requirement in `hyperplan/` or `CONTEXT.md`.

## 5. Organization membership model

- **Keanggotaan Satuan Pendidikan** = WorkOS `OrganizationMembership`, carrying
  a `roleSlug` (= `tenant_role`).
- A `Pengguna` selects an active Satuan Pendidikan (active membership) before
  viewing students, grades, raports, attendance, or teaching devices
  (`CONTEXT.md` example dialogue). The selected membership's `organization.id`
  becomes the request's `tenant_id`.
- M:N is honored: one `User`, many `OrganizationMembership`s; switching active
  school rebinds `tenant_id` for the session.

## 6. Roles and permissions

- `tenant_role` is **never superuser** (§A1 hard constraint). WorkOS `Role`s are
  defined so no role grants cross-tenant or global-admin reach.
- Concrete role slugs are derived from the source application's persona set
  (see `scrape/`): **`guru`** (teacher / class teacher / subject teacher),
  **`kepala_sekolah`** (head of school), and school-administrative staff
  variants. Exact slug set is finalized during Phase 1/2 implementation; **do
  not provision roles in WorkOS prematurely** — finalize the list from
  requirements first.
- Authorization is **two-layered**:
  1. **WorkOS RBAC** — coarse, membership-level (`roleSlug`). Answers "is this
     user a member with this role in this org?".
  2. **App-layer authorization** — fine-grained, business-state-aware (e.g. "is
     this teacher assigned to *this* class/mapel?"). Lives in server code +
     RLS, not in WorkOS.

## 7. Authentication flow

1. Unauthenticated request → `src/middleware.ts` (`authkitMiddleware()`) routes
   to WorkOS-hosted AuthKit sign-in.
2. User authenticates (email/password, Passkey, Magic Auth, or social —
   enterprise SSO is **deferred**, see §15).
3. WorkOS redirects to **`http://localhost:3000/api/auth/callback`** (dev) /
   production callback, handled by `handleAuth()` in
   `src/app/api/auth/callback/route.ts`.
4. AuthKit seals an opaque session into an **httpOnly, SameSite cookie**. No
   client-readable JWT.
5. Subsequent requests: `authkitMiddleware()` verifies + refreshes the session.

## 8. Sign-in / sign-out flow

- **Sign in:** client calls AuthKit (e.g. `refreshAuth({ ensureSignedIn: true })`
  as wired in `src/components/nav-auth.tsx`).
- **Sign out:** server action `signOutAction` (`src/app/auth/actions.ts`) →
  AuthKit `signOut()` clears the sealed session server-side.

## 9. Callback flow

- Single callback route: `src/app/api/auth/callback/route.ts` (`GET = handleAuth()`).
- Redirect URI registered on the WorkOS sandbox environment:
  `http://localhost:3000/api/auth/callback` (created by the installer).
- Production redirect URI must be registered in the **production** WorkOS
  environment before go-live (manual dashboard action, see §17).

## 10. Session handling

- **Opaque, server-side, httpOnly, SameSite** cookie (AuthKit sealed session).
- The app **never** reads a JWT client-side for tenant context. Tenant identity
  is resolved server-side from the authenticated session's active membership,
  then injected as `SET LOCAL app.tenant_id` for the DB transaction (§A1).
- **Revocation:** changing a user's `tenant_role` (e.g. firing a teacher) must
  invalidate their session server-side so the next request is rejected. This is
  the §A2 "fired-teacher session dies" requirement.

## 11. Protected routes

- `src/middleware.ts` matcher: `/`, `/dashboard/:path*`, `/api/auth/:path*`.
- Any future tenant-scoped route (`/sekolah/:path*`, etc.) must be added to the
  matcher **without** removing the existing auth matcher.

## 12. Server-side authorization boundaries

- Authorization checks happen in **server components, server actions, and route
  handlers** — never only in client UI.
- Every protected action verifies: (a) authenticated session exists, (b) the
  user has a membership in the target `Organization`, (c) their `tenant_role`
  permits the action, (d) fine-grained app rules pass.
- Client UI may *hide* controls, but hiding is **not** authorization.

## 13. Organization data-isolation rules

- All tenant-scoped queries carry `tenant_id` and are protected by RLS policies.
- A request's `tenant_id` is derived from the **authenticated session's active
  membership**, never from a client-supplied org id.
- Cross-tenant access is a **ship-blocker bug** (§A1). The Phase 1 exit test
  ("user in School A cannot read/write School B rows") must stay green.

## 14. Onboarding flow

- Provisional (finalize during Phase 2): admin creates a **Satuan Pendidikan**
  (WorkOS `Organization`), then the first **Pengguna** is given an
  `OrganizationMembership` with an administrative `tenant_role`. Subsequent
  members join via membership creation (WorkOS-managed) — **not** via unscoped
  open sign-up.

## 15. Invitation flow

- **Deferred.** WorkOS invitations/Admin Portal embeds are enterprise-gated and
  not required for MVP. Do not enable without owner approval (see §15 below).

## 16. Environment-variable responsibilities

| Variable | Scope | Notes |
|---|---|---|
| `WORKOS_API_KEY` | **server-only** (`sk_test_*` in sandbox) | Never expose. |
| `WORKOS_CLIENT_ID` | public (safe client-side) | Only value OK in `NEXT_PUBLIC_*`. |
| `WORKOS_COOKIE_PASSWORD` | **server-only** | Seals session cookie. Must be stable; rotate on incident only. |

- `.env` is gitignored. `.env.example` holds placeholders only.
- See `.env.example` for exact keys required by the installed SDK.

## 17. Environment separation

- **Local / sandbox:** WorkOS **sandbox** environment (`sk_test_*`). All
  development runs here. No production changes without explicit owner approval.
- **Staging / production:** separate WorkOS environments with their own
  credentials, configured on the hosting provider (never committed). Production
  redirect URI must be registered in the production environment before go-live.

## 18. Webhook requirements

- **Deferred for MVP.** WorkOS webhooks (Events) are not wired. When session
  revocation on role-change (§10) needs to be fully event-driven, a webhook
  route + signature verification will be added — gated on a concrete requirement
  and owner approval.

## 19. Deferred enterprise features (DO NOT enable without approval)

These are WorkOS paid/enterprise capabilities. They are **intentionally off**.
Surface the cost/enterprise status *before* implementing any of them:

- Single Sign-On (SSO / SAML)
- Directory Sync (SCIM)
- MFA enforcement
- Admin Portal embeds / WorkOS Widgets
- Fine-Grained Authorization (FGA)
- Vault, Radar, Custom Domains, Pipes, Feature Flags
- Organization invitations via WorkOS

## 20. Known risks and unresolved decisions

- **Exact `tenant_role` slug set** — finalize from source-app personas before
  provisioning WorkOS `Role`s (see §6).
- **Session revocation mechanism** — confirm whether role-change revocation is
  cookie-expiry based or requires a webhook-driven session store (§10, §18).
- **Instansi Pengelola modeling** — deferred; may need org-of-orgs or a separate
  concept when oversight/purchasing relationships materialize (§4).
- **Next.js version** — pinned to 15.3 LTS-line; Next 16 is a future 1-line bump
  (authkit peers allow `^16`).
