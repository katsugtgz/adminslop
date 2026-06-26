-- 0009_eraport.sql
-- E-Raport document lifecycle (#13): draf_eraport -> terbit -> revisi.
--   * draf_eraport  = the report document per (peserta_didik, tahun_ajaran,
--                     semester). status flows draf -> terbit -> revisi. konten
--                     is a jsonb snapshot of the Nilai Akhir (#11) derivation
--                     plus report data at creation time. draf_ai_id optionally
--                     links a verified (disetujui) Draf AI (#12) used as
--                     AI-assisted narrative content (AC#4 — enforced in the
--                     repo layer: menunggu/ditolak drafts are rejected).
--   * revisi_eraport = append-only revision history (AC#3 accountability). A
--                      revision NEVER rewrites prior rows; it appends a new row
--                      carrying alasan + konten_perubahan and flips the parent
--                      draf_eraport.status to 'revisi'.
--
-- DOMAIN DISTINCTION (CONTEXT.md): "E-Raport" is the final report document per
-- student per period. "Draf E-Raport" is the in-progress draft; "Terbit" is the
-- published (locked) state; "Revisi" records a requested change with a reason.
-- A revisi does NOT silently mutate the published content — it appends an
-- auditable change record and re-opens the draft.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

-- draf_eraport: the report document with a lifecycle state machine.
CREATE TABLE IF NOT EXISTS draf_eraport (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  peserta_didik_id uuid NOT NULL REFERENCES peserta_didik(id) ON DELETE CASCADE,
  tahun_ajaran_id uuid NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  semester text NOT NULL CHECK (semester IN ('ganjil','genap')),
  status text NOT NULL DEFAULT 'draf'
    CHECK (status IN ('draf','terbit','revisi')),
  konten jsonb NOT NULL DEFAULT '{}',
  draf_ai_id uuid REFERENCES draf_ai(id) ON DELETE SET NULL,
  catatan text,
  dibuat_oleh text,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  diterbitkan_pada timestamptz,
  UNIQUE (tenant_id, peserta_didik_id, tahun_ajaran_id, semester)
);

-- revisi_eraport: append-only revision history (AC#3 accountability).
CREATE TABLE IF NOT EXISTS revisi_eraport (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  eraport_id uuid NOT NULL REFERENCES draf_eraport(id) ON DELETE CASCADE,
  alasan text NOT NULL,
  konten_perubahan jsonb,
  dibuat_oleh text,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

-- Document the domain meaning of the lifecycle + linkage columns.
COMMENT ON TABLE draf_eraport IS
  'Draf E-Raport: dokumen rapor per peserta_didik per (tahun_ajaran, semester). Lifecycle: draf -> terbit -> revisi. konten = snapshot Nilai Akhir + data rapor.';
COMMENT ON COLUMN draf_eraport.status IS
  'Lifecycle: draf (in-progress) -> terbit (published, locked) -> revisi (re-opened with a change record).';
COMMENT ON COLUMN draf_eraport.konten IS
  'jsonb snapshot of the Nilai Akhir (#11) derivation + report data at creation. Immutable once terbit.';
COMMENT ON COLUMN draf_eraport.draf_ai_id IS
  'AC#4: optional link to a Draf AI (#12) used as AI-assisted narrative. Must reference a disetujui draft — menunggu/ditolak are rejected in the repo layer. ON DELETE SET NULL keeps the report if the AI draft is removed.';
COMMENT ON COLUMN draf_eraport.diterbitkan_pada IS
  'Set when status transitions to terbit. NULL while draf/revisi.';

COMMENT ON TABLE revisi_eraport IS
  'AC#3: append-only revision history. A revisi appends a new row (alasan + konten_perubahan) and flips the parent draf_eraport.status to revisi. NEVER rewrite or delete prior rows.';
COMMENT ON COLUMN revisi_eraport.alasan IS
  'AC#3 accountability: the human-readable reason for the revision. Required.';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table draf_eraport enable row level security;
alter table draf_eraport force  row level security;
create policy tenant_isolation_draf_eraport on draf_eraport
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table revisi_eraport enable row level security;
alter table revisi_eraport force  row level security;
create policy tenant_isolation_revisi_eraport on revisi_eraport
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on draf_eraport, revisi_eraport to app_user;
