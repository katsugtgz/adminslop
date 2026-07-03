# ADR 0004: WorkOS Role Slug Set and Session Invalidation Strategy

## Status

Deferred — pending owner acceptance (human checkpoint). This ADR *records and
reasons about* the role/session posture already in force in the codebase; it
does **not** introduce new roles, change middleware, or wire webhooks. The
decisions below are annotated per-decision: two are **Accepted (current
behavior)**, one is **Deferred with risk**, and one is a **post-MVP ADR gate**.
The owner must ratify the ADR as a whole (moving it to **Accepted**) before a
production Satuan Pendidikan is invited beyond MVP — and must accept the
explicit risk carried by the Deferred sub-decision.

## Date

2026-06-27

## Context

The identity architecture (`docs/architecture/identity-and-access.md`) fixes
four non-negotiable invariants that have, until now, been policy-only with the
mechanics left "to be finalized" (§6, §10, §18, §20):

1. **`tenant_role` is never superuser** — enforced server-side (§A1, §13).
2. **The exact role slug set** must be finalized from requirements, not
   provisioned prematurely (§6).
3. **A fired teacher's session must die immediately on role change** — the
   §A2 "server-controlled revocation" requirement (§10).
4. **The revocation mechanism** must be decided: cookie-expiry-based or
   webhook-driven session store (§10, §18, §20 "Known risks").

Wave 3 (Plan Task 19) asks for a decision pack that resolves these four. This
ADR is that decision pack. It invents nothing — every claim is grounded in file
evidence audited 2026-06-27.

### Current role slug set (audited from `src/lib/auth/types.ts:7-12`)

The canonical closed vocabulary of `tenant_role` slugs, mirrored from the
WorkOS OrganizationMembership `role.slug`, is exactly five:

| Slug | Domain meaning | Scope |
|---|---|---|
| `admin_satuan_pendidikan` | School administrator (tenancy/PTK/akses management) | Tenant-wide admin. |
| `guru` | Teacher / subject teacher | Teaching-scoped. **Least-privilege fallback** — unrecognized slugs collapse here (`membership.ts:26-29`). |
| `wali_kelas` | Homeroom teacher | Homeroom-scoped; subset of guru duties. |
| `kepala_sekolah` | Head of school | Tenant-wide oversight + verification gate (e.g. `draf_ai:verifikasi`, `eraport:terbit`). |
| `dev` | Local-only admin-equivalent shim | **Not a production role.** Enabled only by `DEV_MEMBERSHIP_ALL=true`; throws if set in `NODE_ENV=production` (`membership.ts:44-48`). |

**`superuser` is absent** — verified at three independent layers (T7):

1. **Type layer.** The `RoleSlug` union (`src/lib/auth/types.ts:7-12`) does not
   include `"superuser"`. `npm run typecheck` rejects any assignment of
   `"superuser"` to a `RoleSlug`-typed slot.
2. **Runtime layer.** `KNOWN_ROLES` (`src/lib/auth/membership.ts:11-17`) is a
   `ReadonlySet<string>` of exactly those five slugs. `safeRoleSlug()` returns
   `"guru"` (empty default izin) for any unrecognized slug — an unknown role
   **never** silently gains admin powers.
3. **Database layer.** The `app_user` Postgres role (the role the application
   connection uses — `docker/init.sql`) has `rolsuper=rolbypassrls=rolcreatedb=
   rolcreaterole=false`. A superuser/BYPASSRLS role silently skips RLS, so the
   connection role's privilege set **is** the enforcement mechanism for
   tenant isolation, independent of any string value stored in `peran_akses`.

> **Defense-in-depth GAP (carried from T7, not closed by this ADR).** The
> `peran_akses` column (`src/db/schema.ts:147`, `migrations/0001_akses_ptk.sql:36`)
> is `text not null` with **no CHECK constraint** rejecting `'superuser'`. The
> invariant holds today via the three layers above, so this is **not** a live
> RLS hole. A DB-level closed-vocabulary CHECK would reject the value even if a
> future bug bypassed the type layer (raw SQL, `as any`, a backfill migration).
> **Flagged for a follow-up owner-approved migration** — adding a CHECK is a
> schema change, out of scope for this decisions-only ADR.

### Membership model (audited from `src/lib/auth/{membership,server,resolve-active-tenant}.ts`)

