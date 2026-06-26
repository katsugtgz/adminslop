-- 0006_beban_mengajar.sql
-- Teacher-context data layer (#10, Wave 1 / T1).
--   * beban_mengajar = teaching load (connects PTK + Mata Pelajaran + Rombongan
--                      Belajar XOR Tingkat + Tahun Ajaran + semester)
--   * wali_kelas     = class guardian assignment (one wali per rombel per
--                      period: Tahun Ajaran + semester)
--
-- AC#2 (beban_mengajar): a teaching load targets exactly ONE of Rombongan
-- Belajar (a specific class) or Tingkat (all classes in a grade level) —
-- enforced by an XOR CHECK constraint. Neither or both is rejected.
--
-- AC#3 (wali_kelas): one wali per rombel per period. UNIQUE per (tenant,
-- rombongan_belajar, tahun_ajaran, semester). Historical across periods (past
-- period rows persist); changing the wali for the CURRENT period is an UPDATE,
-- not a new insert.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.
--
-- mata_pelajaran is a GLOBAL reference table (ADR 0001): no tenant_id, no RLS.
-- The FK from beban_mengajar is cross-schema and ON DELETE RESTRICT — a subject
-- referenced by any teaching load cannot be dropped.

create extension if not exists pgcrypto;

CREATE TABLE IF NOT EXISTS beban_mengajar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  ptk_id uuid NOT NULL REFERENCES ptk(id) ON DELETE CASCADE,
  mata_pelajaran_id uuid NOT NULL REFERENCES mata_pelajaran(id) ON DELETE RESTRICT,  -- GLOBAL ref
  rombongan_belajar_id uuid REFERENCES rombongan_belajar(id) ON DELETE CASCADE,      -- nullable
  tingkat_id uuid REFERENCES tingkat(id) ON DELETE CASCADE,                          -- nullable
  tahun_ajaran_id uuid NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  semester text NOT NULL CHECK (semester IN ('ganjil','genap')),
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  -- AC#2: exactly ONE of rombongan_belajar_id/tingkat_id must be set (XOR)
  CONSTRAINT beban_mengajar_target_check CHECK (
    (rombongan_belajar_id IS NOT NULL) <> (tingkat_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS wali_kelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  ptk_id uuid NOT NULL REFERENCES ptk(id) ON DELETE CASCADE,
  rombongan_belajar_id uuid NOT NULL REFERENCES rombongan_belajar(id) ON DELETE CASCADE,
  tahun_ajaran_id uuid NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  semester text NOT NULL CHECK (semester IN ('ganjil','genap')),
  dibuat_oleh text,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  -- AC#3: one wali per rombel per period (historical across periods, unique within period)
  UNIQUE (tenant_id, rombongan_belajar_id, tahun_ajaran_id, semester)
);

COMMENT ON CONSTRAINT beban_mengajar_target_check ON beban_mengajar IS
  'AC#2: Beban Mengajar targets exactly ONE of Rombongan Belajar or Tingkat (XOR). Subject to a specific class OR all classes in a grade level.';
COMMENT ON TABLE wali_kelas IS
  'Current-state wali kelas assignment. UNIQUE per rombel+TA+semester. Historical across periods (past period rows persist). Changing wali for current period = UPDATE.';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table beban_mengajar enable row level security;
alter table beban_mengajar force  row level security;
create policy tenant_isolation_beban_mengajar on beban_mengajar
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table wali_kelas enable row level security;
alter table wali_kelas force  row level security;
create policy tenant_isolation_wali_kelas on wali_kelas
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on beban_mengajar, wali_kelas to app_user;
