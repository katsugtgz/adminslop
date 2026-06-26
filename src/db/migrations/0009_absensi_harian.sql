-- 0009_absensi_harian.sql
-- Daily attendance data layer (#15, Wave 1).
--   * absensi_harian = one daily attendance record per peserta_didik per date
--     per rombongan_belajar
--
-- DOMAIN (acceptance criteria):
--   AC#2 — status_kehadiran is one of Hadir, Izin, Sakit, Alpa.
--   AC#3 — metode_input is manual or qr; QR ASSISTS but attendance is
--          CORRECTABLE (UPDATE is always allowed). The presence of `sumber_qr`
--          does NOT lock the record — a QR-captured row may still be corrected
--          (e.g. a student scanned in but was later marked Izin/Sakit).
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: the column defaults to current_setting() and RLS
-- `WITH CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

create table if not exists absensi_harian (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            text not null default current_setting('app.tenant_id', true)
                       references satuan_pendidikan(id) on delete cascade,
  peserta_didik_id     uuid not null references peserta_didik(id) on delete cascade,
  rombongan_belajar_id uuid not null references rombongan_belajar(id) on delete cascade,
  tanggal              date not null,
  status_kehadiran     text not null check (status_kehadiran in ('hadir','izin','sakit','alpa')),
  metode_input         text not null default 'manual' check (metode_input in ('manual','qr')),
  catatan              text,
  sumber_qr            text,
  dibuat_oleh          text not null,
  dibuat_pada          timestamptz not null default now(),
  diperbarui_pada      timestamptz not null default now(),
  unique (tenant_id, peserta_didik_id, tanggal)
);

-- Comments documenting the domain purpose (AC#2 status enum, AC#3 QR-correctable).
comment on column absensi_harian.status_kehadiran is
  'AC#2: Hadir, Izin, Sakit, Alpa';
comment on column absensi_harian.metode_input is
  'AC#3: QR assists but attendance is correctable (UPDATE allowed)';
comment on column absensi_harian.sumber_qr is
  'QR session token if captured via QR. NULL for manual entry. Presence does NOT lock the record.';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table absensi_harian enable row level security;
alter table absensi_harian force  row level security;
create policy tenant_isolation_absensi_harian on absensi_harian
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on absensi_harian to app_user;
