-- 0011_notifikasi.sql
-- In-app Notifikasi & Pengingat for Tugas Tertunda (#20, MVP).
--   * notifikasi           = in-app notification addressed to ONE Pengguna
--                            (recipient). `tipe` categorizes the reminder
--                            (tugas_nilai, tugas_absensi, tugas_eraport, umum).
--                            `konteks` carries optional deep-link context
--                            ({bebanId, penilaianId, ...}). `dibaca` tracks the
--                            read/unread badge. MVP scope: in-app ONLY — no
--                            WhatsApp, email, SMS, or parent-facing delivery.
--   * preferensi_notifikasi = per-Pengguna per-tipe on/off toggle (self-service).
--                            UNIQUE (tenant, pengguna, tipe) so upsert is safe.
--
-- Both tables are tenant-scoped (RLS via app.tenant_id GUC) AND recipient-scoped
-- (pengguna_id). MVP authorization: a Pengguna sees/manages ONLY their own rows
-- (self-ownership enforced at the action layer; AC#3/#5 of #20). No
-- WhatsApp/email/SMS delivery is part of this slice (AC#5: no external sends).
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

-- notifikasi: in-app notification addressed to one Pengguna (recipient).
CREATE TABLE IF NOT EXISTS notifikasi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  pengguna_id uuid NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  tipe text NOT NULL,
  judul text NOT NULL,
  pesan text NOT NULL,
  dibaca boolean NOT NULL DEFAULT false,
  konteks jsonb,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

-- preferensi_notifikasi: per-Pengguna per-tipe toggle (self-service). Default
-- state is "absent" = treated as aktif (see repo: a missing row means the tipe
-- is on). This table only stores explicit opt-OFF rows.
CREATE TABLE IF NOT EXISTS preferensi_notifikasi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  pengguna_id uuid NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  tipe text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pengguna_id, tipe)
);

-- Document the domain meaning of the columns.
COMMENT ON COLUMN notifikasi.tipe IS
  'Reminder category: tugas_nilai | tugas_absensi | tugas_eraport | umum.';
COMMENT ON COLUMN notifikasi.konteks IS
  'Optional deep-link context jsonb, e.g. {bebanId, penilaianId}.';
COMMENT ON COLUMN notifikasi.dibaca IS
  'Read/unread state. false = pending (counts toward badge).';
COMMENT ON COLUMN preferensi_notifikasi.aktif IS
  'Per-tipe on/off. A missing row for a tipe is treated as aktif (on).';

-- Row-Level Security: tenant isolation on every tenant-scoped table.
-- FORCE applies policies even to the table owner.
alter table notifikasi enable row level security;
alter table notifikasi force  row level security;
create policy tenant_isolation_notifikasi on notifikasi
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

alter table preferensi_notifikasi enable row level security;
alter table preferensi_notifikasi force  row level security;
create policy tenant_isolation_preferensi_notifikasi on preferensi_notifikasi
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on notifikasi, preferensi_notifikasi to app_user;
