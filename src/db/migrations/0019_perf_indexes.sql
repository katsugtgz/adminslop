-- 0019_perf_indexes.sql
-- Add regular (non-unique) tenant-scoped composite indexes for three hot query
-- paths that currently seq-scan under RLS. Each index leads with `tenant_id`
-- because RLS rewrites every query to `tenant_id = current_setting(...)` — the
-- composite aligns with the actual access path the planner sees.
--
-- Purely additive: CREATE INDEX IF NOT EXISTS, no DROP, no ALTER on existing
-- indexes/constraints. No behavior change — same query results, faster plans.
--
-- Migrations run inside a transaction (see migrate.ts:46), so CREATE INDEX
-- CONCURRENTLY is not available — plain CREATE INDEX IF NOT EXISTS is
-- idempotent and safe.
--
-- Indexes:
--   * PERF-05  absensi_harian (tenant_id, rombongan_belajar_id, tanggal)
--              Supports queries/absensi.ts:
--                getAbsensiByTanggal (filter rombongan_belajar_id + tanggal)
--                getRekapByRombonganBelajar (aggregate by rombel over a date
--                range). Existing UNIQUE (tenant_id, peserta_didik_id, tanggal)
--                does NOT help class-scoped lookups.
--   * PERF-06  penempatan_rombongan_belajar (tenant_id, rombongan_belajar_id,
--                                              tahun_ajaran_id, semester)
--              Supports queries/penempatan-rombongan-belajar.ts:
--                listAnggotaRombonganBelajar (membership roster for a class in
--                an active TA+semester). Existing UNIQUE (tenant_id,
--                peserta_didik_id, tahun_ajaran_id, semester) is student-first,
--                useless for class-first roster lookups.
--   * PERF-07  revisi_eraport (tenant_id, eraport_id, dibuat_pada DESC)
--              Supports queries/eraport.ts:
--                listRevisiByEraport (revision history per eraport, newest
--                first). DESC ordering matches the UI sort so the index serves
--                both filter and order-by without a separate Sort node.

-- PERF-05: class-and-date scoped attendance reads.
create index if not exists absensi_harian_tenant_rombel_tanggal_idx
  on absensi_harian (tenant_id, rombongan_belajar_id, tanggal);

-- PERF-06: class membership roster for an active TA + semester.
create index if not exists penempatan_rombel_tenant_rombel_ta_sem_idx
  on penempatan_rombongan_belajar (tenant_id, rombongan_belajar_id, tahun_ajaran_id, semester);

-- PERF-07: per-eraport revision history ordered newest-first.
create index if not exists revisi_eraport_tenant_eraport_dibuat_pada_idx
  on revisi_eraport (tenant_id, eraport_id, dibuat_pada desc);
