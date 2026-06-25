-- 0001_akses_ptk.sql
-- Access & PTK layer (#6, Wave 1).
--   * ptk              = PTK personnel record (teacher / staff)
--   * pengguna         = app login identity (WorkOS User), optionally linked to a PTK
--   * izin_akses       = explicit permission grant per pengguna (Izin Akses)
--   * pembatasan_akses = hard-deny restriction per pengguna (Pembatasan Akses)
--
-- DOMAIN DISTINCTION (acceptance criterion #1): a PTK is a personnel record that
-- exists whether or not it can log in. A Pengguna is a login identity. Creating a
-- PTK NEVER creates a Pengguna; access is granted only by linking a Pengguna to a
-- PTK via `pengguna.ptk_id` (nullable). This separation is load-bearing for the
-- whole RBAC model.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

create table if not exists ptk (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default current_setting('app.tenant_id', true)
              references satuan_pendidikan(id) on delete cascade,
  nama        text not null,
  nip         text,
  jenis       text not null check (jenis in ('pendidik', 'tenaga_kependidikan')),
  dibuat_pada timestamptz not null default now()
);

create table if not exists pengguna (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default current_setting('app.tenant_id', true)
              references satuan_pendidikan(id) on delete cascade,
  user_id     text not null,
  peran_akses text not null,
  ptk_id      uuid references ptk(id) on delete set null,
  nama        text,
  dibuat_pada timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- At most one pengguna per ptk within a tenant; multiple unlinked (NULL) rows
-- are allowed so creating a Pengguna without a PTK never conflicts.
create unique index if not exists pengguna_tenant_ptk_idx
  on pengguna (tenant_id, ptk_id) where ptk_id is not null;

create table if not exists izin_akses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default current_setting('app.tenant_id', true)
              references satuan_pendidikan(id) on delete cascade,
  pengguna_id uuid not null references pengguna(id) on delete cascade,
  slug        text not null,
  dibuat_pada timestamptz not null default now(),
  unique (tenant_id, pengguna_id, slug)
);

create table if not exists pembatasan_akses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default current_setting('app.tenant_id', true)
              references satuan_pendidikan(id) on delete cascade,
  pengguna_id uuid not null references pengguna(id) on delete cascade,
  slug        text not null,
  alasan      text,
  dibuat_pada timestamptz not null default now(),
  unique (tenant_id, pengguna_id, slug)
);

-- Comments documenting the domain purpose (PTK vs Pengguna is critical).
comment on table ptk is
  'PTK: catatan personel (pendidik / tenaga kependidikan). Mandiri — keberadaannya tidak bergantung pada akses aplikasi.';
comment on table pengguna is
  'Pengguna: identitas login aplikasi (WorkOS User). Opsional ditautkan ke PTK via ptk_id.';
comment on table izin_akses is
  'Izin Akses: pemberian izin eksplisit per pengguna (slug = IzinSlug).';
comment on table pembatasan_akses is
  'Pembatasan Akses: penolakan keras (hard-deny) per pengguna (slug = IzinSlug).';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table ptk               enable row level security;
alter table ptk               force  row level security;
create policy tenant_isolation_ptk on ptk
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table pengguna          enable row level security;
alter table pengguna          force  row level security;
create policy tenant_isolation_pengguna on pengguna
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table izin_akses        enable row level security;
alter table izin_akses        force  row level security;
create policy tenant_isolation_izin_akses on izin_akses
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table pembatasan_akses  enable row level security;
alter table pembatasan_akses  force  row level security;
create policy tenant_isolation_pembatasan_akses on pembatasan_akses
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on ptk, pengguna, izin_akses, pembatasan_akses to app_user;
