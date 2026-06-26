-- 0010_bank_soal.sql
-- Bank Soal data layer (#16, Wave 1 / T1): butir_soal -> paket_soal ->
-- paket_soal_butir (assembly junction). Question items with AI-assisted drafts
-- + assembled packages for assessments.
--   * butir_soal        = individual question item (Pilihan Ganda / Essay /
--                         Isian / Jodohkan / Benar-Salah). May cite a verified
--                         Draf AI (AC#2 — unverified AI cannot be canonical).
--   * paket_soal        = assembled package of items for an assessment period.
--   * paket_soal_butir  = ordered junction linking items into packages with a
--                         per-item bobot (weight).
--
-- DOMAIN DISTINCTION (CONTEXT.md): a Butir Soal is a reusable, searchable
-- question; a Paket Soal is the assembled bundle used by an assessment. The
-- junction preserves ordering + weight so the same item can be reused across
-- packages with different weights.
--
-- AC#2 (provenance + verification gate): butir_soal.draf_ai_id links to a
-- draf_ai that MUST be 'disetujui' before it can back a canonical butir (the
-- repo layer enforces this — unverified AI content cannot become canonical).
-- FK is ON DELETE SET NULL: deleting the draft detaches but does not destroy
-- the butir.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.
--
-- mata_pelajaran is a GLOBAL reference table (ADR 0001): no tenant_id, no RLS.
-- The FKs from butir_soal + paket_soal are cross-schema and ON DELETE RESTRICT
-- — a subject referenced by any butir/paket cannot be dropped.

create extension if not exists pgcrypto;

-- butir_soal: individual question item.
CREATE TABLE IF NOT EXISTS butir_soal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  mata_pelajaran_id uuid NOT NULL REFERENCES mata_pelajaran(id) ON DELETE RESTRICT,  -- GLOBAL ref
  tingkat_id uuid REFERENCES tingkat(id) ON DELETE CASCADE,                          -- nullable
  jenis text NOT NULL CHECK (jenis IN ('pg','essay','isian','jodohkan','benar_salah')),
  pertanyaan text NOT NULL,
  pilihan jsonb,
  kunci_jawaban text NOT NULL,
  pembahasan text,
  draf_ai_id uuid REFERENCES draf_ai(id) ON DELETE SET NULL,                         -- nullable; AC#2
  status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','arsip')),
  dibuat_oleh text,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

-- paket_soal: assembled package of items.
CREATE TABLE IF NOT EXISTS paket_soal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  nama text NOT NULL,
  mata_pelajaran_id uuid NOT NULL REFERENCES mata_pelajaran(id) ON DELETE RESTRICT,  -- GLOBAL ref
  tingkat_id uuid REFERENCES tingkat(id) ON DELETE CASCADE,                          -- nullable
  tahun_ajaran_id uuid NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  semester text CHECK (semester IN ('ganjil','genap')),                              -- nullable
  dibuat_oleh text,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

-- paket_soal_butir: ordered junction linking items into packages.
CREATE TABLE IF NOT EXISTS paket_soal_butir (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  paket_soal_id uuid NOT NULL REFERENCES paket_soal(id) ON DELETE CASCADE,
  butir_soal_id uuid NOT NULL REFERENCES butir_soal(id) ON DELETE CASCADE,
  urutan integer NOT NULL,
  bobot numeric NOT NULL DEFAULT 1,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, paket_soal_id, butir_soal_id)
);

COMMENT ON TABLE butir_soal IS
  'Butir Soal: item pertanyaan reusable (Pilihan Ganda / Essay / Isian / Jodohkan / Benar-Salah). Dapat dikut dari Draf AI tervalidasi (AC#2 — draf_ai_id wajib disetujui).';
COMMENT ON COLUMN butir_soal.draf_ai_id IS
  'AC#2: link opsional ke Draf AI. Hanya draf dengan status_verifikasi=''disetujui'' yang boleh mendukung butir kanonik (enforced di repo). ON DELETE SET NULL.';
COMMENT ON COLUMN butir_soal.status IS
  'aktif (default) atau arsip. Arsip = soft-delete — butir tidak hilang, hanya disembunyikan dari daftar aktif.';

COMMENT ON TABLE paket_soal IS
  'Paket Soal: kumpulan butir yang dirakit untuk satu periode penilaian (tahun_ajaran + semester).';

COMMENT ON TABLE paket_soal_butir IS
  'Junction: butir dalam paket dengan urutan + bobot per-butir. UNIQUE per (tenant, paket, butir) — satu butir sekali per paket, tetapi dapat digunakan ulang lintas paket.';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table butir_soal enable row level security;
alter table butir_soal force  row level security;
create policy tenant_isolation_butir_soal on butir_soal
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table paket_soal enable row level security;
alter table paket_soal force  row level security;
create policy tenant_isolation_paket_soal on paket_soal
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table paket_soal_butir enable row level security;
alter table paket_soal_butir force  row level security;
create policy tenant_isolation_paket_soal_butir on paket_soal_butir
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on butir_soal, paket_soal, paket_soal_butir to app_user;
