-- 0015_fk_tenant_scoping.sql
-- Cross-tenant FK hardening for the #11-#22 feature tables (manual P1 sweep,
-- cubic CLI unavailable). Mirrors the defense-in-depth pattern established by
-- 0001b / 0002b / 0003b / 0006b, extended to the tables added in 0007-0014
-- which were merged without a follow-up `*b` migration.
--
-- PROBLEM: migrations 0007 (penilaian), 0008 (permintaan_ai), 0009
-- (absensi_harian + eraport), 0010 (bank_soal), 0011 (notifikasi +
-- perangkat_ajar), 0012 (template_cetak) declared their child FKs as
-- single-column `<col> REFERENCES parent(id)`. A single-column FK is satisfied
-- by ANY parent row with a matching id regardless of tenant, so a child row in
-- tenant A can structurally reference a parent in tenant B. RLS already stops
-- the `app_user` role from reading/writing across tenants at runtime, and the
-- action-layer existence checks throw before a cross-tenant insert, but the FK
-- itself is not tenant-aware: a leaked superuser session, a future BYPASSRLS
-- path, or a bug in the GUC setter could create a referentially-valid
-- cross-tenant link that RLS would then hide rather than prevent.
--
-- FIX: tighten every tenant-scoped child FK to composite
-- `(tenant_id, <col>) -> parent(tenant_id, id)`. A composite FK requires a
-- matching UNIQUE key on the exact parent column pair, so step A adds one to
-- each new parent (PK(id) alone carries no tenant info). Each child already
-- carries its own NOT NULL `tenant_id` (defaulted from the session GUC), so the
-- composite FK ties the child's tenant to the parent's tenant at the storage
-- layer — a cross-tenant reference is now a 23503 FK violation.
--
-- UNTOUCHED (by design):
--   * mata_pelajaran is a GLOBAL reference table (ADR 0001: no tenant_id, no
--     RLS). Its FKs (butir_soal, paket_soal, perangkat_ajar, beban_mengajar)
--     stay single-column ON DELETE RESTRICT.
--   * `tenant_id -> satuan_pendidikan(id)` is the tenant boundary itself; it is
--     already tenant-correct and stays single-column.
--   * capaian_pembelajaran / tujuan_pembelajaran / alur_tujuan_pembelajaran are
--     GLOBAL (no tenant_id) — out of scope.
--
-- NULLABLE FK columns (tingkat_id, draf_ai_id, permintaan_terkait_id): under
-- the default MATCH SIMPLE semantics a composite FK is skipped when ANY column
-- is NULL, so a NULL reference is unconstrained (correct — a missing optional
-- link must not be rejected); a NON-NULL reference must resolve in the SAME
-- tenant.
--
-- ON DELETE SET NULL on a composite FK would null EVERY referencing column
-- (including the NOT NULL tenant_id) and fail, so the column-list form
-- `ON DELETE SET NULL (<col>)` (PostgreSQL 15+; this stack runs postgres:17) is
-- used for the AI-link / retry-link columns — exactly as 0001b did for
-- `pengguna.ptk_id`.
--
-- Idempotent: UNIQUE indexes use CREATE ... IF NOT EXISTS; FK drops use DROP
-- CONSTRAINT IF EXISTS; FK adds are guarded by an IF-NOT-EXISTS DO block. The
-- per-file migrator also tracks applied state in schema_migrations.

-- ===========================================================================
-- A. Composite UNIQUE (tenant_id, id) on the new tenant-scoped parents so a
--    composite FK may target them. PK(id) is globally unique; this pair is
--    strictly tighter and cannot be violated by existing rows.
-- ===========================================================================
create unique index if not exists beban_mengajar_tenant_id_unique
  on beban_mengajar (tenant_id, id);
create unique index if not exists komponen_nilai_tenant_id_unique
  on komponen_nilai (tenant_id, id);
create unique index if not exists penilaian_tenant_id_unique
  on penilaian (tenant_id, id);
create unique index if not exists permintaan_ai_tenant_id_unique
  on permintaan_ai (tenant_id, id);
create unique index if not exists draf_ai_tenant_id_unique
  on draf_ai (tenant_id, id);
create unique index if not exists draf_eraport_tenant_id_unique
  on draf_eraport (tenant_id, id);
create unique index if not exists template_cetak_tenant_id_unique
  on template_cetak (tenant_id, id);
