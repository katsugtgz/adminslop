-- 0002b_fk_tenant_scoping.sql
-- Cross-tenant FK hardening (cubic P1-2/3/4). Supersedes the single-column FKs
-- created in 0002_peserta_didik.sql.
--
-- PROBLEM: 0002 created child FKs as `peserta_didik_id -> peserta_didik(id)`.
-- That single-column FK is satisfied by ANY parent row with a matching id,
-- regardless of tenant — so a child row in tenant B can reference a parent in
-- tenant A. RLS already stops the `app_user` role from reading/writing across
-- tenants, but the FK itself is not tenant-aware: a leaked superuser session, a
-- future BYPASSRLS path, or a bug in the GUC setter could create a
-- referentially-valid cross-tenant link that RLS would then hide rather than
-- prevent. Defense-in-depth demands the DB reject it directly.
--
-- FIX: tighten every child FK to composite `(tenant_id, peserta_didik_id) ->
-- peserta_didik(tenant_id, id)`. A composite FK requires a matching UNIQUE key
-- on the exact parent column pair, so step 1 adds one. Each child already
-- carries its own `tenant_id` (defaulted from the session GUC), so the composite
-- FK ties the child's tenant to the parent's tenant at the storage layer.
-- CASCADE is preserved so deleting a peserta_didik still removes its children.

-- 1. Composite UNIQUE on the parent — required target for composite FKs.
--    (id is already the PK, but a composite FK needs a unique key on the pair.)
alter table peserta_didik
  add constraint peserta_didik_tenant_id_id_key unique (tenant_id, id);

-- 2. riwayat_status_peserta_didik
alter table riwayat_status_peserta_didik
  drop constraint if exists riwayat_status_peserta_didik_peserta_didik_id_fkey;
alter table riwayat_status_peserta_didik
  add constraint riwayat_status_peserta_didik_tenant_peserta_fkey
  foreign key (tenant_id, peserta_didik_id)
  references peserta_didik(tenant_id, id) on delete cascade;

-- 3. mutasi_peserta_didik
alter table mutasi_peserta_didik
  drop constraint if exists mutasi_peserta_didik_peserta_didik_id_fkey;
alter table mutasi_peserta_didik
  add constraint mutasi_peserta_didik_tenant_peserta_fkey
  foreign key (tenant_id, peserta_didik_id)
  references peserta_didik(tenant_id, id) on delete cascade;

-- 4. wali_peserta_didik
alter table wali_peserta_didik
  drop constraint if exists wali_peserta_didik_peserta_didik_id_fkey;
alter table wali_peserta_didik
  add constraint wali_peserta_didik_tenant_peserta_fkey
  foreign key (tenant_id, peserta_didik_id)
  references peserta_didik(tenant_id, id) on delete cascade;

-- 5. kontak_darurat
alter table kontak_darurat
  drop constraint if exists kontak_darurat_peserta_didik_id_fkey;
alter table kontak_darurat
  add constraint kontak_darurat_tenant_peserta_fkey
  foreign key (tenant_id, peserta_didik_id)
  references peserta_didik(tenant_id, id) on delete cascade;
