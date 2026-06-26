-- 0013_arsip.sql
-- Archive/Delete/Recovery layer (#19): controlled Arsip Data, Penghapusan Data,
-- Pemulihan Data, Retensi Data, and Riwayat Perubahan for MVP records.
--
-- DESIGN (hybrid):
--   * Tables that lack a status field (ptk, penilaian, beban_mengajar,
--     wali_kelas) get two new nullable columns: `arsip_pada` + `arsip_oleh`.
--     "Archive" = set both. "Delete" = archive only (NEVER hard-delete).
--     "Recover" = set both back to NULL. Active queries filter
--     `WHERE arsip_pada IS NULL`. All new columns are nullable (no NOT NULL) so
--     existing rows stay active (NULL = active) — no backfill needed.
--   * Tables that already have a status field (peserta_didik.aktif|pindah|lulus|
--     keluar, butir_soal.aktif|arsip) keep using their existing mechanism and
--     are NOT touched here.
--
-- AC#1 (archive not hard-delete): there is NO DROP/DELETE here. Archived rows
-- persist; only the arsip_pada timestamp marks them inactive.
-- AC#2 (recovery + accountability): arsip_oleh records the userId who archived;
-- recovery (set NULL) is itself audited via catat_audit (action layer).
-- AC#3 (retention rules): retensi_data stores a per-table retention period
--   (periode_bulan, default 84 = 7 years).
-- AC#4 (audit traces): catat_audit (existing) is the source of truth for
--   Riwayat Perubahan; no new audit table here.
-- AC#5 (tests): the action layer enforces a strict table whitelist — table
--   names are NEVER interpolated into SQL raw.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: retensi_data defaults to current_setting() and RLS
-- `WITH CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Add arsip_pada + arsip_oleh to the four target tables (nullable).
-- ---------------------------------------------------------------------------

-- ptk: archive support for personnel records.
alter table ptk add column if not exists arsip_pada timestamptz;
alter table ptk add column if not exists arsip_oleh text;

-- penilaian: archive support for individual assessments.
alter table penilaian add column if not exists arsip_pada timestamptz;
alter table penilaian add column if not exists arsip_oleh text;

-- beban_mengajar: archive support for teaching loads.
alter table beban_mengajar add column if not exists arsip_pada timestamptz;
alter table beban_mengajar add column if not exists arsip_oleh text;

-- wali_kelas: archive support for homeroom assignments.
alter table wali_kelas add column if not exists arsip_pada timestamptz;
alter table wali_kelas add column if not exists arsip_oleh text;

-- Document the domain meaning.
comment on column ptk.arsip_pada is
  'AC#1: timestamp when this row was archived (soft-delete). NULL = active. Archive NEVER hard-deletes — the row persists for recovery (AC#2).';
comment on column ptk.arsip_oleh is
  'AC#2: userId who archived this row. Accountability trail; cleared (set NULL) on recovery.';

comment on column penilaian.arsip_pada is
  'AC#1: timestamp when this assessment was archived (soft-delete). NULL = active.';
comment on column penilaian.arsip_oleh is
  'AC#2: userId who archived this assessment. Cleared on recovery.';

comment on column beban_mengajar.arsip_pada is
  'AC#1: timestamp when this teaching load was archived (soft-delete). NULL = active.';
comment on column beban_mengajar.arsip_oleh is
  'AC#2: userId who archived this teaching load. Cleared on recovery.';

comment on column wali_kelas.arsip_pada is
  'AC#1: timestamp when this homeroom assignment was archived (soft-delete). NULL = active.';
comment on column wali_kelas.arsip_oleh is
  'AC#2: userId who archived this homeroom assignment. Cleared on recovery.';

-- ---------------------------------------------------------------------------
-- 2. retensi_data — per-tenant per-table retention policy (AC#3).
--
-- periode_bulan defaults to 84 (7 years) to match typical Indonesian school
-- record retention. UNIQUE (tenant_id, tabel) — at most one policy per table.
-- ---------------------------------------------------------------------------

create table if not exists retensi_data (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default current_setting('app.tenant_id', true)
    references satuan_pendidikan(id) on delete cascade,
  tabel text not null,
  periode_bulan integer not null default 84 check (periode_bulan > 0),
  keterangan text,
  unique (tenant_id, tabel)
);

comment on table retensi_data is
  'AC#3: per-tenant per-table retention policy. periode_bulan default 84 (7 years). UNIQUE (tenant_id, tabel).';
comment on column retensi_data.periode_bulan is
  'Retention period in months. Default 84 (7 years). Positive integer.';
comment on column retensi_data.tabel is
  'Target table name. Validated against a strict whitelist in the action layer (never interpolated raw into SQL).';

-- Row-Level Security: tenant isolation on retensi_data.
alter table retensi_data enable row level security;
alter table retensi_data force  row level security;
create policy tenant_isolation_retensi_data on retensi_data
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
grant select, insert, update, delete on retensi_data to app_user;
