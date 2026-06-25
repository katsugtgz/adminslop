-- 0000_tenant_spine.sql
-- Tenant DB/RLS spine (#3).
--   * satuan_pendidikan = tenant registry (id = WorkOS Organization.id)
--   * contoh_catatan    = smoke tenant-scoped record (throwaway, not domain)
--   * catatan_audit     = tenant-scoped audit log (Catatan Audit)
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side
-- via set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken
-- from a client-supplied value: columns default to current_setting() and RLS
-- `WITH CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

create table if not exists satuan_pendidikan (
  id         text primary key,
  nama       text not null,
  created_at timestamptz not null default now()
);

create table if not exists contoh_catatan (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  text not null default current_setting('app.tenant_id', true)
             references satuan_pendidikan(id),
  judul      text not null,
  isi        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catatan_audit (
  id         serial primary key,
  tenant_id  text not null default current_setting('app.tenant_id', true)
             references satuan_pendidikan(id),
  aktor      text not null,
  aksi       text not null,
  target     text,
  beban      jsonb,
  dibuat_pada timestamptz not null default now()
);

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table contoh_catatan enable row level security;
alter table contoh_catatan force  row level security;
create policy tenant_isolation_contoh_catatan on contoh_catatan
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table catatan_audit enable row level security;
alter table catatan_audit force  row level security;
create policy tenant_isolation_catatan_audit on catatan_audit
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant usage                       on schema public to app_user;
grant select, insert, update, delete
  on satuan_pendidikan, contoh_catatan, catatan_audit to app_user;
grant usage, select on sequence catatan_audit_id_seq to app_user;
