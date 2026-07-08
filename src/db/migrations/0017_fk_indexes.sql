-- 0017_fk_indexes.sql
-- Add regular (non-unique) indexes on FK columns that lack them. Under RLS,
-- every tenant-scoped query includes `tenant_id = current_setting(...)`, so
-- composite (tenant_id, fk_col) indexes align with the actual access path.
--
-- Migrations run inside a transaction (see migrate.ts:46), so CREATE INDEX
-- CONCURRENTLY is not available — plain CREATE INDEX IF NOT EXISTS is
-- idempotent and safe.
--
-- ALREADY COVERED (no new index needed — existing UNIQUE indexes serve the
-- same access path because RLS always prepends tenant_id):
--   * absensi_harian(peserta_didik_id, tanggal)
--       UNIQUE (tenant_id, peserta_didik_id, tanggal) — 0009_absensi_harian.sql
--   * nilai_peserta_didik(penilaian_id, peserta_didik_id)
--       UNIQUE (tenant_id, penilaian_id, peserta_didik_id) — schema.ts
--   * penilaian(komponen_nilai_id)
--       UNIQUE (tenant_id, komponen_nilai_id, nama) — schema.ts (prefix match)
--   * komponen_nilai(beban_mengajar_id)
--       UNIQUE (tenant_id, beban_mengajar_id, nama) — schema.ts (prefix match)

-- beban_mengajar: lookup by teacher (ptk) — "what does this teacher teach?"
create index if not exists beban_mengajar_tenant_ptk_idx
  on beban_mengajar (tenant_id, ptk_id);

-- beban_mengajar: lookup by class (rombongan_belajar) — "who teaches this class?"
create index if not exists beban_mengajar_tenant_rombel_idx
  on beban_mengajar (tenant_id, rombongan_belajar_id);

-- notifikasi: list a user's notifications (inbox).
create index if not exists notifikasi_tenant_pengguna_idx
  on notifikasi (tenant_id, pengguna_id);

-- catatan_audit: list a tenant's audit entries ordered by time (newest first
-- in the UI). dibuat_pada DESC is the typical sort; a plain btree index is
-- usable for both directions.
create index if not exists catatan_audit_tenant_dibuat_pada_idx
  on catatan_audit (tenant_id, dibuat_pada);
