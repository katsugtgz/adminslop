/**
 * Data-access layer over the mutasi_peserta_didik table (student transfer
 * records). Pure repository functions — no authz logic, no validation, no
 * audit. Composed by the action layer (T6).
 *
 * COMPOSITION BOUNDARY: this repo is intentionally narrow — mutasi-table CRUD
 * only. It does NOT call `ubahStatus` from peserta-didik.ts. The atomic
 * composition (`tambahMutasi` + `ubahStatus('pindah')` in one `withTenant` tx)
 * happens in the ACTION layer (T6). Keeping this repo independent of
 * peserta-didik.ts enables parallel Wave 2 development of the three repos.
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 */
import { desc, eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { mutasiPesertaDidik } from "../schema";
import type { MutasiPesertaDidik } from "../schema";

/** Direction of a student transfer: `masuk` (in) or `keluar` (out). */
export type ArahMutasi = "masuk" | "keluar";

/**
 * Input for `tambahMutasi`. `tanggal` is an ISO date string (`YYYY-MM-DD`).
 * All optional fields default to `null` when omitted.
 */
export interface InputMutasi {
  readonly pesertaDidikId: string;
  readonly arah: ArahMutasi;
  readonly asalSekolah?: string;
  readonly tujuanSekolah?: string;
  readonly tanggal: string;
  readonly alasan?: string;
  readonly dibuatOleh?: string;
}

/**
 * Record a student transfer. Runs inside `withTenant` so `tenant_id` defaults
 * from the GUC. Returns the inserted row with all fields populated.
 */
export async function tambahMutasi(
  db: Db | Tx,
  input: InputMutasi
): Promise<MutasiPesertaDidik> {
  const [row] = await db
    .insert(mutasiPesertaDidik)
    .values({
      pesertaDidikId: input.pesertaDidikId,
      arah: input.arah,
      asalSekolah: input.asalSekolah ?? null,
      tujuanSekolah: input.tujuanSekolah ?? null,
      tanggal: input.tanggal,
      alasan: input.alasan ?? null,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .returning();
  return row;
}

/**
 * List transfer records visible under the current tenant (RLS-scoped). When
 * `pesertaDidikId` is provided, returns only that student's transfers;
 * otherwise returns all transfers in the tenant. Ordered by `tanggal` DESC
 * then `dibuat_pada` DESC (most recent first).
 */
export async function listMutasi(
  db: Db | Tx,
  pesertaDidikId?: string
): Promise<MutasiPesertaDidik[]> {
  return db
    .select()
    .from(mutasiPesertaDidik)
    .where(
      pesertaDidikId !== undefined
        ? eq(mutasiPesertaDidik.pesertaDidikId, pesertaDidikId)
        : undefined
    )
    .orderBy(
      desc(mutasiPesertaDidik.tanggal),
      desc(mutasiPesertaDidik.dibuatPada)
    );
}

/**
 * Delete a transfer record by id. RLS scopes to the current tenant — a
 * cross-tenant delete is a silent no-op (zero rows affected), mirroring
 * `hapusPtk` in akses.ts.
 */
export async function hapusMutasi(db: Db | Tx, id: string): Promise<void> {
  await db.delete(mutasiPesertaDidik).where(eq(mutasiPesertaDidik.id, id));
}
