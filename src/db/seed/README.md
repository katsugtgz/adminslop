# Seed Data (dev / e2e)

Seed data dummy lengkap untuk mengisi semua form, nilai, bank soal, dll — siap
dipakai untuk testing manual, e2e, dan visual QA.

## Pakai

```bash
# 1. DB hidup + migrasi terapan
npm run db:up          # docker compose (postgres 17)
npm run db:migrate     # migrator superuser

# 2. Isi seed (idempotent — aman re-run)
npm run db:seed
```

## Yang terisi

**GLOBAL referensi kurikulum** (ADR 0001 — no tenant_id, no RLS, migrator-only):
- 20 mata pelajaran (MTK/BIN/IPAS/FIS/KIM/BIO/.../PJOK/MULOK)
- 6 fase Kurikulum Merdeka (A–F)
- kurikulum "Kurikulum Merdeka" + capaian_pembelajaran + tujuan_pembelajaran
  (`status_persetujuan = 'memerlukan_tinjauan'` — review-required per
  CONTEXT.md; AI tidak jadi sumber kanonik)

**2 Satuan Pendidikan demo** (tenant-scoped, RLS WITH CHECK tervalidasi):
- `org_smp_harapan` — SMP Harapan Bangsa (jenjang SMP, kelas 7–9)
- `org_sma_negeri1` — SMA Negeri 1 Nusantara (jenjang SMA, kelas 10–12)

Per tenant terisi (deterministik — re-run = dataset identik):
- profil + pengaturan satuan pendidikan (npsn, alamat, kepala, TA aktif)
- 3 tingkat × 2 rombongan belajar (6 rombel)
- 24 peserta didik (4/rombel) + wali + kontak darurat + 1 mutasi pindah
- 10 PTK (kepala + 7 guru mapel + 2 tenaga kependidikan)
- 3 pengguna (admin / guru / kepala_sekolah) + izin_akses dari
  `PERAN_KE_IZIN_DEFAULT`
- beban mengajar + wali kelas (ganjil)
- komponen nilai + penilaian + nilai peserta didik (formulatif/sumatif,
  sebagian NULL untuk demo "belum dinilai")
- absensi harian 5 hari (campuran hadir/izin/sakit/alpa; 1 sesi QR)
- **bank soal**: butir 5 jenis (pg/essay/isian/jodohkan/benar_salah) lintas
  mapel, sebagian link Draf AI tervalidasi; 3 paket soal berangkai
- 5 perangkat ajar (modul_ajar/rpp/silabus/prota/promes)
- permintaan AI + draf AI (`status_verifikasi='disetujui'`) + kuota AI
- 3 draf e-raport (1 terbit + dokumen cetak A4 + revisi)
- template cetak default (eraport)
- notifikasi (per pengguna) + retensi data + catatan audit

Aktor penanda semua row seed: `dibuat_oleh = "seed-dev"`.

**ID deterministik** — semua entitas URL-facing (tingkat, rombel, peserta_didik,
butir_soal, paket_soal, draf_eraport, ptk, pengguna, template_cetak, draf_ai)
pakai UUID stabil dari hash `(tenant:key)` → URL deep-link e2e reproducible
lintas re-run (mis. `/dashboard/peserta-didik/<id>` tak berubah).

## Login dev

```bash
# .env sudah:
DEV_MEMBERSHIP_ALL=true
```

User yang login via WorkOS dev otomatis jadi anggota SEMUA satuan_pendidikan
termasuk 2 demo, dengan role `dev` (akses penuh via `PERAN_KE_IZIN_DEFAULT`).
Pilih satuan di UI → semua data demo tampil.

(opsional) `DEV_SEED_USER_ID=<userId WorkOS Anda>` biar row `pengguna` seed
terlink ke userId login Anda — berguna bila ingin menguji izin spesifik per
pengguna, bukan role `dev`.

## RLS tetap ditegakkan

- Seed GLOBAL = migrator superuser.
- Seed tenant = `app_user` via `withTenant` (GUC `app.tenant_id`) → RLS WITH
  CHECK memvalidasi setiap insert. Cross-tenant id = deny, bukan leak.
- Tanpa GUC → 0 baris tenant-scoped terbaca (dibuktikan di `.scratch/verify.mjs`).

## Scrape bank soal publik (opsional)

```bash
export FIRECRAWL_API_KEY=fc-...        # dari firecrawl.dev
npm run db:seed:scrape                 # scrape DEFAULT_URLS di scrape-soal.mjs
# atau URL sendiri:
node src/db/seed/scrape-soal.mjs https://situs-soal-publik.example/latihan
npm run db:seed                         # ingest hasil scrape
```

`scrape-soal.mjs` scrape markdown via firecrawl CLI → parse heuristik (soal
bernomor + opsi A/B/C/D + baris "Jawaban: X") → tulis
`fixtures/soal-firecrawl.json` → `muatSemuaButir()` merge saat seed.

**Fixture bawaan** (`fixtures/soal-firecrawl.json`) sudah berisi contoh hasil
scrape → e2e tetap jalan **tanpa API key firecrawl**.

Parser bersifat contoh reproduksibel, bukan universal — sesuaikan regex
per-situs. Hanya scrape sumber yang Anda miliki izin.

## File

```
src/db/seed/
├── cli.ts                    # orchestrator (npm run db:seed)
├── referensi.ts              # GLOBAL kurikulum (mapel/fase/CP/TP)
├── tenant.ts                 # data tenant-scoped lengkap
├── bank-soal-data.ts         # bank soal (5 jenis) + loader fixture
├── names.ts                  # pool nama + RNG deterministik + uuidDeterministik
├── seed.test.ts              # integration smoke test (TDD guard)
├── scrape-soal.mjs           # firecrawl scraper → fixture (npm run db:seed:scrape)
└── fixtures/
    └── soal-firecrawl.json   # contoh hasil scrape (bundled)
```

## Idempotency

Re-run aman + deterministik:
- GLOBAL: `ON CONFLICT DO NOTHING`.
- Tenant: `cleanupTenant` hapus SEMUA baris tenant (migrator) lalu re-insert
  via app_user. ID URL-facing stabil (UUID dari hash) → dataset bit-identical
  lintas run; RNG seeded → nilai/nama identik.

## Test (TDD guard)

`src/db/seed/seed.test.ts` — integration smoke test (project `db`):
- counts per tenant > 0 (semua form terisi)
- 5 jenis butir soal hadir
- RLS: no-GUC = 0 baris; cross-tenant read = 0
- eraport invariant (revisi row ⟺ status='revisi'); dokumen_cetak only terbit
- id deterministik (re-seed = id sama)
- aktor penanda `seed-dev`

```bash
npx vitest run --project db src/db/seed/seed.test.ts
```

## Reset total

```bash
npm run db:reset   # docker volume bersih + db:up
npm run db:migrate
npm run db:seed
```
