-- 0011_perangkat_ajar.sql
-- Perangkat Ajar — teaching documents (#17): Modul Ajar, RPP, Silabus, Prota,
-- Promes. A per-jenis document shell that may reference Kurikulum (mata
-- pelajaran + optional tingkat) and may be AI-assisted (draf_ai link).
--
-- AC#1: documents are created per `jenis` (modul_ajar|rpp|silabus|prota|promes).
-- AC#2: references kurikulum via mata_pelajaran (GLOBAL, ON DELETE RESTRICT).
-- AC#3: AI-assisted docs carry `status_dokumen_ai` (menunggu->disetujui|ditolak).
--       NULL = not AI-assisted (already official). 'menunggu' = AI content that
--       MUST be verified before the doc can be used as resmi (official). A draf_ai
--       link (draf_ai_id, ON DELETE SET NULL) records the provenance source.
-- AC#4: `jenis` is a CHECK-constrained discriminator so listByJenis can return
--       type-specific slices (not one monolithic format).
--
-- tenant_id is sourced from the session GUC `app.tenant_id` (set server-side via
-- set_config(..., true) = SET LOCAL, PgBouncer-safe). It is NEVER taken from a
-- client-supplied value: columns default to current_setting() and RLS `WITH
-- CHECK` rejects any mismatch.

create extension if not exists pgcrypto;

-- perangkat_ajar: teaching document (per jenis) with optional AI-assist gate.
CREATE TABLE IF NOT EXISTS perangkat_ajar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT current_setting('app.tenant_id', true)
    REFERENCES satuan_pendidikan(id) ON DELETE CASCADE,
  jenis text NOT NULL CHECK (jenis IN ('modul_ajar','rpp','silabus','prota','promes')),
  mata_pelajaran_id uuid NOT NULL REFERENCES mata_pelajaran(id) ON DELETE RESTRICT,
  tingkat_id uuid REFERENCES tingkat(id) ON DELETE CASCADE,
  tahun_ajaran_id uuid NOT NULL REFERENCES tahun_ajaran(id) ON DELETE CASCADE,
  semester text CHECK (semester IN ('ganjil','genap')),
  judul text NOT NULL,
  konten jsonb NOT NULL DEFAULT '{}',
  draf_ai_id uuid REFERENCES draf_ai(id) ON DELETE SET NULL,
  status_dokumen_ai text CHECK (status_dokumen_ai IN ('menunggu','disetujui','ditolak')),
  dibuat_oleh text,
  dibuat_pada timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE perangkat_ajar IS
  'Perangkat Ajar: dokumen mengajar per jenis (modul_ajar/rpp/silabus/prota/promes). Bisa dibantu AI (draf_ai_id) yang butuh Verifikasi Dokumen AI.';
COMMENT ON COLUMN perangkat_ajar.jenis IS
  'AC#1/AC#4: discriminator jenis perangkat ajar. modul_ajar, rpp, silabus, prota (program tahunan), promes (program semester).';
COMMENT ON COLUMN perangkat_ajar.mata_pelajaran_id IS
  'AC#2: rujukan kurikulum. GLOBAL mata_pelajaran (ON DELETE RESTRICT — tidak bisa dihapus mapel yang direferensikan).';
COMMENT ON COLUMN perangkat_ajar.draf_ai_id IS
  'AC#3: bila diisi, dokumen ini dibantu AI dari draf_ai. ON DELETE SET NULL agar draf dihapus tidak menghapus perangkat ajar.';
COMMENT ON COLUMN perangkat_ajar.status_dokumen_ai IS
  'AC#3: NULL = bukan dibantu AI (sudah resmi). menunggu = dibantu AI, BELUM diverifikasi (tidak dapat menjadi dokumen resmi). disetujui/ditolak = keputusan verifikasi.';

-- Row-Level Security: tenant isolation.
-- FORCE applies policies even to the table owner.
alter table perangkat_ajar enable row level security;
alter table perangkat_ajar force  row level security;
create policy tenant_isolation_perangkat_ajar on perangkat_ajar
  using      (tenant_id = current_setting('app.tenant_id', true))
  with check (tenant_id = current_setting('app.tenant_id', true));

-- Application role (non-superuser, no BYPASSRLS) so RLS is enforced.
-- Role is created cluster-wide by docker/init.sql.
grant select, insert, update, delete
  on perangkat_ajar to app_user;
