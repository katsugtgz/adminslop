-- 0003_rombongan_belajar.sql
-- Academic-context data layer (#8, Wave 1 / T1).
--   * tahun_ajaran                  = academic year (Tahun Ajaran)
--   * tingkat                       = grade level (Tingkat) with `urutan` order
--   * rombongan_belajar             = class / homeroom (Rombongan Belajar)
--   * penempatan_rombongan_belajar  = append-only student placement record (Penempatan)
--
-- Also ALTERs satuan_pendidikan with `semester_aktif` (the active semester on
-- the tenant boundary itself). satuan_pendidikan is NOT RLS'd — it IS the tenant
-- boundary (mirrors 0000_tenant_spine.sql).
--
-- DOMAIN DISTINCTION (acceptance criterion #4): penempatan_rombongan_belajar is
-- APPEND-ONLY placement history — an audit trail, like riwayat_status_peserta_didik.
-- NEVER UPDATE or DELETE rows. The current class context of a student is DERIVED
-- (via getPenempatanByKonteks in the repo layer, later wave), NOT cached on
-- peserta_didik. This is the critical design constraint: the "current class" is
-- a query, not a stored column.
--
-- ROMBEL IDENTITY SPANS BOTH SEMESTERS: rombongan_belajar has NO semester column
-- — a rombel identity persists across both semesters (ganjil + genap) of a
-- Tahun Ajaran. Semester context lives in penempatan, not on the rombel.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

-- Active semester on the tenant boundary. Nullable (unset until chosen).
-- NOTE: spelling is 'ganjil' (odd) / 'genap' (even) — 'genap' has ONE 'p'.
-- This migration owns the constraint authoritatively: a prior (since-removed)
-- migration created the column with capital 'Ganjil'/'Genap'; drop any such
-- constraint, normalize legacy values to lowercase, then (re)create the
-- authoritative lowercase CHECK. Order matters — the UPDATE must run with the
-- old constraint dropped (it rejected lowercase). Idempotent.
alter table satuan_pendidikan add column if not exists semester_aktif text;
alter table satuan_pendidikan
  drop constraint if exists satuan_pendidikan_semester_aktif_check;
update satuan_pendidikan
  set semester_aktif = lower(semester_aktif)
  where semester_aktif is not null;
alter table satuan_pendidikan
  add constraint satuan_pendidikan_semester_aktif_check
    check (semester_aktif in ('ganjil', 'genap'));

create table if not exists tahun_ajaran (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default current_setting('app.tenant_id', true)
              references satuan_pendidikan(id) on delete cascade,
  nama        text not null,
  aktif       boolean not null default false,
  dibuat_pada timestamptz not null default now(),
  unique (tenant_id, nama)
);

-- Partial unique index: at most one ACTIVE Tahun Ajaran per tenant. Inactive
-- rows (aktif = false) are unconstrained, so historical years coexist.
create unique index if not exists tahun_ajaran_tenant_aktif_idx
  on tahun_ajaran (tenant_id) where aktif = true;

create table if not exists tingkat (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default current_setting('app.tenant_id', true)
              references satuan_pendidikan(id) on delete cascade,
  nama        text not null,
  urutan      integer not null,
  dibuat_pada timestamptz not null default now(),
  unique (tenant_id, nama),
  unique (tenant_id, urutan)
);

create table if not exists rombongan_belajar (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default current_setting('app.tenant_id', true)
                  references satuan_pendidikan(id) on delete cascade,
  nama            text not null,
  tingkat_id      uuid not null references tingkat(id) on delete cascade,
  tahun_ajaran_id uuid not null references tahun_ajaran(id) on delete cascade,
  dibuat_pada     timestamptz not null default now(),
  unique (tenant_id, tahun_ajaran_id, nama)
);

create table if not exists penempatan_rombongan_belajar (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null default current_setting('app.tenant_id', true)
                      references satuan_pendidikan(id) on delete cascade,
  peserta_didik_id    uuid not null references peserta_didik(id) on delete cascade,
  rombongan_belajar_id uuid not null references rombongan_belajar(id) on delete cascade,
  tahun_ajaran_id     uuid not null references tahun_ajaran(id) on delete cascade,
  semester            text not null check (semester in ('ganjil', 'genap')),
  status              text not null check (status in ('aktif', 'naik', 'tinggal', 'pindah')),
  catatan             text,
  dibuat_oleh         text,
  dibuat_pada         timestamptz not null default now(),
  unique (tenant_id, peserta_didik_id, tahun_ajaran_id, semester)
);

-- Comments documenting domain purpose (rombel spans semesters + append-only are critical).
comment on column rombongan_belajar.nama is
  'Rombel identity spans both semesters of the TA (no semester column here — semester context is in penempatan).';
comment on table penempatan_rombongan_belajar is
  'Append-only placement history. NEVER UPDATE or DELETE (audit trail, like riwayat_status_peserta_didik). Current class context is DERIVED (AC#4), not cached.';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table tahun_ajaran                enable row level security;
alter table tahun_ajaran                force  row level security;
create policy tenant_isolation_tahun_ajaran on tahun_ajaran
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table tingkat                    enable row level security;
alter table tingkat                    force  row level security;
create policy tenant_isolation_tingkat on tingkat
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table rombongan_belajar           enable row level security;
alter table rombongan_belajar           force  row level security;
create policy tenant_isolation_rombongan_belajar on rombongan_belajar
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table penempatan_rombongan_belajar enable row level security;
alter table penempatan_rombongan_belajar force  row level security;
create policy tenant_isolation_penempatan_rombongan_belajar on penempatan_rombongan_belajar
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on tahun_ajaran, tingkat, rombongan_belajar,
     penempatan_rombongan_belajar to app_user;
