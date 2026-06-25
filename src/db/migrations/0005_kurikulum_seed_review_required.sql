-- ============================================================
-- REVIEW-REQUIRED SEED DATA — DO NOT MERGE WITHOUT HUMAN REVIEW
-- ============================================================
-- This migration seeds Kurikulum reference data with PLACEHOLDER descriptions.
-- All descriptive text is '[REVIEW-REQUIRED: ...]' — it MUST be replaced with
-- verified content from the official source before this PR is merged.
-- Source: https://kurikulum.kemdikbud.go.id
-- status_persetujuan = 'memerlukan_tinjauan' until a human reviewer approves.
-- AC#3: NO AI-generated curriculum as canonical source.
-- AC#5: Seed fixture is REVIEW-REQUIRED until human approval.
-- ============================================================

-- Runs as the migrator superuser (DATABASE_MIGRATOR_URL). app_user has
-- SELECT only on these GLOBAL tables (ADR 0001) and cannot seed.
--
-- Idempotency:
--   * kurikulum has no UNIQUE(nama,versi) — use INSERT ... WHERE NOT EXISTS.
--   * mata_pelajaran / fase have UNIQUE(kode) — use ON CONFLICT (kode).
--   * capaian_pembelajaran / tujuan_pembelajaran / alur_tujuan_pembelajaran
--     have composite UNIQUE constraints — use ON CONFLICT on those.
-- FK targets are resolved by SELECT-subquery (ids are gen_random_uuid()).

-- 1. kurikulum (1 row) -------------------------------------------------------
INSERT INTO kurikulum (nama, versi, deskripsi, sumber, sumber_url, tanggal_ambil, status_persetujuan)
SELECT
  'Kurikulum Merdeka',
  '2022',
  '[REVIEW-REQUIRED: deskripsi Kurikulum Merdeka]',
  'Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi',
  'https://kurikulum.kemdikbud.go.id',
  current_date,
  'memerlukan_tinjauan'
WHERE NOT EXISTS (
  SELECT 1 FROM kurikulum
  WHERE nama = 'Kurikulum Merdeka' AND versi = '2022'
);

-- 2. mata_pelajaran (3 rows) -------------------------------------------------
INSERT INTO mata_pelajaran (kode, nama)
VALUES
  ('MTK', 'Matematika'),
  ('BIN', 'Bahasa Indonesia'),
  ('IPA', 'Ilmu Pengetahuan Alam')
ON CONFLICT (kode) DO NOTHING;

-- 3. fase (6 rows — Kurikulum Merdeka phases A-F) ---------------------------
INSERT INTO fase (kode, nama, rentang_kelas, jenjang)
VALUES
  ('A', 'Fase A', 'Kelas 1-2 SD', 'SD'),
  ('B', 'Fase B', 'Kelas 3-4 SD', 'SD'),
  ('C', 'Fase C', 'Kelas 5-6 SD', 'SD'),
  ('D', 'Fase D', 'Kelas 7-9 SMP', 'SMP'),
  ('E', 'Fase E', '[REVIEW-REQUIRED: rentang kelas Fase E]', 'SMA'),
  ('F', 'Fase F', 'Kelas 11-12 SMA', 'SMA')
ON CONFLICT (kode) DO NOTHING;

-- 4. capaian_pembelajaran (3 rows) ------------------------------------------
-- Composite UNIQUE (kurikulum_id, mata_pelajaran_id, fase_id, kode) →
-- ON CONFLICT on that tuple makes re-runs safe.
INSERT INTO capaian_pembelajaran (kurikulum_id, mata_pelajaran_id, fase_id, kode, elemen, deskripsi, sumber)
SELECT
  k.id, mp.id, f.id,
  'CP-MTK-A-1',
  '[REVIEW-REQUIRED: elemen CP Matematika Fase A]',
  '[REVIEW-REQUIRED: deskripsi CP Matematika Fase A]',
  'Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi'
FROM kurikulum k, mata_pelajaran mp, fase f
WHERE k.nama = 'Kurikulum Merdeka' AND mp.kode = 'MTK' AND f.kode = 'A'
ON CONFLICT (kurikulum_id, mata_pelajaran_id, fase_id, kode) DO NOTHING;

