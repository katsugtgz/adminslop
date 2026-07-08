# EduAdmin Pro Premium

Platform administrasi sekolah multi-tenant untuk Guru dan Satuan Pendidikan
di Indonesia. Antarmuka dalam **Bahasa Indonesia**, mobile-first.

Stack: Next.js 15 (App Router) · React 19 · WorkOS AuthKit · PostgreSQL/RLS
via `pg` + Drizzle · Tailwind v4 · shadcn-style UI · Vitest · Playwright.

## Status

Bukan scaffold awal. Modul dashboard, skema DB/migrasi/queries, seed data,
tes, Docker Postgres, dan CI sudah ada. Lihat `AGENTS.md` untuk konvensi
agen dan `docs/architecture/identity-and-access.md` sebelum menyentuh
auth, tenancy, role, atau permission.

## Perintah

| Tugas | Perintah |
|---|---|
| Jalankan dev server | `npm run dev` |
| Build produksi | `npm run build` |
| Jalankan produksi | `npm run start` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Tes (watch) | `npm run test` |
| Tes (sekali) | `npm run test:run` |
| Verifikasi penuh | `npm run verify` |
| E2E | `npm run e2e` |
| E2E tracer | `npm run e2e:tracer` |
| Docker Postgres naik | `npm run db:up` |
| Docker Postgres turun | `npm run db:down` |
| Reset DB (volume) | `npm run db:reset` |
| Jalankan migrasi | `npm run db:migrate` |
| Seed DB | `npm run db:seed` |
| Seed soal (scrape) | `npm run db:seed:scrape` |
| Diagnosis React | `npm run doctor` |

Cek kesehatan aplikasi: `GET http://localhost:3000/health` → `{ "status": "ok" }`.

## Lingkungan

Salin `.env.example` ke `.env`. Pengembangan memakai sandbox WorkOS
(`sk_test_*`). Variabel yang dibutuhkan: `WORKOS_API_KEY`,
`WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`. Tes DB butuh Postgres hidup
plus `DATABASE_URL` (app role) dan `DATABASE_MIGRATOR_URL` (owner role);
jika absen, tes DB skip dengan rapi.

CI ada di `.github/workflows/ci.yml` (Postgres 17 service, Node 20). Postgres
dijalankan lewat Docker Compose (lihat `db:up`).