- A **Keanggotaan Satuan Pendidikan** = a WorkOS `OrganizationMembership`
  carrying a `roleSlug`. M:N is honored: one `User`, many memberships.
- `WorkOSMembershipProvider.listForUser()` calls
  `workos.userManagement.listOrganizationMemberships({ userId })` and keeps
  only memberships with `status === "active"` (`membership.ts:66-73`). The
  `roleSlug` is runtime-validated through `safeRoleSlug()` on the way out.
- The Pengguna's **active** Satuan Pendidikan is stored as an httpOnly cookie
  (`ACTIVE_TENANT_COOKIE = "eapp_active_org"`, 30-day maxAge —
  `src/lib/auth/server.ts:11-12`). The cookie holds the **choice** of tenant,
  not the membership or any capability.
- **Crucially:** `getActiveTenantContext()` (`server.ts:22-31`) re-runs
  `listMembershipsForUser(auth.user.id)` **on every protected request**, and
  `resolveActiveTenant()` (`resolve-active-tenant.ts:15-37`) re-validates the
  stored choice against that fresh list. The cookie is **never trusted
  blindly** — a stored orgId that is no longer a real active membership falls
  through to `choose` (many remaining) or `denied` (none remaining).

### Session model (audited from `src/middleware.ts`, callback route, identity doc §7/§10)

- The authenticated session is an **opaque, server-side, httpOnly, SameSite
  cookie** sealed by AuthKit with `WORKOS_COOKIE_PASSWORD`. No client-readable
  JWT; no `auth.uid()`-style tenant-escape vector.
- `authkitMiddleware()` (`src/middleware.ts`) verifies + refreshes the sealed
  session on every matched route (`/`, `/dashboard/:path*`, `/api/auth/:path*`).
- `signOutAction()` (`src/app/auth/actions.ts:13-15`) calls AuthKit `signOut()`,
  clearing the sealed session server-side.
- WebOS Events webhooks are **not wired** (identity doc §18). There is no
  `/api/webhooks/workos` route; signature verification is not implemented.

## Decision

Four decisions. Per-decision status is annotated; the ADR's overall Status is
**Deferred** because at least one sub-decision is Deferred.

### Decision 1 — Role slug set: canonical five, NO superuser — **Accepted (current behavior)**

The canonical `tenant_role` vocabulary for MVP is exactly:

```
admin_satuan_pendidikan | guru | wali_kelas | kepala_sekolah | dev
```

- **No `superuser`**, ever, at any layer. This is final, not provisional.
- `dev` is a **local-only** shim (`DEV_MEMBERSHIP_ALL=true`, non-production).
  It is NOT provisioned as a WorkOS `Role` and MUST NOT be assigned to a real
  OrganizationMembership in any environment.
- The other four are the production role set. WorkOS `Role`s should be
  provisioned (in the sandbox first) with exactly these four slugs when the
  membership-creation UI lands; **do not provision prematurely** (identity doc
  §6) and **do not invent additional slugs** without a follow-up ADR.
- Adding, removing, or renaming any slug requires:
  1. Updating the `RoleSlug` union (`src/lib/auth/types.ts`).
  2. Updating `KNOWN_ROLES` (`src/lib/auth/membership.ts`).
  3. Updating `PERAN_KE_IZIN_DEFAULT` (the role→permission map).
  4. A new ADR superseding this one.
- **Defense-in-depth follow-up (not this ADR):** add a CHECK constraint on
  `peran_akses` rejecting `'superuser'` (and ideally pinning the closed
  vocabulary) via an owner-approved migration. This ADR records the gap; it
  does not close it.

#### Amendment 2026-07-03 — Mechanical enforcement of the `dev` boundary

The original text above describes the `dev` shim as "Enabled only by
`DEV_MEMBERSHIP_ALL=true`; throws if set in `NODE_ENV=production`," citing the
provider-switch guard at `membership.ts:44-54`. That guard alone is necessary
but not sufficient: it only fires when the dev provider is *selected*. A
`"dev"` slug arriving through any other path — a misconfigured staging env,
a hand-edited `OrganizationMembership.role.slug`, a future code path that
bypasses `membershipProvider()` — would pass through `safeRoleSlug`
uncontested and silently mint **Peran Akses dev** for a real **Pengguna**.