INSERT INTO capaian_pembelajaran (kurikulum_id, mata_pelajaran_id, fase_id, kode, elemen, deskripsi, sumber)
SELECT
  k.id, mp.id, f.id,
  'CP-BIN-A-1',
  '[REVIEW-REQUIRED: elemen CP Bahasa Indonesia Fase A]',
  '[REVIEW-REQUIRED: deskripsi CP Bahasa Indonesia Fase A]',
  'Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi'
FROM kurikulum k, mata_pelajaran mp, fase f
WHERE k.nama = 'Kurikulum Merdeka' AND mp.kode = 'BIN' AND f.kode = 'A'
ON CONFLICT (kurikulum_id, mata_pelajaran_id, fase_id, kode) DO NOTHING;

INSERT INTO capaian_pembelajaran (kurikulum_id, mata_pelajaran_id, fase_id, kode, elemen, deskripsi, sumber)
SELECT
  k.id, mp.id, f.id,
  'CP-MTK-B-1',
  '[REVIEW-REQUIRED: elemen CP Matematika Fase B]',
  '[REVIEW-REQUIRED: deskripsi CP Matematika Fase B]',
  'Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi'
FROM kurikulum k, mata_pelajaran mp, fase f
WHERE k.nama = 'Kurikulum Merdeka' AND mp.kode = 'MTK' AND f.kode = 'B'
ON CONFLICT (kurikulum_id, mata_pelajaran_id, fase_id, kode) DO NOTHING;

-- 5. tujuan_pembelajaran (2 rows — children of CP-MTK-A-1) ------------------
-- Composite UNIQUE (capaian_pembelajaran_id, urutan) → ON CONFLICT on it.
INSERT INTO tujuan_pembelajaran (capaian_pembelajaran_id, urutan, deskripsi, sumber)
SELECT
  cp.id, 1,
  '[REVIEW-REQUIRED: TP 1 untuk CP-MTK-A-1]',
  'Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi'
FROM capaian_pembelajaran cp
WHERE cp.kode = 'CP-MTK-A-1'
  AND EXISTS (SELECT 1 FROM kurikulum k WHERE k.id = cp.kurikulum_id AND k.nama = 'Kurikulum Merdeka')
ON CONFLICT (capaian_pembelajaran_id, urutan) DO NOTHING;

INSERT INTO tujuan_pembelajaran (capaian_pembelajaran_id, urutan, deskripsi, sumber)
SELECT
  cp.id, 2,
  '[REVIEW-REQUIRED: TP 2 untuk CP-MTK-A-1]',
  'Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi'
FROM capaian_pembelajaran cp
WHERE cp.kode = 'CP-MTK-A-1'
  AND EXISTS (SELECT 1 FROM kurikulum k WHERE k.id = cp.kurikulum_id AND k.nama = 'Kurikulum Merdeka')
ON CONFLICT (capaian_pembelajaran_id, urutan) DO NOTHING;

-- 6. alur_tujuan_pembelajaran (1 row — child of TP 1 of CP-MTK-A-1) ---------
-- Composite UNIQUE (tujuan_pembelajaran_id, urutan) → ON CONFLICT on it.
INSERT INTO alur_tujuan_pembelajaran (tujuan_pembelajaran_id, urutan, deskripsi, sumber)
SELECT
  tp.id, 1,
  '[REVIEW-REQUIRED: ATP 1 untuk TP 1 CP-MTK-A-1]',
  'Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi'
FROM tujuan_pembelajaran tp
JOIN capaian_pembelajaran cp ON cp.id = tp.capaian_pembelajaran_id
WHERE cp.kode = 'CP-MTK-A-1' AND tp.urutan = 1
  AND EXISTS (SELECT 1 FROM kurikulum k WHERE k.id = cp.kurikulum_id AND k.nama = 'Kurikulum Merdeka')
ON CONFLICT (tujuan_pembelajaran_id, urutan) DO NOTHING;
