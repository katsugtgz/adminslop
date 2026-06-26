-- 0012_template_cetak.sql
-- Cetak (print/export) surface (#14):
--   * template_cetak = reusable print-config template (margin, font, header/
--                     footer text, show_logo, show_header). One default per
--                     (tenant, jenis) — enforced in the repo layer.
--   * dokumen_cetak  = a generated print document rooted at a TERBIT
--                     draf_eraport (#13) + a template_cetak. Carries print-
--                     element tanda tangan + stempel placeholders.
--
-- AC#4 (MANDATORY): tanda_tangan_nama / tanda_tangan_peran / stempel_url are
-- PRINT ELEMENTS for document formatting only. They are NOT legal digital
-- signatures, cryptographic proofs, or approval mechanisms. Do not rely on
-- them for authorization or non-repudiation.
--
-- PREREQUISITE (satuan_pendidikan preferensi cetak from #5): the Cetak surface
-- composes school identity (nama, npsn, alamat, logo_url) + paper-size
-- preference (cetak_paper_size) into the preview. Those columns belong to #5
-- (Satuan Pendidikan profile) which has not landed yet; they are added here with
-- ADD COLUMN IF NOT EXISTS so #14 is self-contained and forward-compatible.
-- Adding nullable/defaulted columns is safe for existing rows and tests.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PREREQUISITE: satuan_pendidikan preferensi cetak (#5 forward-compat).
-- ---------------------------------------------------------------------------
alter table satuan_pendidikan
  add column if not exists npsn text,
  add column if not exists alamat text,
  add column if not exists logo_url text,
  add column if not exists cetak_paper_size text not null default 'a4',
  add column if not exists cetak_tampilkan_logo boolean not null default true,
  add column if not exists cetak_tampilkan_header boolean not null default true;

-- CHECK on cetak_paper_size (idempotent guard; do not error if exists).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'satuan_pendidikan_cetak_paper_size_check'
  ) then
    alter table satuan_pendidikan
      add constraint satuan_pendidikan_cetak_paper_size_check
      check (cetak_paper_size in ('a4', 'f4'));
  end if;
end $$;

comment on column satuan_pendidikan.npsn is
  'Identity: Nomor Pokok Sekolah Nasional. Nullable until profile filled (#5).';
comment on column satuan_pendidikan.alamat is
  'Identity: school address line. Nullable until profile filled (#5).';
comment on column satuan_pendidikan.logo_url is
  'Identity: school logo URL for the Cetak header. Nullable until profile filled (#5).';
comment on column satuan_pendidikan.cetak_paper_size is
  'Preferensi cetak (#5/#14): default paper size for generated documents (a4|f4).';
comment on column satuan_pendidikan.cetak_tampilkan_logo is
  'Preferensi cetak (#5/#14): show the school logo in the print header.';
comment on column satuan_pendidikan.cetak_tampilkan_header is
  'Preferensi cetak (#5/#14): show the school identity header.';

-- ---------------------------------------------------------------------------
-- template_cetak: reusable print-config template.
-- ---------------------------------------------------------------------------
create table if not exists template_cetak (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default current_setting('app.tenant_id', true)
    references satuan_pendidikan(id) on delete cascade,
  nama text not null,
  jenis text not null default 'eraport' check (jenis in ('eraport')),
  pengaturan jsonb not null default '{}',
  is_default boolean not null default false,
  dibuat_oleh text,
  dibuat_pada timestamptz not null default now()
);

comment on table template_cetak is
  'Template Cetak: konfigurasi cetak yang dapat digunakan ulang per Satuan Pendidikan. pengaturan = {margin_mm, font_size, header_text, footer_text, show_logo, show_header}.';
comment on column template_cetak.jenis is
  'Template kind. MVP: ''eraport'' only (CHECK-enforced closed vocabulary).';
comment on column template_cetak.pengaturan is
  'jsonb print config: margin_mm int, font_size int, header_text, footer_text, show_logo bool, show_header bool.';
comment on column template_cetak.is_default is
  'One default per (tenant, jenis) — enforced in the repo layer (unset others before setting true).';

-- ---------------------------------------------------------------------------
-- dokumen_cetak: generated print document from a TERBIT draf_eraport.
-- ---------------------------------------------------------------------------
create table if not exists dokumen_cetak (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default current_setting('app.tenant_id', true)
    references satuan_pendidikan(id) on delete cascade,
  draf_eraport_id uuid not null references draf_eraport(id) on delete cascade,
  template_cetak_id uuid not null references template_cetak(id) on delete cascade,
  tanda_tangan_nama text,
  tanda_tangan_peran text,
  stempel_url text,
  format text not null check (format in ('a4', 'f4')),
  dibuat_oleh text,
  dibuat_pada timestamptz not null default now()
);

comment on table dokumen_cetak is
  'AC#4: Dokumen Cetak — output cetak dari draf_eraport TERBIT. Tanda Tangan & Stempel adalah ELEMEN CETAK, BUKAN tanda tangan legal/tanda tangan digital.';
comment on column dokumen_cetak.tanda_tangan_nama is
  'AC#4 PRINT ELEMENT ONLY: name shown in the signature area. NOT a legal digital signature.';
comment on column dokumen_cetak.tanda_tangan_peran is
  'AC#4 PRINT ELEMENT ONLY: role shown under the signature. NOT approval proof.';
comment on column dokumen_cetak.stempel_url is
  'AC#4 PRINT ELEMENT ONLY: stamp image URL. NOT a cryptographic seal.';
comment on column dokumen_cetak.format is
  'Paper size for this document (a4|f4). Derived from template/satuan_pendidikan preferensi at generation time.';

-- ---------------------------------------------------------------------------
-- Row-Level Security: tenant isolation on both tables. FORCE applies policies
-- even to the table owner.
-- ---------------------------------------------------------------------------
alter table template_cetak enable row level security;
alter table template_cetak force  row level security;
create policy tenant_isolation_template_cetak on template_cetak
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table dokumen_cetak enable row level security;
alter table dokumen_cetak force  row level security;
create policy tenant_isolation_dokumen_cetak on dokumen_cetak
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
grant select, insert, update, delete
  on template_cetak, dokumen_cetak to app_user;
