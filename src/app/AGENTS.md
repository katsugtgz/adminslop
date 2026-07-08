# src/app/AGENTS.md

Next.js App Router routes, pages, route handlers, and server actions.

## Layout and route shape

- Root layout is the only layout: `layout.tsx` sets `lang="id"`, fonts,
  `AuthKitProvider`, and `AppShell`. Do not add dashboard layouts casually.
- Dynamic pages/routes that depend on auth, cookies, DB, or tenant state use
  `export const dynamic = "force-dynamic"`.
- Dashboard modules usually contain `page.tsx`, `actions.ts`, `page.test.tsx`,
  `actions.test.ts`. Keep UI components in `src/components`, not co-located.
- `api/auth/*` is AuthKit-owned. Do not replace `handleAuth()` behavior without
  reading identity docs and loading WorkOS guidance.

## Canonical dashboard page flow

Use this order for tenant-aware pages:

1. `const akses = await getAksesSaya()`.
2. If not allowed/authenticated: render `<PembatasanAkses authenticated={...} />`.
3. If no active tenant: render `<PilihSatuanPendidikan memberships={...} />`.
4. Check `akses.boleh("<fitur>:baca")` before loading feature data.
5. Load tenant-scoped data inside `withTenant(db, akses.membership.orgId, ...)`.

## Canonical server action flow

In `"use server"` files:

1. `await requireAuth()`.
2. Resolve `getAksesSaya()` or `requireAksesAktif("<fitur>:<aksi>")`.
3. Reject inactive/no-tenant/permission-denied states server-side.
4. Validate `FormData` manually with trimmed strings and closed-vocabulary type
   guards; `pengaturan` is the current zod exception.
5. Mutate via `withTenant(db, akses.membership.orgId, async (tx) => ...)`.
6. Call `catatAudit(tx, ...)` in the same transaction.
7. `revalidatePath(...)` for affected dashboard routes.

## Known exceptions

- `dashboard/sinkronisasi/page.tsx` is client-only and writes through
  `src/app/api/sinkronisasi/route.ts`; page and route cannot share one segment.
- `dashboard/kurikulum` is global/reference read-only; no tenant mutation path.
- `dashboard/pengaturan/schemas.ts` owns the current zod schemas.
- `dashboard/cetak/pratinjau/[drafEraportId]/pdf/route.ts` keeps helper exports
  in sibling `helpers.ts`; route files cannot export arbitrary helpers.
- `dashboard/peserta-didik/[id]` is the only current dynamic detail route.

## Tests

- Page tests assert access states: denied, choose tenant, permission denied,
  and happy path.
- Action tests assert auth, permission, validation, transaction/audit, and
  revalidation behavior.
- Preserve existing `react-doctor-disable-next-line` comments around intentional
  server-action sequences.
