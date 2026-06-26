-- 0014_mode_offline.sql
-- Mode Offline (#21) — optimistic concurrency column for conflict detection.
--
--   * nilai_peserta_didik.versi  — bumped on every UPDATE
--   * absensi_harian.versi       — bumped on every UPDATE
--
-- ACCEPTANCE CRITERIA:
--   AC#1 — Nilai + Absensi drafts captured locally while offline.
--   AC#2 — Drafts live in client localStorage (NOT a server table).
--   AC#3 — On reconnect, pending drafts sync to the server.
--   AC#4 — On conflict (server versi > client versi), the server row is NOT
--          overwritten; the client is told a conflict exists.
--
-- This migration adds ONLY the `versi` column to the two existing tables. No
-- new RLS table is needed — drafts are a client-side concern. The column
-- defaults to 1 so every existing row starts at the baseline version; every
-- successful UPDATE increments it. The sync endpoint
-- (`src/app/api/sinkronisasi/route.ts`) performs
--   UPDATE ... WHERE id = $1 AND versi = $clientVersi
-- and treats 0 rows affected (with a higher-versi row present) as a conflict.
--
-- tenant_id continues to flow from the session GUC `app.tenant_id`; RLS
-- already isolates both tables (migrations 0007 + 0009), so no policy changes
-- are required here.

-- nilai_peserta_didik.versi: bumped on every upsert via the sync endpoint.
alter table nilai_peserta_didik
  add column if not exists versi integer not null default 1;

-- absensi_harian.versi: bumped on every catat/ubah via the sync endpoint.
alter table absensi_harian
  add column if not exists versi integer not null default 1;

comment on column nilai_peserta_didik.versi is
  'AC#4 (#21): optimistic-concurrency version. Bumped on every UPDATE; the sync endpoint matches on (id, versi) and a mismatch means a newer server edit (conflict).';
comment on column absensi_harian.versi is
  'AC#4 (#21): optimistic-concurrency version. Bumped on every UPDATE; the sync endpoint matches on (id, versi) and a mismatch means a newer server edit (conflict).';