create unique index if not exists butir_soal_tenant_id_unique
  on butir_soal (tenant_id, id);
create unique index if not exists paket_soal_tenant_id_unique
  on paket_soal (tenant_id, id);

-- ===========================================================================
-- B. 0007_penilaian: komponen_nilai -> penilaian -> nilai_peserta_didik.
--    Preserve ON DELETE CASCADE.
-- ===========================================================================
alter table komponen_nilai drop constraint if exists komponen_nilai_beban_mengajar_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'komponen_nilai'::regclass
      and conname = 'komponen_nilai_tenant_beban_fkey'
  ) then
    alter table komponen_nilai
      add constraint komponen_nilai_tenant_beban_fkey
      foreign key (tenant_id, beban_mengajar_id)
      references beban_mengajar (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table penilaian drop constraint if exists penilaian_komponen_nilai_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'penilaian'::regclass
      and conname = 'penilaian_tenant_komponen_fkey'
  ) then
    alter table penilaian
      add constraint penilaian_tenant_komponen_fkey
      foreign key (tenant_id, komponen_nilai_id)
      references komponen_nilai (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table nilai_peserta_didik drop constraint if exists nilai_peserta_didik_penilaian_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'nilai_peserta_didik'::regclass
      and conname = 'nilai_peserta_didik_tenant_penilaian_fkey'
  ) then
    alter table nilai_peserta_didik
      add constraint nilai_peserta_didik_tenant_penilaian_fkey
      foreign key (tenant_id, penilaian_id)
      references penilaian (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table nilai_peserta_didik drop constraint if exists nilai_peserta_didik_peserta_didik_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'nilai_peserta_didik'::regclass
      and conname = 'nilai_peserta_didik_tenant_peserta_fkey'
  ) then
    alter table nilai_peserta_didik
      add constraint nilai_peserta_didik_tenant_peserta_fkey
      foreign key (tenant_id, peserta_didik_id)
      references peserta_didik (tenant_id, id) on delete cascade;
  end if;
end $$;

-- ===========================================================================
-- C. 0008_permintaan_ai: permintaan_ai (self retry link) + draf_ai + kuota_ai.
-- ===========================================================================
-- permintaan_terkait_id: nullable self-referencing retry link. SET NULL on the
-- link column only (tenant_id stays NOT NULL).
alter table permintaan_ai drop constraint if exists permintaan_ai_permintaan_terkait_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'permintaan_ai'::regclass
      and conname = 'permintaan_ai_tenant_terkait_fkey'
  ) then
    alter table permintaan_ai
      add constraint permintaan_ai_tenant_terkait_fkey
      foreign key (tenant_id, permintaan_terkait_id)
      references permintaan_ai (tenant_id, id) on delete set null (permintaan_terkait_id);
  end if;
end $$;

alter table draf_ai drop constraint if exists draf_ai_permintaan_ai_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'draf_ai'::regclass
      and conname = 'draf_ai_tenant_permintaan_fkey'
  ) then
    alter table draf_ai
      add constraint draf_ai_tenant_permintaan_fkey
      foreign key (tenant_id, permintaan_ai_id)
      references permintaan_ai (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table kuota_ai drop constraint if exists kuota_ai_tahun_ajaran_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'kuota_ai'::regclass
      and conname = 'kuota_ai_tenant_tahun_ajaran_fkey'
  ) then
    alter table kuota_ai
      add constraint kuota_ai_tenant_tahun_ajaran_fkey
      foreign key (tenant_id, tahun_ajaran_id)
      references tahun_ajaran (tenant_id, id) on delete cascade;
  end if;
end $$;

-- ===========================================================================
-- D. 0009_eraport: draf_eraport (+ optional draf_ai link) + revisi_eraport.
-- ===========================================================================
alter table draf_eraport drop constraint if exists draf_eraport_peserta_didik_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'draf_eraport'::regclass
      and conname = 'draf_eraport_tenant_peserta_fkey'
  ) then
    alter table draf_eraport
      add constraint draf_eraport_tenant_peserta_fkey
      foreign key (tenant_id, peserta_didik_id)
      references peserta_didik (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table draf_eraport drop constraint if exists draf_eraport_tahun_ajaran_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'draf_eraport'::regclass
      and conname = 'draf_eraport_tenant_tahun_ajaran_fkey'
  ) then
    alter table draf_eraport
      add constraint draf_eraport_tenant_tahun_ajaran_fkey
      foreign key (tenant_id, tahun_ajaran_id)
      references tahun_ajaran (tenant_id, id) on delete cascade;
  end if;
