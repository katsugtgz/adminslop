-- 0006b_fk_tenant_scoping.sql
-- Cubic P1 fix (#10): tenant-scoped composite FKs for beban_mengajar and
-- wali_kelas. Runs after 0006_beban_mengajar.sql (sort order: '0006_' < '0006b'
-- because '_' 0x5F < 'b' 0x62).
--
-- PROBLEM: the FKs created inline in 0006 reference the parent PK (id) only,
-- e.g. `ptk_id ... REFERENCES ptk(id)`. A beban_mengajar row could therefore
-- point at a ptk / rombongan_belajar / tingkat / tahun_ajaran belonging to a
-- DIFFERENT tenant — RLS isolates reads, but nothing bound the FK to the
-- tenant boundary, so a cross-tenant write was structurally possible.
--
-- FIX: rebuild each tenant-scoped FK as a COMPOSITE (tenant_id, <col>) FK
-- against a new UNIQUE (tenant_id, id) on the parent. The composite key makes
-- tenant membership part of referential identity, so a cross-tenant reference
-- is now a 23503 FK violation at the DB layer (defence in depth under RLS).
--
-- UNTOUCHED (by design):
--   * mata_pelajaran is a GLOBAL reference table (ADR 0001: no tenant_id, no
--     RLS). Its FK on beban_mengajar stays single-column ON DELETE RESTRICT.
--   * tenant_id -> satuan_pendidikan(id) is the tenant boundary itself; it is
--     already tenant-correct and stays single-column.
--
-- The migrator runs each file exactly once (tracked in schema_migrations), so
-- the ADD CONSTRAINTs are safe. DROP CONSTRAINT IF EXISTS guards the drops
-- against partial states. Parent UNIQUE (tenant_id, id) constraints are
-- strictly tighter than the existing PK(id) — no data can violate them.

-- 1. Composite UNIQUE (tenant_id, id) on parent tables so a composite FK can
--    target them. PK(id) alone is globally unique but carries no tenant info.
alter table ptk               add constraint ptk_tenant_id_unique               unique (tenant_id, id);
alter table rombongan_belajar add constraint rombongan_belajar_tenant_id_unique unique (tenant_id, id);
alter table tingkat           add constraint tingkat_tenant_id_unique           unique (tenant_id, id);
alter table tahun_ajaran      add constraint tahun_ajaran_tenant_id_unique      unique (tenant_id, id);

-- 2. beban_mengajar: replace single-column FKs with composite, tenant-bound
--    FKs. ON DELETE CASCADE is preserved (matches 0006 semantics).
alter table beban_mengajar drop constraint if exists beban_mengajar_ptk_id_fkey;
alter table beban_mengajar
  add constraint beban_mengajar_tenant_ptk_fkey
  foreign key (tenant_id, ptk_id) references ptk(tenant_id, id) on delete cascade;

alter table beban_mengajar drop constraint if exists beban_mengajar_rombongan_belajar_id_fkey;
alter table beban_mengajar
  add constraint beban_mengajar_tenant_rombongan_belajar_fkey
  foreign key (tenant_id, rombongan_belajar_id) references rombongan_belajar(tenant_id, id) on delete cascade;

alter table beban_mengajar drop constraint if exists beban_mengajar_tingkat_id_fkey;
alter table beban_mengajar
  add constraint beban_mengajar_tenant_tingkat_fkey
  foreign key (tenant_id, tingkat_id) references tingkat(tenant_id, id) on delete cascade;

alter table beban_mengajar drop constraint if exists beban_mengajar_tahun_ajaran_id_fkey;
alter table beban_mengajar
  add constraint beban_mengajar_tenant_tahun_ajaran_fkey
  foreign key (tenant_id, tahun_ajaran_id) references tahun_ajaran(tenant_id, id) on delete cascade;

-- 3. wali_kelas: same pattern for its three tenant-scoped FKs (ptk,
--    rombongan_belajar, tahun_ajaran). ON DELETE CASCADE preserved.
alter table wali_kelas drop constraint if exists wali_kelas_ptk_id_fkey;
alter table wali_kelas
  add constraint wali_kelas_tenant_ptk_fkey
  foreign key (tenant_id, ptk_id) references ptk(tenant_id, id) on delete cascade;

alter table wali_kelas drop constraint if exists wali_kelas_rombongan_belajar_id_fkey;
alter table wali_kelas
  add constraint wali_kelas_tenant_rombongan_belajar_fkey
  foreign key (tenant_id, rombongan_belajar_id) references rombongan_belajar(tenant_id, id) on delete cascade;

alter table wali_kelas drop constraint if exists wali_kelas_tahun_ajaran_id_fkey;
alter table wali_kelas
  add constraint wali_kelas_tenant_tahun_ajaran_fkey
  foreign key (tenant_id, tahun_ajaran_id) references tahun_ajaran(tenant_id, id) on delete cascade;
