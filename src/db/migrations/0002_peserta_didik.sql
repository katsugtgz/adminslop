-- 0002_peserta_didik.sql
-- Peserta Didik (student) data layer (#7, Wave 1 / T2).
--   * peserta_didik                  = student core record (denormalized status cache)
--   * riwayat_status_peserta_didik   = append-only status history (audit trail)
--   * mutasi_peserta_didik           = transfer records (masuk / keluar)
--   * wali_peserta_didik             = parent/guardian CONTACT records (NOT logins)
--   * kontak_darurat                 = emergency contact (NOT a login)
--
-- DOMAIN DISTINCTION (acceptance criterion #4): wali_peserta_didik and
-- kontak_darurat are CONTACT records ONLY — they are NOT Pengguna (login
-- identities). A wali cannot sign in. This separation is load-bearing.
--
-- DENORMALIZED STATUS CACHE (acceptance criterion #2): peserta_didik.status
-- is a denormalized cache of the latest riwayat_status_peserta_didik row,
-- updated atomically alongside an append-only history insert. History is
-- NEVER deleted or updated (audit trail); status changes append a new row,
-- they do not rewrite or remove prior history.
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side
-- via set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken
-- from a client-supplied value: columns default to current_setting() and RLS
-- `WITH CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

create table if not exists peserta_didik (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null default current_setting('app.tenant_id', true)
                 references satuan_pendidikan(id) on delete cascade,
  nama           text not null,
  nisn           text,
  nis            text,
  tanggal_lahir  date not null,
  jenis_kelamin  text not null check (jenis_kelamin in ('L','P')),
  status         text not null default 'aktif' check (status in ('aktif','pindah','lulus','keluar')),
  dibuat_pada    timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

-- Partial unique index: at most one student per NISN within a tenant, but
-- multiple NULL NISN rows are allowed (NISN is optional / not yet assigned).
create unique index if not exists peserta_didik_tenant_nisn_idx
  on peserta_didik (tenant_id, nisn) where nisn is not null;

create table if not exists riwayat_status_peserta_didik (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null default current_setting('app.tenant_id', true)
                   references satuan_pendidikan(id) on delete cascade,
  peserta_didik_id uuid not null references peserta_didik(id) on delete cascade,
  status           text not null check (status in ('aktif','pindah','lulus','keluar')),
  catatan          text,
  dibuat_oleh      text,
  dibuat_pada      timestamptz not null default now()
);

create table if not exists mutasi_peserta_didik (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null default current_setting('app.tenant_id', true)
                   references satuan_pendidikan(id) on delete cascade,
  peserta_didik_id uuid not null references peserta_didik(id) on delete cascade,
  arah             text not null check (arah in ('masuk','keluar')),
  asal_sekolah     text,
  tujuan_sekolah   text,
  tanggal          date not null,
  alasan           text,
  dibuat_oleh      text,
  dibuat_pada      timestamptz not null default now()
);

create table if not exists wali_peserta_didik (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null default current_setting('app.tenant_id', true)
                   references satuan_pendidikan(id) on delete cascade,
  peserta_didik_id uuid not null references peserta_didik(id) on delete cascade,
  nama             text not null,
  hubungan         text,
  telepon          text,
  email            text,
  dibuat_pada      timestamptz not null default now()
);

create table if not exists kontak_darurat (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        text not null default current_setting('app.tenant_id', true)
                   references satuan_pendidikan(id) on delete cascade,
  peserta_didik_id uuid not null references peserta_didik(id) on delete cascade,
  nama             text not null,
  hubungan         text,
  telepon          text,
  dibuat_pada      timestamptz not null default now()
);

-- Comments documenting domain purpose (status cache + contact-only are critical).
comment on column peserta_didik.status is
  'Denormalized cache of latest riwayat_status_peserta_didik. aktif|pindah|lulus|keluar. History is append-only in riwayat_status_peserta_didik.';
comment on table riwayat_status_peserta_didik is
  'Append-only status history. Never DELETE or UPDATE rows — audit trail.';
comment on table wali_peserta_didik is
  'Parent/guardian CONTACT records only. NOT Pengguna logins (per AC#4).';
comment on table kontak_darurat is
  'Emergency contact. NOT a Pengguna login.';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table peserta_didik                enable row level security;
alter table peserta_didik                force  row level security;
create policy tenant_isolation_peserta_didik on peserta_didik
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table riwayat_status_peserta_didik enable row level security;
alter table riwayat_status_peserta_didik force  row level security;
create policy tenant_isolation_riwayat_status_peserta_didik on riwayat_status_peserta_didik
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table mutasi_peserta_didik         enable row level security;
alter table mutasi_peserta_didik         force  row level security;
create policy tenant_isolation_mutasi_peserta_didik on mutasi_peserta_didik
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table wali_peserta_didik           enable row level security;
alter table wali_peserta_didik           force  row level security;
create policy tenant_isolation_wali_peserta_didik on wali_peserta_didik
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table kontak_darurat               enable row level security;
alter table kontak_darurat               force  row level security;
create policy tenant_isolation_kontak_darurat on kontak_darurat
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on peserta_didik, riwayat_status_peserta_didik, mutasi_peserta_didik,
     wali_peserta_didik, kontak_darurat to app_user;
