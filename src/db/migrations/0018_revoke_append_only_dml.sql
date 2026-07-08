-- 0018_revoke_append_only_dml.sql
-- Revoke UPDATE and DELETE from app_user on append-only history tables.
-- These tables record immutable history: INSERT-only by design. The previous
-- GRANT statements (0002, 0003, 0009) granted full CRUD; this tightens to
-- SELECT + INSERT, enforcing the append-only invariant at the database role
-- level — a defense-in-depth layer on top of the application code (which never
-- issues UPDATE/DELETE on these tables).
--
-- Tables:
--   * riwayat_status_peserta_didik  (0002_peserta_didik.sql) — status history
--   * penempatan_rombongan_belajar  (0003_rombongan_belajar.sql) — placement log
--   * revisi_eraport                (0009_eraport.sql) — revision history
--
-- Idempotent: REVOKE is safe to re-run; if the privilege is already absent it
-- is a no-op.

revoke update, delete on riwayat_status_peserta_didik  from app_user;
revoke update, delete on penempatan_rombongan_belajar  from app_user;
revoke update, delete on revisi_eraport                from app_user;