The mechanical-enforcement text is therefore tightened (see ADR 0008,
Decision 3). `safeRoleSlug` in `src/lib/auth/membership.ts` now **throws**
when `slug === "dev"` in **any** environment unless
`process.env.DEV_MEMBERSHIP_ALL === "true"`, with the message:

> Peran 'dev' hanya diizinkan saat DEV_MEMBERSHIP_ALL=true — kemungkinan
> misconfiguration.

The existing `"guru"` least-privilege fallback is **kept** for genuinely
unknown slugs; the throw is scoped to `"dev"` only, because `"dev"` is the
one slug whose presence outside the dev shim is always a misconfiguration,
never a benign WorkOS role.

This is **belt and suspenders** with the provider-switch guard at
`membership.ts:44-54`. The two guards cover complementary failure modes:

| Guard | Location | Fires when | Catches |
|---|---|---|---|
| Provider-switch | `membership.ts:44-54` | `DEV_MEMBERSHIP_ALL=true` selected under `NODE_ENV=production` | A production deploy that accidentally inherits the dev env var. |
| Slug-level | `safeRoleSlug` (`membership.ts:28-31`) | Any `"dev"` slug observed without `DEV_MEMBERSHIP_ALL=true` | A `"dev"` slug arriving through any **other** path: misconfigured non-prod env, hand-edited WorkOS membership, or a future bypass of `membershipProvider()`. |

Either guard alone leaves a hole; together they close both. Status of
Decision 1 is unchanged (**Accepted**) — this amendment tightens the
mechanism, not the policy. The closed-vocabulary CHECK-constraint follow-up
above remains open and is unaffected.

### Decision 2 — Membership-change invalidation: per-request re-resolution — **Accepted (current behavior)**

When a `tenant_role` changes or a membership is removed in WorkOS, the change
takes effect on the user's **next request to any protected route** — without a
webhook, without cookie rotation, without a session store.

**Why this works (the load-bearing architectural fact):**

`getActiveTenantContext()` (`server.ts:22-31`) re-fetches the membership list
from WorkOS via `listOrganizationMemberships` on **every** call, and every
protected server component / server action that needs a tenant boundary calls
it (directly or via `withAuth`). The sealed AuthKit session cookie holds the
**user identity**; it does **not** hold membership or role. Membership and
role are resolved per-request, server-side, from WorkOS.

Consequences for the three change-events:

| Event | Effect on next protected request |
|---|---|
| Role changed (e.g. `guru` → `kepala_sekolah`) | `roleSlug` reflects the new slug immediately; izin re-evaluated against the new role. |
| Membership removed (fired teacher) | That `orgId` no longer in the active list. If it was the active tenant: single remaining → auto-select; many remaining → `choose`; none remaining → **`denied`** (Pembatasan Akses). The "fired-teacher session dies" requirement (§A2, §10) is satisfied at the **authorization** layer. |
| Membership `status` flipped to inactive | Same as removal — `listForUser` keeps only `status === "active"` (`membership.ts:67`). |

The `ACTIVE_TENANT_COOKIE` is **not** the membership; it is only the user's
stored *choice*. A stale choice is silently demoted to `choose`/`denied` on the
next request — no explicit cookie-clearing step is required.

### Decision 3 — Session revocation on security event: **Deferred with risk**

Decision 2 covers **authorization** invalidation (role/membership). It does
**not** cover **authentication** invalidation. The two are distinct:

- **Authorization session** ("can I act in this tenant?") — per-request, via
  Decision 2. **Accepted.**
- **Authentication session** ("am I signed in at all?") — held in the sealed
  AuthKit cookie. A user with **zero** memberships is still *authenticated*;
  they see `denied`, not a sign-out page. The sealed session expires on its own
  clock or is cleared by `signOut()`.

For routine personnel actions (hiring, role changes, dismissal), Decision 2 is
sufficient: a fired teacher can no longer read or write any tenant data, even
though their browser still holds a valid *authentication* cookie.

For **security events** (account compromise, credential leak, insider threat,
mass-membership revocation), "they see a denied page" is insufficient — the
sealed session itself must die. The mechanisms available are:

