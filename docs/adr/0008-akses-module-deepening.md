# ADR 0008: Akses Module Deepening

## Status

Accepted. This ADR records six converged decisions from the Akses module
deepening grilling (2026-07-03). It amends ADR 0004 Decision 1 (see the
"Amendment 2026-07-03" note appended there) and opens one deferred item
tracked as a separate GitHub issue (the pengaturan Style B migration,
referenced in Decision 4).

## Date

2026-07-03

## Context

The Akses module is the authorization spine of the product. Every
tenant-scoped server component and every server action crosses its seam. The
identity architecture (`docs/architecture/identity-and-access.md` §10, §12,
§13) fixes three invariants the module must uphold:

- §10 — server-controlled revocation: the **Keanggotaan Satuan Pendidikan**
  is re-resolved server-side on every protected request;
- §12 — authorization is server-side: hiding UI is not authorization, and
  every protected action must pass through an **Izin Akses** evaluation;
- §13 — tenant isolation ship-blocker: `tenant_id` comes only from the
  authenticated active membership, never from the client, and RLS enforces
  it at the DB.

A focused deepening review on 2026-07-03 found five pressure points in the
module as it stood:

1. **Five crypto unseals per round-trip, scattered across five modules.**
   The sealed AuthKit session was being unsealed (via `withAuth()`) up to
   five times in a single protected request: `requireAuth()`,
   `getActiveTenantContext()`, `getAuthenticatedUserId()`, the
   disambiguation call in `src/app/dashboard/page.tsx`, and one more inside
   `getAksesSaya()`. Each unseal is server-side AES decryption with the
   `WORKOS_COOKIE_PASSWORD`. Five decryptions of the same cookie per request
   is wasted work and a confusing surface for maintainers.

2. **Authorization composition is scattered.** A caller wanting the answer
   to "what can this **Pengguna** do in the active **Satuan Pendidikan**?"
   had to assemble it: call `requireAuth()`, call
   `getActiveTenantContext()`, then load izin and pembatasan, then evaluate.
   The shape had no single composition point. That is a shallow module by
   the deletion test — deleting `getAksesSaya()` would force every caller to
   reassemble the same pipeline.

3. **`dev` role leak surface.** ADR 0004 Decision 1 closes the `tenant_role`
   vocabulary at five slugs and forbids `superuser`. But the `dev` shim —
   a local-only role intended solely for `DEV_MEMBERSHIP_ALL=true` — was
   accepted by `safeRoleSlug` unconditionally. The provider-switch guard at
   `membership.ts:44-54` only catches the case where the dev *provider* is
   selected under `NODE_ENV=production`. A `"dev"` slug arriving any other
   way (misconfigured non-prod env, hand-edited WorkOS membership, a future
   code path) would mint **Peran Akses dev** silently. This is the gap ADR
   0004 D1's amendment tightens.

4. **Disambiguation hack in the denied branch.** `TenantResolution` and
   `AksesSaya` returned `{ status: "denied" }` with no information about
   whether the **Pengguna** was authenticated. The dashboard entry page
   needed that bit to decide between "show sign-in CTA" and "show
   Pembatasan Akses CTA", so it called `getAuthenticatedUserId()`
   separately and threaded the result by hand. This produced the
   **Pembatasan Akses CTA bug**: a caller could forget the second call (or
   pass a stale value) and render the wrong CTA — a real authorization-adjacent
   UX bug, not a cosmetic one.

5. **Style A / Style B inconsistency.** Fifteen feature modules evaluate
   izin through `akses.boleh(slug)` (Style A — pembatasan-aware, the
   canonical path through `evaluasiAkses`). The pengaturan module evaluates
   through `canAdminSatuanPendidikan(roleSlug)` (Style B — a pure
   role-predicate that is **pembatasan-immune**). Any **Pembatasan Akses**
   row against a pengaturan izin is silently ignored today. That is
   probably a bug, but fixing it is a behavior change that needs owner
   sign-off and is **not** coupled to the deepening work.

The deepening grilling converged on six decisions, recorded below.

## Decision

Six decisions. Each is **Accepted** unless noted.

### Decision 1 — Composition shape: composed resolver + thin escape hatch (Shape A2) — **Accepted**

The Akses module's external seam exposes **two** functions, with deliberately
asymmetric depth:

1. **`getAksesSaya()` — the deep, composed resolver.** This is the canonical
   entry point. One call returns the full authorization answer for the
   active **Satuan Pendidikan**: the resolved **Keanggotaan Satuan
   Pendidikan**, the **Pengguna** row, the **Izin Akses** slugs, the
   **Pembatasan Akses** slugs, and a `boleh(diminta)` evaluator closed over
   all of them. Internally it composes `getActiveTenantContext()` +
   `getAuthenticatedUserId()` + the akses repository + the pure
   `evaluasiAkses`. Callers and tests cross one seam and get the full
   answer.

