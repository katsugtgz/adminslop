-- 0001_profil_pengaturan_satuan.sql
-- Profil + Pengaturan + Preferensi Cetak for satuan_pendidikan (#5).
--   * Profil        = official identity (NPSN, jenjang, alamat, kepala, logo)
--   * Pengaturan    = operational defaults (tahun ajaran, semester, zona)
--   * Preferensi    = MVP print prefs (A4/F4 only — see roadmap.md §Gate)
--
-- satuan_pendidikan IS the tenant boundary (id = WorkOS Organization.id),
-- so it is intentionally NOT RLS'd (would be circular). Isolation enforced
-- at the query layer (`where id = membership.orgId`). See CONTEXT.md for
-- the Satuan Pendidikan / Keanggotaan glossary and 0000_tenant_spine.sql
-- for the base schema + grants.

-- === Profil Satuan Pendidikan ===
alter table satuan_pendidikan add column if not exists npsn        text;
alter table satuan_pendidikan add column if not exists jenjang     text check (jenjang in ('SD','SMP','SMA','SMK','MA'));
alter table satuan_pendidikan add column if not exists alamat      text;
alter table satuan_pendidikan add column if not exists nama_kepala text;
alter table satuan_pendidikan add column if not exists logo_url    text;

comment on column satuan_pendidikan.npsn        is 'Nomor Pokok Sekolah Nasional (Kemendikbud); nullable until verified.';
comment on column satuan_pendidikan.jenjang     is 'Jenjang pendidikan: SD|SMP|SMA|SMK|MA.';
comment on column satuan_pendidikan.alamat      is 'Alamat lengkap satuan pendidikan.';
comment on column satuan_pendidikan.nama_kepala is 'Nama kepala satuan pendidikan.';
comment on column satuan_pendidikan.logo_url    is 'URL logo satuan pendidikan (storage path or https URL).';

-- === Pengaturan Satuan Pendidikan (operational defaults) ===
alter table satuan_pendidikan add column if not exists tahun_ajaran_aktif text;
alter table satuan_pendidikan add column if not exists semester_aktif    text check (semester_aktif in ('Ganjil','Genap'));
alter table satuan_pendidikan add column if not exists zona_waktu        text not null default 'Asia/Jakarta';

comment on column satuan_pendidikan.tahun_ajaran_aktif is 'Tahun ajaran aktif, mis. "2025/2026".';
comment on column satuan_pendidikan.semester_aktif    is 'Semester aktif: Ganjil|Genap.';
comment on column satuan_pendidikan.zona_waktu        is 'IANA timezone untuk jam lokal sekolah (default Asia/Jakarta).';

-- === Preferensi Cetak (MVP: A4/F4 only — see roadmap.md §Gate) ===
alter table satuan_pendidikan add column if not exists cetak_paper_size     text    not null default 'A4' check (cetak_paper_size in ('A4','F4'));
alter table satuan_pendidikan add column if not exists cetak_tampilkan_logo boolean not null default true;
alter table satuan_pendidikan add column if not exists cetak_tampilkan_header boolean not null default true;

comment on column satuan_pendidikan.cetak_paper_size      is 'Ukuran kertas cetak: A4|F4 (MVP-limited per roadmap §Gate).';
comment on column satuan_pendidikan.cetak_tampilkan_logo  is 'Tampilkan logo satuan pada cetakan.';
comment on column satuan_pendidikan.cetak_tampilkan_header is 'Tampilkan kop/header satuan pada cetakan.';
