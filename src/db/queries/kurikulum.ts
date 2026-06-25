/**
 * Data-access layer over the 6 GLOBAL Kurikulum reference tables (ADR 0001):
 * kurikulum, mata_pelajaran, fase, capaian_pembelajaran,
 * tujuan_pembelajaran, alur_tujuan_pembelajaran.
 *
 * Pure READ-ONLY repository — no writes (app_user has SELECT ONLY on these
 * tables; writes happen exclusively via reviewed migrations run by the
 * migrator superuser). Composed by T6 UI layers for the progressive
 * drill-down: kurikulum → mata_pelajaran → fase → CP → TP → ATP.
 *
 * NO `withTenant`, NO `tenant_id` — these tables are universal national
 * curriculum data, exempt from tenant-scoping (ADR 0001). Direct queries.
 */
import { and, eq } from "drizzle-orm";

import type { Db, Tx } from "../client";
import {
  alurTujuanPembelajaran,
  capaianPembelajaran,
  fase,
  kurikulum,
  mataPelajaran,
  tujuanPembelajaran,
} from "../schema";
import type {
  AlurTujuanPembelajaran,
  CapaianPembelajaran,
  Fase,
  Kurikulum,
  MataPelajaran,
  TujuanPembelajaran,
} from "../schema";

// Kurikulum --------------------------------------------------------------

/**
 * List all kurikulum, optionally filtered by `statusPersetujuan`. Ordered by
 * `nama`. Pass `opts.status` to narrow to one approval state
 * (`memerlukan_tinjauan` | `disetujui` | `ditolak`).
 */
export async function listKurikulum(
  db: Db | Tx,
  opts?: { readonly status?: string }
): Promise<Kurikulum[]> {
  return db
    .select()
    .from(kurikulum)
    .where(
      and(
        opts?.status ? eq(kurikulum.statusPersetujuan, opts.status) : undefined
      )
    )
    .orderBy(kurikulum.nama);
}

// Drill-down: kurikulum → mata_pelajaran ---------------------------------

/**
 * List the DISTINCT mata_pelajaran that have at least one capaian_pembelajaran
 * for the given kurikulum (the drill-down: which subjects exist for this
 * curriculum?). Inner-joins capaian_pembelajaran on mata_pelajaran_id and
 * deduplicates. Ordered by `mp.nama`.
 */
export async function listMataPelajaranByKurikulum(
  db: Db | Tx,
  kurikulumId: string
): Promise<MataPelajaran[]> {
  return db
    .selectDistinct({
      id: mataPelajaran.id,
      kode: mataPelajaran.kode,
      nama: mataPelajaran.nama,
    })
    .from(mataPelajaran)
    .innerJoin(
      capaianPembelajaran,
      eq(capaianPembelajaran.mataPelajaranId, mataPelajaran.id)
    )
    .where(eq(capaianPembelajaran.kurikulumId, kurikulumId))
    .orderBy(mataPelajaran.nama);
}

// Drill-down: kurikulum + mata_pelajaran → fase --------------------------

/**
 * List the DISTINCT fase that have at least one capaian_pembelajaran for the
 * given (kurikulum, mata_pelajaran) pair (the drill-down: which phases exist
 * for this subject under this curriculum?). Inner-joins capaian_pembelajaran
 * on fase_id and deduplicates. Ordered by `f.kode`.
 */
export async function listFaseByKurikulumDanMapel(
  db: Db | Tx,
  kurikulumId: string,
  mapelId: string
): Promise<Fase[]> {
  return db
    .selectDistinct({
      id: fase.id,
      kode: fase.kode,
      nama: fase.nama,
      rentangKelas: fase.rentangKelas,
      jenjang: fase.jenjang,
    })
    .from(fase)
    .innerJoin(
      capaianPembelajaran,
      eq(capaianPembelajaran.faseId, fase.id)
    )
    .where(
      and(
        eq(capaianPembelajaran.kurikulumId, kurikulumId),
        eq(capaianPembelajaran.mataPelajaranId, mapelId)
      )
    )
    .orderBy(fase.kode);
}

// Capaian Pembelajaran ---------------------------------------------------

/**
 * List capaian_pembelajaran for a kurikulum, optionally narrowed by
 * mata_pelajaran and/or fase (the drill-down keeps narrowing). `kurikulumId`
 * is required; `mapelId` and `faseId` are optional progressive filters.
 * Ordered by `kode`.
 */
export async function listCapaianPembelajaran(
  db: Db | Tx,
  opts: {
    readonly kurikulumId: string;
    readonly mapelId?: string;
    readonly faseId?: string;
  }
): Promise<CapaianPembelajaran[]> {
  return db
    .select()
    .from(capaianPembelajaran)
    .where(
      and(
        eq(capaianPembelajaran.kurikulumId, opts.kurikulumId),
        opts.mapelId
          ? eq(capaianPembelajaran.mataPelajaranId, opts.mapelId)
          : undefined,
        opts.faseId ? eq(capaianPembelajaran.faseId, opts.faseId) : undefined
      )
    )
    .orderBy(capaianPembelajaran.kode);
}

// Drill-down: CP → TP ----------------------------------------------------

/**
 * List tujuan_pembelajaran for a given capaian_pembelajaran. Ordered by
 * `urutan` ASC.
 */
export async function listTujuanPembelajaranByCP(
  db: Db | Tx,
  capaianPembelajaranId: string
): Promise<TujuanPembelajaran[]> {
  return db
    .select()
    .from(tujuanPembelajaran)
    .where(
      eq(tujuanPembelajaran.capaianPembelajaranId, capaianPembelajaranId)
    )
    .orderBy(tujuanPembelajaran.urutan);
}

// Drill-down: TP → ATP ---------------------------------------------------

/**
 * List alur_tujuan_pembelajaran for a given tujuan_pembelajaran. Ordered by
 * `urutan` ASC.
 */
export async function listAlurTujuanPembelajaranByTP(
  db: Db | Tx,
  tujuanPembelajaranId: string
): Promise<AlurTujuanPembelajaran[]> {
  return db
    .select()
    .from(alurTujuanPembelajaran)
    .where(
      eq(
        alurTujuanPembelajaran.tujuanPembelajaranId,
        tujuanPembelajaranId
      )
    )
    .orderBy(alurTujuanPembelajaran.urutan);
}
