-- 0001b_fk_tenant_scoping.sql
-- Tenant-scoped composite FKs (#6 cubic P1 fix 2 + 3).
--
-- 0001_akses_ptk.sql used single-column FKs:
--   pengguna.ptk_id      -> ptk(id)
--   izin_akses.pengguna_id      -> pengguna(id)
--   pembatasan_akses.pengguna_id -> pengguna(id)
-- Those reference a bare primary key, so nothing in the schema stops a row in
-- tenant A from pointing at a ptk/pengguna in tenant B. RLS already prevents
-- the application role from reading/writing cross-tenant rows at runtime, but
-- the FK itself is not tenant-bound — a defense-in-depth gap.
--
-- This migration tightens the integrity guarantee: it adds composite
-- (tenant_id, id) UNIQUE indexes on ptk and pengguna (required as composite FK
-- referents) and rebuilds the three FKs as composite (tenant_id, <col>) keys so
-- a link is only valid when BOTH the tenant and the target id match.
--
-- Idempotent: `drop constraint if exists` + `create unique index if not exists`
-- make this safe to re-run; the per-file migrator also tracks applied state.
--
-- NOTE on ON DELETE SET NULL (ptk_id): plain `SET NULL` on a composite FK would
-- null EVERY referencing column (including the NOT NULL tenant_id) and fail.
-- The column-list form (PostgreSQL 15+; the stack runs postgres:17) nulls only
-- ptk_id, preserving the original 0001 soft-unlink semantics.

-- 1. Composite UNIQUE referents on the parent tables.
create unique index if not exists ptk_tenant_id_id_uidx
  on ptk (tenant_id, id);
create unique index if not exists pengguna_tenant_id_id_uidx
  on pengguna (tenant_id, id);

-- 2. pengguna.ptk_id -> ptk(tenant_id, id): single-col FK -> composite.
alter table pengguna drop constraint if exists pengguna_ptk_id_fkey;
alter table pengguna
  add constraint pengguna_ptk_id_fkey
  foreign key (tenant_id, ptk_id) references ptk (tenant_id, id)
  on delete set null (ptk_id);

-- 3. izin_akses.pengguna_id -> pengguna(tenant_id, id): composite FK.
alter table izin_akses drop constraint if exists izin_akses_pengguna_id_fkey;
alter table izin_akses
  add constraint izin_akses_pengguna_id_fkey
  foreign key (tenant_id, pengguna_id) references pengguna (tenant_id, id)
  on delete cascade;

-- 4. pembatasan_akses.pengguna_id -> pengguna(tenant_id, id): composite FK.
alter table pembatasan_akses
  drop constraint if exists pembatasan_akses_pengguna_id_fkey;
alter table pembatasan_akses
  add constraint pembatasan_akses_pengguna_id_fkey
  foreign key (tenant_id, pengguna_id) references pengguna (tenant_id, id)
  on delete cascade;
