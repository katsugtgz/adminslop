-- Kurikulum Merdeka national curriculum reference data.
-- GLOBAL tables: NO tenant_id, NO RLS. See ADR 0001 (Global Reference Tables Exemption).
-- app_user can SELECT only (read-only reference data).

-- 1. kurikulum (curriculum version/metadata)
CREATE TABLE IF NOT EXISTS kurikulum (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  versi text NOT NULL,
  deskripsi text,
  sumber text NOT NULL,                     -- citation (e.g. "Kemdikbud")
  sumber_url text,                          -- source URL
  tanggal_ambil date NOT NULL DEFAULT current_date,
  disetujui_oleh text,                      -- NULL until AC#5 human approval
  status_persetujuan text NOT NULL DEFAULT 'memerlukan_tinjauan'
    CHECK (status_persetujuan IN ('memerlukan_tinjauan','disetujui','ditolak')),
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON kurikulum TO app_user;

-- 2. mata_pelajaran (subjects — universal across all schools)
CREATE TABLE IF NOT EXISTS mata_pelajaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode text UNIQUE,
  nama text NOT NULL UNIQUE
);
GRANT SELECT ON mata_pelajaran TO app_user;

-- 3. fase (Kurikulum Merdeka phases A-F)
CREATE TABLE IF NOT EXISTS fase (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode text NOT NULL UNIQUE,                -- 'A','B','C','D','E','F'
  nama text NOT NULL,
  rentang_kelas text,                       -- e.g. 'Kelas 1-2 SD'
  jenjang text                              -- 'SD'/'SMP'/'SMA' nullable (some phases span)
);
GRANT SELECT ON fase TO app_user;

-- 4. capaian_pembelajaran (CP — learning outcomes)
CREATE TABLE IF NOT EXISTS capaian_pembelajaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kurikulum_id uuid NOT NULL REFERENCES kurikulum(id) ON DELETE CASCADE,
  mata_pelajaran_id uuid NOT NULL REFERENCES mata_pelajaran(id) ON DELETE RESTRICT,
  fase_id uuid NOT NULL REFERENCES fase(id) ON DELETE RESTRICT,
  kode text,
  elemen text,
  deskripsi text NOT NULL,
  sumber text,
  catatan text,
  UNIQUE (kurikulum_id, mata_pelajaran_id, fase_id, kode)
);
GRANT SELECT ON capaian_pembelajaran TO app_user;

-- 5. tujuan_pembelajaran (TP — learning objectives, children of CP)
CREATE TABLE IF NOT EXISTS tujuan_pembelajaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capaian_pembelajaran_id uuid NOT NULL REFERENCES capaian_pembelajaran(id) ON DELETE CASCADE,
  urutan integer NOT NULL,
  deskripsi text NOT NULL,
  sumber text,
  catatan text,
  UNIQUE (capaian_pembelajaran_id, urutan)
);
GRANT SELECT ON tujuan_pembelajaran TO app_user;

-- 6. alur_tujuan_pembelajaran (ATP — learning objective flow, children of TP)
CREATE TABLE IF NOT EXISTS alur_tujuan_pembelajaran (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tujuan_pembelajaran_id uuid NOT NULL REFERENCES tujuan_pembelajaran(id) ON DELETE CASCADE,
  urutan integer NOT NULL,
  deskripsi text NOT NULL,
  sumber text,
  catatan text,
  UNIQUE (tujuan_pembelajaran_id, urutan)
);
GRANT SELECT ON alur_tujuan_pembelajaran TO app_user;

-- CRITICAL: NO RLS on any of these tables. See ADR 0001.
-- app_user has SELECT only — cannot INSERT/UPDATE/DELETE (migrator superuser only).