2. **`getAuthenticatedUserId()` — the thin, session-only escape hatch.**
   Returns the authenticated **Pengguna** id without resolving tenant
   context. Reserved for callers that need session-only identity and cannot
   tolerate the tenant-resolution step (e.g. `signOutAction`'s audit log,
   cookie writes). Its scope is documented in its docstring (see Decision 5
   and the docstring update in `src/lib/auth/server.ts`).

**Rejected — Shape A1 (single function, no escape hatch).** A1 would force
every session-only caller — including `signOutAction` — through the full
`getAksesSaya()` pipeline, which means a Pengguna with zero memberships
could not sign out cleanly (the pipeline returns `denied` before the caller
ever sees the userId). Signing out is an authentication operation, not an
authorization one; it must work when authorization says "denied".

**Rejected — Shape A3 (wrap `getAksesSaya` in `cache()` to dedupe unseals).**
React's `cache()` (request-scoped memoization) would mask the multiple
`withAuth()` calls and is a tempting optimization. It fails the **deletion
test**: if the optimizer is deleted, the underlying duplication reappears
across N call sites. The right fix is to reduce the number of unseals at
the composition layer (this ADR's other decisions), not to memoize around
the duplication. `cache()` also introduces subtle request-scoped state that
makes the authorization path harder to reason about in tests.

### Decision 2 — Disambiguation bit: widen `denied` with `authenticated: boolean` — **Accepted**

Both `TenantResolution` (in `src/lib/auth/types.ts`) and `AksesSaya` (in
`src/lib/auth/akses-saya.ts`) widen their `denied` branch to carry:

```ts
{ status: "denied"; authenticated: boolean }
```

The composed resolver already knows the answer — it called `withAuth()` and
`listOrganizationMemberships()` on the way to `denied`, so populating the
bit is zero extra cost. Plumbing it through the type forces the bit to
travel with the resolution object; the **Pembatasan Akses CTA bug** cannot
recur because a caller can no longer construct a `denied` value without
stating whether the **Pengguna** is authenticated.

Concretely:

- `src/app/dashboard/page.tsx` drops its separate `getAuthenticatedUserId()`
  call and reads `authenticated` off the `denied` resolution it already
  holds. This removes one crypto unseal from the round-trip.
- `src/components/pembatasan-akses.tsx` takes the `denied` resolution (or
  its `authenticated` field) instead of an optional `authenticated?` prop
  that callers could forget. The bit flows from the type.
- All seventeen `src/app/dashboard/<feature>/page.tsx` consumers of
  `<PembatasanAkses>` are updated to pass the new shape.

This is a backward-compatible addition for callers that ignored the field;
the field is required in the type, so all `denied` returns must populate it.

### Decision 3 — `dev` slug guard: throw in any env unless `DEV_MEMBERSHIP_ALL=true` — **Accepted**

`safeRoleSlug` in `src/lib/auth/membership.ts` throws when
`slug === "dev"` in **any** environment unless
`process.env.DEV_MEMBERSHIP_ALL === "true"`. The throw message is in
Bahasa Indonesia to match the rest of the module:

> Peran 'dev' hanya diizinkan saat DEV_MEMBERSHIP_ALL=true — kemungkinan
> misconfiguration.

The existing `"guru"` least-privilege fallback for genuinely unknown slugs
is **kept**. The throw is scoped to `"dev"` only: `"dev"` is the one slug
whose presence outside the dev shim is always a misconfiguration, never a
benign WorkOS role. Unknown slugs are still a real possibility (a WorkOS
dashboard typo, a future role not yet reflected in `KNOWN_ROLES`) and
collapsing them to `"guru"` is the safe least-privilege behavior.

This decision tightens ADR 0004 Decision 1. See the "Amendment 2026-07-03 —
Mechanical enforcement of the `dev` boundary" subsection appended to ADR
0004 for the belt-and-suspenders relationship with the provider-switch guard
at `membership.ts:44-54`. Status of ADR 0004 D1 is unchanged (Accepted);
this decision tightens the mechanism, not the policy.

### Decision 4 — Pengaturan Style B migration: DEFER — **Deferred (separate issue)**

The pengaturan module's `canAdminSatuanPendidikan(roleSlug)` call is
**pembatasan-immune** (Style B). The other fifteen feature modules use
`akses.boleh(slug)` (Style A, pembatasan-aware). Today any **Pembatasan
Akses** row against a pengaturan izin is silently ignored. This is
**probably a bug**, but fixing it is a **behavior change**: a real
**Satuan Pendidikan** with an active pembatasan row against pengaturan
would see its admins newly blocked.

**Decision: defer.** The deferral is tracked in a separate GitHub issue
(see References). Reasons:

1. The deepening work is a refactor that should not change user-visible
   behavior. Migrating pengaturan from Style B to Style A *would* change
   behavior for any tenant that has a pembatasan row against a pengaturan
   izin.
2. Owner sign-off is required before changing how admin access to
   pengaturan is gated. The Pengaturan surface controls operational
   defaults (`Pengaturan Satuan Pendidikan` per `CONTEXT.md`); locking
   admins out of it by surprise is a high-blast-radius change.
3. The deferral is not coupled to the deepening: the new
   `requireAksesAktif(izin)` helper (added by this deepening) does not
   depend on the migration, and the Style B call site continues to work
   unchanged.

A code comment is added at the `canAdminSatuanPendidikan(roleSlug)` call
site in `src/app/dashboard/pengaturan/actions.ts` noting that this is
Style B, that it is pembatasan-immune, and that the migration is tracked
in the deferral issue.

### Decision 5 — Escape hatch name: keep `getAuthenticatedUserId` — **Accepted**

The thin session-only escape hatch (Decision 1, item 2) keeps the name
`getAuthenticatedUserId`. Rejected alternatives (`getSessionUserId`,
`getAuthUserIdOnly`, `requireSessionUserId`) were considered and rejected
for one of two reasons: they either implied a throw on missing session
(the function deliberately returns `null`, because "no session" is a normal
authorization outcome, not an exceptional one), or they obscured the
"authenticated" qualifier that ties the function to the WorkOS session
model.

The narrow scope is documented in the function's docstring in
`src/lib/auth/server.ts`:

> Returns the authenticated Pengguna ID without resolving tenant context.
> Use only for callers that need session-only identity (e.g.
> `signOutAction` audit log, cookie writes). For all tenant-aware callers,
> use `getAksesSaya()` or `requireAksesAktif(izin)` instead — they compose
> this call with membership resolution and izin evaluation.

### Decision 6 — Documentation: this ADR + ADR 0004 amendment + pengaturan deferral issue — **Accepted**

The deepening is recorded in three artifacts, each at the right altitude:

1. **This ADR (0008)** — the six converged decisions, the rejected shapes,
   and the consequences.
2. **ADR 0004 amendment** — the mechanical-enforcement tightening of
   Decision 1's `dev` boundary. Lives where the policy was first stated.
3. **GitHub issue (pengaturan deferral)** — the deferred Style B → Style A
   migration with the reason and the gate for reopening. Lives in the
   issue tracker because it is a behavior change awaiting owner sign-off,
   not a policy decision.

No single artifact tries to carry all three. The ADR suite records policy;
the issue tracker tracks deferred behavior changes.

## Consequences

**Positive**

- **Crypto unseals drop from up to five per round-trip to two** (one in
  `getActiveTenantContext` via `withAuth`, one in `getAuthenticatedUserId`
  when `getAksesSaya` needs the userId for the pengguna lookup). The
  disambiguation unseal in `src/app/dashboard/page.tsx` is gone.
- **Authorization has one composition point.** `getAksesSaya()` is deep:
  a large amount of behavior (tenant resolution + membership + izin +
  pembatasan + evaluation) sits behind a small interface. The deletion
  test passes — deleting it would force every caller to reassemble the
  pipeline. A new helper `requireAksesAktif(izin)` (added by this
  deepening) narrows the common action prologue (require auth + active
  tenant + izin check) to one call returning `AksesAktif`.
- **Defense-in-depth on the `dev` boundary.** The slug-level guard in
  `safeRoleSlug` and the provider-switch guard at `membership.ts:44-54`
  cover complementary failure modes. Either alone leaves a hole; together
  they close both. See ADR 0004 D1 amendment table.
- **The Pembatasan Akses CTA bug cannot recur.** The `authenticated` bit
  is part of the `denied` type; a caller cannot construct or consume a
  `denied` value without confronting the bit. Locality improves: the
  disambiguation knowledge lives at the resolver seam, not at every page.
- **`getAksesSaya` is the seam tests cross.** Tests and callers exercise
  the same interface; mocking through the seam is no longer needed to
  reach the evaluator.

**Negative / risk**

- **Pengaturan Style B tech debt is acknowledged, not fixed.** Any
  **Pembatasan Akses** row against a pengaturan izin continues to be
  silently ignored until the deferred migration lands. The deferral is
  deliberate (behavior change, owner sign-off) and tracked in a GitHub
  issue, but the inconsistency is real and a future contributor could
  mis-read pengaturan as a model for new modules. The code comment at
  the Style B call site mitigates this.
- **Two functions at the seam, not one.** The escape hatch
  (`getAuthenticatedUserId`) is a second, deliberately shallow seam. A
  contributor could reach for it when they should reach for
  `getAksesSaya()`. The docstring (Decision 5) is the mitigation; the
  escape hatch is also the smaller of the two by far, so the wrong-choice
  failure mode is recoverable.
- **`cache()` is explicitly not used.** A future performance regression
  that points at `withAuth()` cost cannot be solved by "just wrap it in
  `cache()`" without revisiting this ADR's reasoning. The right lever is
  to reduce unseals at the composition layer, which is what this ADR did.

**Neutral**

- The widened `denied` type is backward-compatible for callers that ignore
  the new field, but every `denied` *producer* must populate it. This is
  the desired property — it is what makes the bit trustworthy.

## Alternatives considered

### A. Shape A1 — single function, no escape hatch

Rejected. Forces `signOutAction` and other session-only callers through
the full `getAksesSaya()` pipeline, which returns `denied` for a Pengguna
with zero memberships before the caller can see the userId. Signing out
must work when authorization says "denied".

### B. Shape A3 — wrap `getAksesSaya` in React `cache()`

Rejected. Fails the deletion test (deleting the cache re-exposes the
duplication across N callers). Hides the duplication rather than removing
it. Adds request-scoped state to the authorization path that complicates
tests.

### C. Pass `authenticated` as a separate side-channel (status quo)

Rejected. The status quo — the dashboard page calls
`getAuthenticatedUserId()` separately and threads the result by hand — is
exactly what produced the Pembatasan Akses CTA bug. The fix is to force
the bit into the type so callers cannot forget.

### D. Throw on every unknown slug, not just `dev`

Rejected. Unknown slugs are a real possibility (WorkOS dashboard typo, a
future role not yet in `KNOWN_ROLES`). Collapsing them to `"guru"` (empty
default izin) is the safe least-privilege behavior and matches ADR 0004
Decision 1's least-privilege fallback. Only `"dev"` is special-cased to
throw, because only `"dev"` is unambiguously a misconfiguration when seen
outside the dev shim.

### E. Migrate pengaturan to Style A as part of this deepening

Rejected (deferred). The migration is a behavior change for any tenant
with an active pembatasan row against a pengaturan izin. It is not coupled
to the deepening and needs owner sign-off. Tracked in a separate GitHub
issue. See Decision 4.

### F. Rename the escape hatch

Rejected. Every alternative either implied a throw on missing session (the
function returns `null`) or dropped the "authenticated" qualifier that
ties the function to the WorkOS session model. See Decision 5.

## References

- `docs/adr/0004-workos-role-session-strategy.md` — Decision 1 (canonical
  role vocabulary, no `superuser`, the `dev` local-only shim) and its
  2026-07-03 amendment tightening the `dev` mechanical enforcement. This
  ADR's Decision 3 is the slug-level half of that belt-and-suspenders
  pair.
- `docs/adr/0002-pii-at-rest-strategy.md` — parallel defense-in-depth
  reasoning for PII controls. The deepening's "two guards covering
  complementary failure modes" pattern mirrors 0002's layered posture.
- `docs/architecture/identity-and-access.md` — §10 (server-controlled
  revocation: Keanggotaan re-resolved per request), §12 (authorization is
  server-side: hiding UI is not authorization), §13 (tenant isolation
  ship-blocker: tenant_id only from the active membership).
- `src/lib/auth/membership.ts:28-31,44-54` — `safeRoleSlug` (slug-level
  `dev` guard added by this ADR) and `membershipProvider` (provider-switch
  guard; belt and suspenders with the slug-level guard).
- `src/lib/auth/server.ts:22-37` — `getActiveTenantContext` (the deep
  composed resolver's tenant leg) and `getAuthenticatedUserId` (the thin
  session-only escape hatch whose docstring is updated by this ADR).
- `src/lib/auth/akses-saya.ts` — `getAksesSaya` (the deep composed
  resolver; the module's canonical seam) and the widened `denied` branch
  carrying `authenticated`.
- `src/lib/auth/types.ts` — `TenantResolution` discriminated union, whose
  `denied` branch is widened with `authenticated: boolean` by this ADR.
- `src/app/dashboard/page.tsx` — the entry page that previously called
  `getAuthenticatedUserId()` separately to disambiguate; the bit now
  flows from the `denied` resolution.
- `src/components/pembatasan-akses.tsx` — the CTA component whose
  `authenticated` prop is sourced from the `denied` resolution rather
  than a caller-supplied value.
- `src/app/dashboard/pengaturan/actions.ts` — the Style B call site
  (`canAdminSatuanPendidikan(roleSlug)`); migration deferred (Decision 4)
  and tracked in the pengaturan deferral GitHub issue.
- GitHub issue: pengaturan Style B → Style A migration deferral (to be
  filed 2026-07-03 against `katsugtgz/adminslop`; see issue tracker).
- `LANGUAGE.md` of the `improve-codebase-architecture` skill — module,
  interface, seam, depth, deletion test, locality, leverage: the
  vocabulary used in this ADR to reason about the composition shape.
