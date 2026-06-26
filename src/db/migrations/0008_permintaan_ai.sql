-- 0008_permintaan_ai.sql
-- AI workflow data layer (#12, Wave 1 / T1): permintaan_ai -> draf_ai + kuota_ai.
--   * permintaan_ai = AI request lifecycle (state machine: dibuat->diproses->
--                     selesai|gagal|dibatalkan). Retry = new row with
--                     permintaan_terkait_id pointing at the prior attempt.
--   * draf_ai        = AI output for a permintaan (1:1) with a verification gate
--                     (status_verifikasi: menunggu->disetujui|ditolak). AI content
--                     is NOT final by default (AC#3) — must be disetujui before use.
--   * kuota_ai       = per-tenant per-period (tahun_ajaran + semester) budget.
--                     Creating a permintaan_ai increments terpakai; reject when
--                     terpakai >= batas (AC#5, enforced in the repo layer).
--
-- DOMAIN DISTINCTION (CONTEXT.md "Flagged ambiguities"): "Permintaan AI" is the
-- process request, "Draf AI" is the draft output that MUST be reviewed, and the
-- final Dokumen AI still requires Verifikasi Dokumen AI before use. Provenance
-- (AC#2) on draf_ai records model + prompt_hash + timestamp so AI output is
-- traceable, never anonymous.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

-- permintaan_ai: AI request lifecycle (state machine).
CREATE TABLE IF NOT EXISTS permintaan_ai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  jenis text NOT NULL CHECK (jenis IN ('deskripsi_cp','deskripsi_tp','deskripsi_atp','narasi_raport')),
  konteks jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'dibuat'
    CHECK (status IN ('dibuat','diproses','selesai','gagal','dibatalkan')),
  pesan_error text,
  permintaan_terkait_id uuid REFERENCES permintaan_ai(id) ON DELETE SET NULL,
  dibuat_oleh text NOT NULL,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  diproses_pada timestamptz,
  selesai_pada timestamptz
);

-- draf_ai: AI output for a permintaan (1:1) with verification gate.
CREATE TABLE IF NOT EXISTS draf_ai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  permintaan_ai_id uuid NOT NULL UNIQUE REFERENCES permintaan_ai(id) ON DELETE CASCADE,
  konten text NOT NULL,
  provenance text NOT NULL,
  status_verifikasi text NOT NULL DEFAULT 'menunggu'
    CHECK (status_verifikasi IN ('menunggu','disetujui','ditolak')),
  diverifikasi_oleh text,
  diverifikasi_pada timestamptz,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

-- kuota_ai: per-tenant per-period AI budget.
CREATE TABLE IF NOT EXISTS kuota_ai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  tahun_ajaran_id uuid NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  semester text NOT NULL CHECK (semester IN ('ganjil','genap')),
  terpakai integer NOT NULL DEFAULT 0,
  batas integer NOT NULL DEFAULT 100,
  UNIQUE (tenant_id, tahun_ajaran_id, semester)
);

-- Document the domain meaning of the state-machine + verification columns.
COMMENT ON TABLE permintaan_ai IS
  'Permintaan AI: permintaan proses bantuan AI (bukan dokumen final). State machine: dibuat->diproses->selesai|gagal|dibatalkan. Retry = baris baru dengan permintaan_terkait_id.';
COMMENT ON COLUMN permintaan_ai.status IS
  'State machine: dibuat->diproses->selesai|gagal|dibatalkan. Retry = new row with permintaan_terkait_id.';
COMMENT ON COLUMN permintaan_ai.jenis IS
  'AI request type: deskripsi_cp (Capaian Pembelajaran), deskripsi_tp (Tujuan Pembelajaran), deskripsi_atp (Alur Tujuan Pembelajaran), narasi_raport (E-Raport narrative).';
COMMENT ON COLUMN permintaan_ai.permintaan_terkait_id IS
  'Retry linkage: points at the prior permintaan_ai attempt this row retries. ON DELETE SET NULL so deleting the original does not erase the retry.';

COMMENT ON TABLE draf_ai IS
  'Draf AI: hasil awal AI untuk satu permintaan (1:1). Bukan dokumen final — butuh Verifikasi Dokumen AI.';
COMMENT ON COLUMN draf_ai.status_verifikasi IS
  'AC#3: AI content is NOT final by default. Must be disetujui before used as Dokumen AI. menunggu->disetujui|ditolak.';
COMMENT ON COLUMN draf_ai.provenance IS
  'AC#2: provenance = model + prompt_hash + timestamp. AI output is traceable, never anonymous.';

COMMENT ON TABLE kuota_ai IS
  'AC#5: Per-school budget per academic period. Creating a permintaan_ai increments terpakai. Reject when terpakai>=batas.';
COMMENT ON COLUMN kuota_ai.terpakai IS
  'Number of AI requests consumed in this period. Incremented when a permintaan_ai is created.';
COMMENT ON COLUMN kuota_ai.batas IS
  'Hard ceiling on AI requests for this period. Default 100. Reject new permintaan when terpakai>=batas.';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table permintaan_ai enable row level security;
alter table permintaan_ai force  row level security;
create policy tenant_isolation_permintaan_ai on permintaan_ai
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table draf_ai enable row level security;
alter table draf_ai force  row level security;
create policy tenant_isolation_draf_ai on draf_ai
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table kuota_ai enable row level security;
alter table kuota_ai force  row level security;
create policy tenant_isolation_kuota_ai on kuota_ai
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on permintaan_ai, draf_ai, kuota_ai to app_user;
