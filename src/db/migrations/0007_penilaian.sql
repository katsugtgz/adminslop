-- 0007_penilaian.sql
-- Grading data layer (#11, Wave 1 / T1): komponen_nilai -> penilaian -> nilai_peserta_didik.
--   * komponen_nilai      = grading component (UTS, UAS, Tugas Harian, ...) tied to a
--                           beban_mengajar; carries a positive `bobot` weight for Nilai
--                           Akhir derivation (AC#3 — visible & auditable).
--   * penilaian           = individual assessment within a component (e.g. "Tugas 1",
--                           "Ujian Tengah Semester"). Has a tanggal.
--   * nilai_peserta_didik = per-student score for a penilaian. `nilai` is 0..100 and
--                           NULLABLE (absent / ungraded students get NULL — AC: nullable
--                           score with CHECK 0<=nilai<=100).
--
-- The three tables form a parent->child->grandchild chain rooted at beban_mengajar
-- (and peserta_didik joins at the leaf). Every link is ON DELETE CASCADE so deleting
-- a beban_mengajar rips the whole grading subtree; deleting a peserta_didik removes
-- its scores across all penilaian. UNIQUE constraints are scoped per (tenant, parent,
-- name) so the same component/assessment name cannot collide within a teaching load.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

-- komponen_nilai: grading component (UTS/UAS/Tugas Harian) tied to a teaching load.
CREATE TABLE IF NOT EXISTS komponen_nilai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  beban_mengajar_id uuid NOT NULL REFERENCES beban_mengajar(id) ON DELETE CASCADE,
  nama text NOT NULL,
  bobot numeric NOT NULL CHECK (bobot > 0),
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, beban_mengajar_id, nama)
);

-- penilaian: individual assessment within a component (e.g. "Tugas 1").
CREATE TABLE IF NOT EXISTS penilaian (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  komponen_nilai_id uuid NOT NULL REFERENCES komponen_nilai(id) ON DELETE CASCADE,
  nama text NOT NULL,
  tanggal date NOT NULL,
  dibuat_oleh text,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, komponen_nilai_id, nama)
);

-- nilai_peserta_didik: per-student score for a penilaian. `nilai` nullable (absent).
CREATE TABLE IF NOT EXISTS nilai_peserta_didik (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  penilaian_id uuid NOT NULL REFERENCES penilaian(id) ON DELETE CASCADE,
  peserta_didik_id uuid NOT NULL REFERENCES peserta_didik(id) ON DELETE CASCADE,
  nilai numeric CHECK (nilai >= 0 AND nilai <= 100),
  catatan text,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, penilaian_id, peserta_didik_id)
);

-- Document the domain meaning of the auditable/nullable numeric columns.
COMMENT ON COLUMN komponen_nilai.bobot IS
  'Weight for Nilai Akhir derivation (AC#3). Positive number. Visible/auditable.';
COMMENT ON COLUMN nilai_peserta_didik.nilai IS
  'Score 0-100. Nullable (absent/ungraded students get NULL). CHECK 0<=nilai<=100.';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table komponen_nilai enable row level security;
alter table komponen_nilai force  row level security;
create policy tenant_isolation_komponen_nilai on komponen_nilai
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table penilaian enable row level security;
alter table penilaian force  row level security;
create policy tenant_isolation_penilaian on penilaian
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table nilai_peserta_didik enable row level security;
alter table nilai_peserta_didik force  row level security;
create policy tenant_isolation_nilai_peserta_didik on nilai_peserta_didik
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on komponen_nilai, penilaian, nilai_peserta_didik to app_user;