| Mechanism | Status | Notes |
|---|---|---|
| `signOut()` via server action | Available | Requires the user's browser to make a request. Useless against an attacker who has stolen the cookie and is driving their own session. |
| Cookie password rotation (`WORKOS_COOKIE_PASSWORD`) | Available, blunt | Invalidates **every** sealed session across **all** users. Disruptive; incident-only. Owner-only operation. |
| WorkOS session revocation via API / webhook | **Not wired** | Would require a `/api/webhooks/workos` route + signature verification (identity doc §18). Enterprise-grade eventing is deferred. |

**Decision: defer hard-session revocation.** Accept the residual risk that a
stolen sealed cookie remains valid until its natural expiry, mitigated by:

1. The cookie is `httpOnly` + `SameSite` — not readable by XSS, not attached to
   cross-site requests by default.
2. `authkitMiddleware()` refreshes the session on every matched route; a
   revoked-at-WorkOS session will fail refresh on the next request (the refresh
   round-trip is the de-facto revocation channel for compromised sessions, as
   long as WorkOS-side revocation has occurred).
3. Cookie password rotation remains the break-glass lever for mass
   invalidation; it is documented as an incident-only, owner-only operation.

**Trigger conditions for revisiting this deferral (force a follow-up ADR):**

- A real security incident involving session theft.
- A regulatory/insurance requirement for sub-expiry revocation.
- An owner decision to wire WorkOS Events webhooks (which would also unlock
  audit-log-driven revocation and is itself gated by identity doc §18).
- Adoption of an enterprise WorkOS feature (SSO, Directory Sync) whose threat
  model assumes webhook-driven revocation.

### Decision 4 — Cross-school / Instansi Pengelola: post-MVP ADR gate

**MVP is single-school scope.** Cross-tenant access is a **ship-blocker bug**
(identity doc §13), not a feature. The `tenant_id` of the request is derived
solely from the authenticated session's active membership, never from a
client-supplied org id, and RLS enforces isolation at the DB layer.

**Instansi Pengelola** (oversight org — Yayasan, Dinas, etc.) is an
**optional, deferred** org-of-orgs layer above the Satuan Pendidikan (identity
doc §4). It is:

- **NOT** provisioned in the WorkOS dashboard.
- **NOT** modeled in the DB schema or the `RoleSlug` set.
- **NOT** a `tenant_role`.

A concrete oversight/purchasing/cross-school-reporting requirement — backed by
an entry in `hyperplan/` or `CONTEXT.md` AND explicit owner approval — is the
gate to open a follow-up ADR. That ADR must decide, at minimum:

- Whether Instansi Pengelola is a WorkOS org-of-orgs, a separate `Organization`
  type, or an app-layer concept.
