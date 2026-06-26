import { eq } from "drizzle-orm";

import type { Db, Tx } from "@/db/client";
import { satuanPendidikan } from "@/db/schema";
import type {
  PengaturanSatuanPendidikanInput,
  ProfilSatuanPendidikanInput,
} from "@/app/dashboard/pengaturan/schemas";

export interface ProfilDanPengaturanRow {
  // Profil
  id: string;
  nama: string;
  npsn: string | null;
  jenjang: string | null;
  alamat: string | null;
  namaKepala: string | null;
  logoUrl: string | null;
  // Pengaturan
  tahunAjaranAktif: string | null;
  semesterAktif: string | null;
  zonaWaktu: string;
  // Preferensi Cetak
  cetakPaperSize: string;
  cetakTampilkanLogo: boolean;
  cetakTampilkanHeader: boolean;
}

/**
 * Read profil + pengaturan for one tenant. Returns null if the tenant row is
 * missing. `satuan_pendidikan` is NOT RLS'd, so tenant isolation is enforced
 * here via `where id = tenantId` (defense-in-depth).
 */
export async function getProfilDanPengaturan(
  db: Db | Tx,
  tenantId: string,
): Promise<ProfilDanPengaturanRow | null> {
  const rows = await db
    .select()
    .from(satuanPendidikan)
    .where(eq(satuanPendidikan.id, tenantId));
  return rows[0] ?? null;
}

/**
 * Update Profil columns. `tenantId` is enforced in WHERE because
 * `satuan_pendidikan` is NOT RLS'd — the session GUC does not isolate this
 * table, so the id filter is the isolation gate.
 */
export async function updateProfilSatuanPendidikan(
  db: Db | Tx,
  tenantId: string,
  input: ProfilSatuanPendidikanInput,
): Promise<void> {
  await db
    .update(satuanPendidikan)
    .set({
      nama: input.nama,
      npsn: input.npsn ?? null,
      jenjang: input.jenjang,
      alamat: input.alamat ?? null,
      namaKepala: input.namaKepala ?? null,
      logoUrl: input.logoUrl || null,
    })
    .where(eq(satuanPendidikan.id, tenantId));
}

/** Update Pengaturan + Preferensi Cetak columns (same isolation gate as above). */
export async function updatePengaturanSatuanPendidikan(
  db: Db | Tx,
  tenantId: string,
  input: PengaturanSatuanPendidikanInput,
): Promise<void> {
  await db
    .update(satuanPendidikan)
    .set({
      tahunAjaranAktif: input.tahunAjaran,
      semesterAktif: input.semester,
      zonaWaktu: input.zonaWaktu,
      cetakPaperSize: input.cetakPaperSize,
      cetakTampilkanLogo: input.cetakTampilkanLogo,
      cetakTampilkanHeader: input.cetakTampilkanHeader,
    })
    .where(eq(satuanPendidikan.id, tenantId));
}
