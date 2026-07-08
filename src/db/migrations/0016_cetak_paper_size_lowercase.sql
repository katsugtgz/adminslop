-- 0016_cetak_paper_size_lowercase.sql
-- Normalise satuan_pendidikan.cetak_paper_size to lowercase ('a4','f4') so it
-- matches dokumen_cetak.format (0012_template_cetak.sql:101) and the
-- FormatCetak type in src/db/queries/cetak.ts. Removes the .toLowerCase()
-- bridge hack in cetak.ts:271-273.
--
-- PROBLEM: 0001_profil_pengaturan_satuan.sql:36 declared the CHECK as
-- ('A4','F4') (uppercase) while 0012_template_cetak.sql:101 declared
-- dokumen_cetak.format as ('a4','f4') (lowercase). The app layer bridged the
-- mismatch by calling .toLowerCase() on every read (cetak.ts:273). This is
-- fragile — any code path that forgets the bridge would break.
--
-- FIX: drop the uppercase CHECK, normalise existing rows with LOWER(), set the
-- default to 'a4', and add a lowercase CHECK. Idempotent: DROP CONSTRAINT IF
-- EXISTS, UPDATE is a no-op on already-lowercase rows, ADD CONSTRAINT uses a
-- DO block to check pg_constraint.

-- 1. Drop the old uppercase CHECK constraint.
alter table satuan_pendidikan
  drop constraint if exists satuan_pendidikan_cetak_paper_size_check;

-- 2. Normalise existing rows to lowercase (no-op on already-lowercase data).
update satuan_pendidikan
   set cetak_paper_size = lower(cetak_paper_size)
 where cetak_paper_size <> lower(cetak_paper_size);

-- 3. Change the column default to lowercase.
alter table satuan_pendidikan
  alter column cetak_paper_size set default 'a4';

-- 4. Add the lowercase CHECK (idempotent via DO block).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'satuan_pendidikan'::regclass
       and conname = 'satuan_pendidikan_cetak_paper_size_check'
  ) then
    alter table satuan_pendidikan
      add constraint satuan_pendidikan_cetak_paper_size_check
      check (cetak_paper_size in ('a4', 'f4'));
  end if;
end
$$;