end $$;

-- draf_ai_id: nullable AI-narrative link. SET NULL on the link column only.
alter table draf_eraport drop constraint if exists draf_eraport_draf_ai_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'draf_eraport'::regclass
      and conname = 'draf_eraport_tenant_draf_ai_fkey'
  ) then
    alter table draf_eraport
      add constraint draf_eraport_tenant_draf_ai_fkey
      foreign key (tenant_id, draf_ai_id)
      references draf_ai (tenant_id, id) on delete set null (draf_ai_id);
  end if;
end $$;

alter table revisi_eraport drop constraint if exists revisi_eraport_eraport_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'revisi_eraport'::regclass
      and conname = 'revisi_eraport_tenant_eraport_fkey'
  ) then
    alter table revisi_eraport
      add constraint revisi_eraport_tenant_eraport_fkey
      foreign key (tenant_id, eraport_id)
      references draf_eraport (tenant_id, id) on delete cascade;
  end if;
end $$;

-- ===========================================================================
-- E. 0009_absensi_harian: peserta_didik + rombongan_belajar.
-- ===========================================================================
alter table absensi_harian drop constraint if exists absensi_harian_peserta_didik_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'absensi_harian'::regclass
      and conname = 'absensi_harian_tenant_peserta_fkey'
  ) then
    alter table absensi_harian
      add constraint absensi_harian_tenant_peserta_fkey
      foreign key (tenant_id, peserta_didik_id)
      references peserta_didik (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table absensi_harian drop constraint if exists absensi_harian_rombongan_belajar_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'absensi_harian'::regclass
      and conname = 'absensi_harian_tenant_rombel_fkey'
  ) then
    alter table absensi_harian
      add constraint absensi_harian_tenant_rombel_fkey
      foreign key (tenant_id, rombongan_belajar_id)
      references rombongan_belajar (tenant_id, id) on delete cascade;
  end if;
end $$;

-- ===========================================================================
-- F. 0010_bank_soal: butir_soal (tingkat + draf_ai) + paket_soal (tingkat +
--    tahun_ajaran) + paket_soal_butir junction. mata_pelajaran FKs stay
--    single-column (GLOBAL, ADR 0001).
-- ===========================================================================
alter table butir_soal drop constraint if exists butir_soal_tingkat_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'butir_soal'::regclass
      and conname = 'butir_soal_tenant_tingkat_fkey'
  ) then
    alter table butir_soal
      add constraint butir_soal_tenant_tingkat_fkey
      foreign key (tenant_id, tingkat_id)
      references tingkat (tenant_id, id) on delete cascade;
  end if;
end $$;

-- butir_soal.draf_ai_id: nullable AI-provenance link. SET NULL on link column.
alter table butir_soal drop constraint if exists butir_soal_draf_ai_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'butir_soal'::regclass
      and conname = 'butir_soal_tenant_draf_ai_fkey'
  ) then
    alter table butir_soal
      add constraint butir_soal_tenant_draf_ai_fkey
      foreign key (tenant_id, draf_ai_id)
      references draf_ai (tenant_id, id) on delete set null (draf_ai_id);
  end if;
end $$;

alter table paket_soal drop constraint if exists paket_soal_tingkat_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'paket_soal'::regclass
      and conname = 'paket_soal_tenant_tingkat_fkey'
  ) then
    alter table paket_soal
      add constraint paket_soal_tenant_tingkat_fkey
      foreign key (tenant_id, tingkat_id)
      references tingkat (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table paket_soal drop constraint if exists paket_soal_tahun_ajaran_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'paket_soal'::regclass
      and conname = 'paket_soal_tenant_tahun_ajaran_fkey'
  ) then
    alter table paket_soal
      add constraint paket_soal_tenant_tahun_ajaran_fkey
      foreign key (tenant_id, tahun_ajaran_id)
      references tahun_ajaran (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table paket_soal_butir drop constraint if exists paket_soal_butir_paket_soal_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'paket_soal_butir'::regclass
      and conname = 'paket_soal_butir_tenant_paket_fkey'
  ) then
    alter table paket_soal_butir
      add constraint paket_soal_butir_tenant_paket_fkey
      foreign key (tenant_id, paket_soal_id)
      references paket_soal (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table paket_soal_butir drop constraint if exists paket_soal_butir_butir_soal_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'paket_soal_butir'::regclass
      and conname = 'paket_soal_butir_tenant_butir_fkey'
  ) then
    alter table paket_soal_butir
      add constraint paket_soal_butir_tenant_butir_fkey
      foreign key (tenant_id, butir_soal_id)
      references butir_soal (tenant_id, id) on delete cascade;
  end if;
