# EduAdmin Pro Premium

Platform administrasi sekolah multi-tenant untuk Guru dan Satuan Pendidikan
di Indonesia. Antarmuka dalam **Bahasa Indonesia**, mobile-first.

Stack: Next.js 15.3 (App Router) · WorkOS AuthKit · Supabase (DB/RLS) ·
Drizzle · Tailwind v4 · shadcn/ui.

## Perintah

| Tugas | Perintah |
|---|---|
| Jalankan dev server | `npm run dev` |
| Build produksi | `npm run build` |
| Jalankan produksi | `npm run start` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Jalankan tes | `npm run test` (watch) · `npm run test:run` (sekali) |

Cek kesehatan aplikasi: `GET http://localhost:3000/health` → `{ "status": "ok" }`.

## Lingkungan

Salin `.env.example` ke `.env`. Sandbox WorkOS (`sk_test_*`) untuk
pengembangan. Lihat `docs/architecture/identity-and-access.md` sebelum
menyentuh auth/tenancy/role.

## Status

Tahap awal. Lihat `hyperplan/plan.md` untuk urutan build dan
`AGENTS.md` untuk konvensi agen.
