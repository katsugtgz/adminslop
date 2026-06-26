/**
 * Data-access layer over the GLOBAL `mata_pelajaran` reference table (ADR 0001).
 *
 * NO `withTenant`, NO `tenant_id` — mata_pelajaran is universal national
 * curriculum data, exempt from tenant-scoping (SELECT-only for app_user;
 * writes happen exclusively via reviewed migrations). Composed by the T6
 * Beban Mengajar UI to populate the Mata Pelajaran select on the admin form
 * and to resolve display names for guru context enrichment.
 */
import { asc } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { mataPelajaran } from "../schema";
import type { MataPelajaran } from "../schema";

/**
 * List every mata_pelajaran row (GLOBAL — universal across all Satuan
 * Pendidikan), ordered by `nama` ascending for stable alphabetical display.
 * Used by the Beban Mengajar admin form select + name resolution.
 */
export async function listMataPelajaran(
  db: Db | Tx
): Promise<MataPelajaran[]> {
  return db.select().from(mataPelajaran).orderBy(asc(mataPelajaran.nama));
}
