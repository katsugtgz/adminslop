# src/components/AGENTS.md

React component library for dashboard UI. Bahasa-first, mostly server components,
with client components only where interaction/state/motion requires it.

## Naming taxonomy

- Files are kebab-case; exports are PascalCase.
- Use existing Bahasa prefixes:
  - `daftar-*` list/table
  - `form-*`, `form-*-baru` forms/create forms
  - `kontrol-*` toolbars/filters
  - `kartu-*` cards
  - `tombol-*` buttons/actions
  - `kepala-*` headers
  - `ringkasan-*` summaries
- Props and visible copy use canonical domain terms from `CONTEXT.md`.

## Component boundaries

- Components do not define `"use server"`. Server actions are injected as props
  from `src/app/**/actions.ts`.
- Default to server components. Add `"use client"` only for hooks, local state,
  browser APIs, motion, offline behavior, or interactive controls.
- Do not import action/type aliases across unrelated feature folders. Shared
  component types belong in a shared file, not another feature's form.

## Styling

- Use Tailwind v4 semantic tokens from `globals.css`: `bg-card`,
  `text-card-foreground`, `text-muted-foreground`, `text-primary`,
  `border-border`, `bg-background`, `ring-ring`, `font-display`, `shadow-warm`,
  warning/accent tokens.
- Keep the warm editorial design system; avoid blue/purple SaaS defaults.
- `src/components/ui/button.tsx` is the only shadcn primitive currently used
  widely. Before adding more primitives, either follow shadcn conventions fully
  or keep native/Tailwind controls consistent.
- Motion wrappers live in `src/components/motion`; honor reduced motion and use
  transitions-dev classes/tokens rather than ad-hoc durations.

## Shared components

- Top-level shared files include `app-shell.tsx`, `main-nav.tsx`,
  `main-nav-items.ts`, `nav-auth.tsx`, `dashboard-aktif.tsx`,
  `kosong-dengan-tautan.tsx`, `pilih-satuan-pendidikan.tsx`,
  `pembatasan-akses.tsx`, `pusat-bantuan.tsx`, `bantuan-kontekstual.tsx`,
  and `tur-awal.tsx`.
- Feature folders should stay feature-scoped unless a pattern is repeated in at
  least two modules and has stable naming.

## Debt to avoid amplifying

- Repeated `ServerAksi = (formData: FormData) => Promise<void> | void` aliases.
- Cross-feature import like `notifikasi` importing from `akses/form-ptk-baru`.
- Duplicated `INPUT_CLASS` and local label/badge/date helpers. Extract only when
  the shared abstraction is obvious and Bahasa-safe.
