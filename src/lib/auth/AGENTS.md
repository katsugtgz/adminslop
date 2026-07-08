# src/lib/auth/AGENTS.md

AuthKit, tenant resolution, permission evaluation, and ownership guards.

## Read first

- `docs/architecture/identity-and-access.md` is mandatory before edits here.
- Load/use WorkOS AuthKit guidance for SDK behavior; do not guess.
- Relevant ADRs: 0004 role/session decisions and 0008 akses deepening.

## Files and public seams

- `types.ts` owns closed `RoleSlug`, `IzinSlug`, `Membership`, and tenant
  resolution types.
- `server.ts` owns `requireAuth`, `getAuthenticatedUserId`, active tenant cookie,
  and low-level AuthKit session access.
- `membership.ts` owns WorkOS/dev membership providers and `safeRoleSlug`.
- `resolve-active-tenant.ts` validates active tenant selection.
- `akses-saya.ts` exposes `getAksesSaya()` and `requireAksesAktif(izin)`.
- `otorisasi.ts` owns `PERAN_KE_IZIN_DEFAULT`, `evaluasiAkses`, and predicates.
- `kepemilikan.ts` owns second-gate ownership checks.

## Usage rules

- Tenant-aware pages usually call `getAksesSaya()` and branch on denied/no-tenant
  states for UI.
- Server actions can use `requireAksesAktif("<fitur>:<aksi>")` for prologue
  authz, then still perform feature validation and DB mutation under `withTenant`.
- `getAuthenticatedUserId()` is only for session-only escape hatches such as
  sign-out/cookie operations; it is not tenant authorization.

## Model

- AuthKit session is sealed in httpOnly cookies via `withAuth()`.
- Memberships come from WorkOS organization memberships, filtered active.
- Unknown role slugs narrow to `guru` least privilege.
- `dev` membership is local-only behind `DEV_MEMBERSHIP_ALL`; never enable it in
  production.
- Active tenant cookie is revalidated each call. `orgId` from membership is the
  only tenant source.

## Authorization gates

- Gate 1: `akses.boleh(izin)` / `evaluasiAkses`. Deny rules win over explicit
  permissions and role defaults, even for admin/dev.
- Gate 2: ownership guards such as `assertPemilikBeban` and
  `assertPemilikRombongan`.
- Cross-tenant ownership lookup should look like not-found/deny, never leak.
- `peranAkses` DB snapshot is not authoritative for WorkOS membership state.

## Sync invariants

- Changing `RoleSlug` requires updating `KNOWN_ROLES`,
  `PERAN_KE_IZIN_DEFAULT`, tests, and ADR/docs when semantics change.
- Changing `IzinSlug` requires updating permission maps, route/action checks,
  tests, and visible copy.
- `membership.ts`, `server.ts`, and `kepemilikan.ts` ownership gates are
  covered; when changing RoleSlug/IzinSlug or adding a new ownership chain
  resolver, extend `membership.test.ts` / `kepemilikan.test.ts` rather than
  asserting behavior at the action layer only.