end $$;

-- ===========================================================================
-- G. 0011_perangkat_ajar: tingkat + tahun_ajaran + (nullable) draf_ai.
--    mata_pelajaran FK stays single-column (GLOBAL).
-- ===========================================================================
alter table perangkat_ajar drop constraint if exists perangkat_ajar_tingkat_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'perangkat_ajar'::regclass
      and conname = 'perangkat_ajar_tenant_tingkat_fkey'
  ) then
    alter table perangkat_ajar
      add constraint perangkat_ajar_tenant_tingkat_fkey
      foreign key (tenant_id, tingkat_id)
      references tingkat (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table perangkat_ajar drop constraint if exists perangkat_ajar_tahun_ajaran_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'perangkat_ajar'::regclass
      and conname = 'perangkat_ajar_tenant_tahun_ajaran_fkey'
  ) then
    alter table perangkat_ajar
      add constraint perangkat_ajar_tenant_tahun_ajaran_fkey
      foreign key (tenant_id, tahun_ajaran_id)
      references tahun_ajaran (tenant_id, id) on delete cascade;
  end if;
end $$;

-- perangkat_ajar.draf_ai_id: nullable AI-assist link. SET NULL on link column.
alter table perangkat_ajar drop constraint if exists perangkat_ajar_draf_ai_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'perangkat_ajar'::regclass
      and conname = 'perangkat_ajar_tenant_draf_ai_fkey'
  ) then
    alter table perangkat_ajar
      add constraint perangkat_ajar_tenant_draf_ai_fkey
      foreign key (tenant_id, draf_ai_id)
      references draf_ai (tenant_id, id) on delete set null (draf_ai_id);
  end if;
end $$;

-- ===========================================================================
-- H. 0011_notifikasi: notifikasi + preferensi_notifikasi -> pengguna.
-- ===========================================================================
alter table notifikasi drop constraint if exists notifikasi_pengguna_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'notifikasi'::regclass
      and conname = 'notifikasi_tenant_pengguna_fkey'
  ) then
    alter table notifikasi
      add constraint notifikasi_tenant_pengguna_fkey
      foreign key (tenant_id, pengguna_id)
      references pengguna (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table preferensi_notifikasi drop constraint if exists preferensi_notifikasi_pengguna_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'preferensi_notifikasi'::regclass
      and conname = 'preferensi_notifikasi_tenant_pengguna_fkey'
  ) then
    alter table preferensi_notifikasi
      add constraint preferensi_notifikasi_tenant_pengguna_fkey
      foreign key (tenant_id, pengguna_id)
      references pengguna (tenant_id, id) on delete cascade;
  end if;
end $$;

-- ===========================================================================
-- I. 0012_template_cetak: dokumen_cetak -> draf_eraport + template_cetak.
-- ===========================================================================
alter table dokumen_cetak drop constraint if exists dokumen_cetak_draf_eraport_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'dokumen_cetak'::regclass
      and conname = 'dokumen_cetak_tenant_eraport_fkey'
  ) then
    alter table dokumen_cetak
      add constraint dokumen_cetak_tenant_eraport_fkey
      foreign key (tenant_id, draf_eraport_id)
      references draf_eraport (tenant_id, id) on delete cascade;
  end if;
end $$;

alter table dokumen_cetak drop constraint if exists dokumen_cetak_template_cetak_id_fkey;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'dokumen_cetak'::regclass
      and conname = 'dokumen_cetak_tenant_template_fkey'
  ) then
    alter table dokumen_cetak
      add constraint dokumen_cetak_tenant_template_fkey
      foreign key (tenant_id, template_cetak_id)
      references template_cetak (tenant_id, id) on delete cascade;
  end if;
end $$;