- Whether a new `lintas_satuan:baca`-style permission is needed (flagged in
  T5's post-MVP ADR grouping, item #22).
- How cross-yayasan RLS would be enforced without weakening the current
  single-`tenant_id` isolation invariant.

Until that ADR lands, any code that crosses tenant boundaries is a bug.

## Consequences

**Positive**

- The role vocabulary is closed, typed, and regression-guarded (T7's type +
  runtime + DB-privilege tests). Adding a role is a deliberate, multi-file act.
- Membership-change invalidation is **free** — it falls out of the per-request
  server-side tenant resolution that the architecture already mandates. No
  webhook infra, no session store, no cookie-rotation chore on every role edit.
- The "fired teacher" requirement is met at the layer that matters (they cannot
  read/write tenant data), without over-engineering authentication revocation.
- Tenant isolation is independent of the `peran_akses` string value: even a
  hypothetical `'superuser'` value in that column cannot escape RLS, because
  `app_user` is non-superuser and non-BYPASSRLS.

**Negative / risk**

- **Authentication-session revocation on security events is deferred** (Decision 3).
  A stolen sealed cookie is valid until natural expiry or a cookie-password
  rotation. The mitigations are real (httpOnly/SameSite, refresh-round-trip
  revocation) but are not a substitute for webhook-driven revocation in a
  hard-compromise scenario.
- **`peran_akses` has no DB CHECK** rejecting `'superuser'` (T7 gap). The
  invariant holds via three other layers, but defense-in-depth is incomplete
  until a follow-up migration lands.
- **No webhook channel exists**, so WorkOS-side events (role changes made in
  the dashboard, directory-sync pushes) are only reflected when the affected
  user's browser next hits a protected route. For an idle user this could be
  hours; their session remains "authorized" in the sense that the *next*
  request will be denied, but no proactive push-out occurs.
- **Cross-school / Instansi Pengelola is unmodeled.** Any MVP-era stakeholder
  request for yayasan-level reporting must be refused until the post-MVP ADR
  lands; ad-hoc cross-tenant queries would violate the ship-blocker rule.

**Neutral**

- The `ACTIVE_TENANT_COOKIE` (30-day maxAge) can outlive a membership. This is
  benign — it is re-validated every request — but means the cookie name is a
  stable contract and renaming it is a coordinated change.

## Alternatives considered

### A. Add `superuser` as an escape-hatch role

**Rejected.** Directly violates identity doc §6/§13 and the §A1 hard constraint.
There is no MVP scenario that requires a global superuser; tenant admins
(`admin_satuan_pendidikan`) plus the `dev` local shim cover every legitimate
need. A superuser role would also defeat the RLS ship-blocker test (T7
invariant #3).

### B. Store membership/role in the sealed session to avoid the per-request WorkOS round-trip

**Rejected.** This is exactly the client-readable-JWT / `auth.uid()` tenant-escape
vector that §A2 explicitly rejects (identity doc §1, §10). Caching role in the
session would also re-introduce the revocation problem that Decision 2 avoids:
a cached role could not reflect a WorkOS-side change until session refresh, and
refresh semantics are less auditable than a fresh `listOrganizationMemberships`
call. The per-request round-trip is the price of server-controlled revocation;
it is worth paying.

### C. Wire WorkOS Events webhooks now to get proactive revocation

**Rejected for MVP.** Identity doc §18 explicitly defers webhooks. Wiring them
requires a signed webhook route, secret management, replay protection, and
agreement on which event types drive which actions — none of which is needed
for MVP personnel flows (Decision 2 covers them). Webhooks are the right answer
to Decision 3's residual risk, but they are gated behind a concrete security
requirement + owner approval (see Decision 3 triggers).

### D. Model Instansi Pengelola now as a WorkOS org-of-orgs

**Rejected.** No concrete oversight/reporting requirement is backed by
`hyperplan/` or `CONTEXT.md`. Premature modeling would either weaken the
single-`tenant_id` RLS invariant or create a dead schema. Deferred to the
post-MVP ADR gate (Decision 4).

### E. Enterprise WorkOS features (SSO, Directory Sync/SCIM, MFA enforcement, Admin Portal, FGA, Vault, Radar, Custom Domains)

**Explicitly deferred** (identity doc §19). None are required for MVP. Each
would change the threat model (e.g. SCIM-driven membership sync interacts with
Decision 2's per-request resolution; FGA would sit alongside, not replace, the
`tenant_role` layer). Any adoption requires its own ADR + owner approval and
must surface its paid/enterprise status before implementation.

## References

- `docs/architecture/identity-and-access.md` — §6 (roles), §10 (session
  revocation requirement), §13 (tenant isolation ship-blocker), §18 (webhooks
  deferred), §19 (enterprise features deferred), §20 (known risks this ADR
  resolves).
- `src/lib/auth/types.ts:7-12` — `RoleSlug` union (canonical five, no
  superuser).
- `src/lib/auth/membership.ts:11-29,66-73` — `KNOWN_ROLES`, `safeRoleSlug`
  (least-privilege fallback), active-membership filtering.
- `src/lib/auth/server.ts:11-31` — `ACTIVE_TENANT_COOKIE`, per-request
  `getActiveTenantContext()`.
- `src/lib/auth/resolve-active-tenant.ts:15-37` — cookie re-validation rules
  (`denied` / `choose` / `active`).
- `src/middleware.ts` — `authkitMiddleware()` matchers.
- `src/app/auth/actions.ts:13-15` — `signOutAction` / AuthKit `signOut()`.
- `src/db/schema.ts:147`, `src/db/migrations/0001_akses_ptk.sql:36` —
  `peran_akses` (no CHECK; defense-in-depth gap).
- T7 learnings (`.omo/notepads/post-mvp-roadmap-hyperplan/learnings.md`) —
  three-layer never-superuser invariant, `peran_akses` CHECK gap.
- T10 (`docs/adr/0002-pii-at-rest-strategy.md`), T13
  (`docs/adr/0003-mvp-ai-strategy.md`) — ADR house style + Deferred-status
  precedent.
- ADR 0001 (`docs/adr/0001-global-reference-tables.md`) — global-vs-tenant
  scoping precedent referenced in Context.
