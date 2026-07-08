/**
 * Data-access layer over the draf_eraport + revisi_eraport tables (E-Raport
 * document lifecycle: Draf -> Terbit -> Revisi). Pure repository functions —
 * no authz logic, no validation, no audit. Composed by the action layer (T6).
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#1 (draf from Nilai Akhir): the action layer builds the `konten` snapshot
 * from `getNilaiAkhir` and passes it here; the repo stores it verbatim.
 *
 * AC#2 (terbit protected): `terbitkanEraport` refuses a second terbit — a row
 * already in 'terbit' THROWS rather than silently re-stamping. A missing /
 * cross-tenant id also throws (RLS hides it).
 *
 * AC#3 (revisi accountability): `catatRevisi` is ATOMIC — it appends a new
 * `revisi_eraport` row (alasan + konten_perubahan) AND flips the parent
 * `draf_eraport.status` to 'revisi' within the caller's transaction. A revisi
 * NEVER rewrites prior revision rows (append-only). `listRevisiByEraport`
 * returns the history newest-first.
 *
 * AC#4 (unverified AI rejected): `buatDrafEraport` validates, when `drafAiId`
 * is provided, that the linked `draf_ai.status_verifikasi='disetujui'`. A
 * menunggu/ditolak draft (or a missing/cross-tenant id) throws — AI content is
 * NOT usable downstream until verified. The lookup reads `drafAi` directly via
 * the schema (the draf-ai repo is read-only here); RLS scopes it to the tenant.
 */
import { and, desc, eq, inArray } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { drafAi, drafEraport, revisiEraport } from "../schema";
import type { DrafEraport, RevisiEraport } from "../schema";

/** Mirrors the schema CHECK constraint on `draf_eraport.status`. */
export type StatusEraport = "draf" | "terbit" | "revisi";

/** Mirrors the schema CHECK constraint on `draf_eraport.semester`. */
export type SemesterEraport = "ganjil" | "genap";

/**
 * Input for `buatDrafEraport`. `konten` is the jsonb snapshot built by the
 * action layer from `getNilaiAkhir` (AC#1). `drafAiId` (AC#4) optionally links
 * a verified Draf AI; the repo rejects menunggu/ditolak. `dibuatOleh` is the
 * aktor userId.
 */
export interface InputBuatDrafEraport {
  readonly pesertaDidikId: string;
  readonly tahunAjaranId: string;
  readonly semester: SemesterEraport;
  readonly konten: Record<string, unknown>;
  readonly drafAiId?: string | null;
  readonly catatan?: string | null;
  readonly dibuatOleh?: string | null;
}

/**
 * Optional filters for `listDrafEraport`. Every field is independently
 * optional; only the supplied fields constrain the result. All omitted ->
 * return every draf_eraport row visible under the current tenant, newest first.
 */
export interface OpsiListDrafEraport {
  readonly status?: StatusEraport;
  readonly pesertaDidikId?: string;
  readonly tahunAjaranId?: string;
  readonly semester?: SemesterEraport;
  readonly limit?: number;
}

/** Input for `catatRevisi`. `alasan` is required (AC#3 accountability). */
export interface InputCatatRevisi {
  readonly alasan: string;
  readonly kontenPerubahan?: Record<string, unknown> | null;
  readonly dibuatOleh?: string | null;
}

// CRUD + lifecycle ------------------------------------------------------------

/**
 * AC#4 verification lookup: read the linked draf_ai's status_verifikasi
 * directly via the schema. Returns null when absent (including cross-tenant —
 * RLS hides both rows). Scoped to the current tenant via the surrounding
 * `withTenant`.
 */
async function getStatusVerifikasiDrafAi(
  db: Db | Tx,
  drafAiId: string
): Promise<"menunggu" | "disetujui" | "ditolak" | null> {
  const rows = await db
    .select({ statusVerifikasi: drafAi.statusVerifikasi })
    .from(drafAi)
    .where(eq(drafAi.id, drafAiId));
  return (rows[0]?.statusVerifikasi as
    | "menunggu"
    | "disetujui"
    | "ditolak"
    | null) ?? null;
}

/**
 * Create a draf_eraport with `status='draf'` (schema default). Runs inside
 * `withTenant` so `tenant_id` defaults from the GUC.
 *
 * AC#4: when `drafAiId` is provided, the linked draf_ai MUST have
 * `status_verifikasi='disetujui'`. A menunggu/ditolak draft (or a missing id)
 * throws — AI content is NOT usable downstream until verified.
 */
export async function buatDrafEraport(
  db: Db | Tx,
  input: InputBuatDrafEraport
): Promise<DrafEraport> {
  if (input.drafAiId) {
    const status = await getStatusVerifikasiDrafAi(db, input.drafAiId);
    if (status !== "disetujui") {
      throw new Error(
        "Konten AI belum diverifikasi tidak dapat digunakan."
      );
    }
  }

  const [row] = await db
    .insert(drafEraport)
    .values({
      pesertaDidikId: input.pesertaDidikId,
      tahunAjaranId: input.tahunAjaranId,
      semester: input.semester,
      konten: input.konten,
      drafAiId: input.drafAiId ?? null,
      catatan: input.catatan ?? null,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .returning();
  return row;
}

/**
 * Find a draf_eraport by id within the current tenant (RLS-scoped). Returns
 * null when absent (including when the id exists only in another tenant).
 */
export async function getDrafEraportById(
  db: Db | Tx,
  id: string
): Promise<DrafEraport | null> {
  const rows = await db
    .select()
    .from(drafEraport)
    .where(eq(drafEraport.id, id));
  return rows[0] ?? null;
}

/**
 * List draf_eraport rows under the current tenant (RLS-scoped), newest first
 * (`dibuatPada` DESC). Optional filters narrow the result independently; only
 * the supplied fields constrain the query.
 */
export async function listDrafEraport(
  db: Db | Tx,
  opts?: OpsiListDrafEraport
): Promise<DrafEraport[]> {
  const filters = [];
  if (opts?.status) filters.push(eq(drafEraport.status, opts.status));
  if (opts?.pesertaDidikId)
    filters.push(eq(drafEraport.pesertaDidikId, opts.pesertaDidikId));
  if (opts?.tahunAjaranId)
    filters.push(eq(drafEraport.tahunAjaranId, opts.tahunAjaranId));
  if (opts?.semester) filters.push(eq(drafEraport.semester, opts.semester));

  return db
    .select()
    .from(drafEraport)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(drafEraport.dibuatPada))
    .limit(opts?.limit ?? 500);
}

/**
 * AC#2: transition a draf_eraport to 'terbit'. Stamps `diterbitkanPada=now()`.
 * Idempotent refusal: a row already in 'terbit' THROWS (no silent re-stamp /
 * overwrite). A missing / cross-tenant id also throws — a silent no-op would
 * mask failure for the action layer.
 */
export async function terbitkanEraport(
  db: Db | Tx,
  id: string
): Promise<DrafEraport> {
  const existing = await db
    .select()
    .from(drafEraport)
    .where(eq(drafEraport.id, id));
  if (existing.length === 0) {
    throw new Error("Draf E-Raport tidak ditemukan");
  }
  if (existing[0].status === "terbit") {
    throw new Error("E-Raport sudah diterbitkan");
  }

  const [row] = await db
    .update(drafEraport)
    .set({ status: "terbit", diterbitkanPada: new Date() })
    .where(eq(drafEraport.id, id))
    .returning();
  return row;
}

/**
 * AC#3: atomically append a revision record AND flip the parent status to
 * 'revisi'. Runs in the caller's `withTenant` transaction so the two writes
 * are all-or-nothing. The revision row is APPEND-ONLY — this function never
 * updates or deletes prior revision rows. `alasan` is required (the human-
 * readable reason for the change, for accountability). Returns the new
 * revision row. Throws when the parent is absent (RLS cross-tenant or missing
 * id) — step 1's existence check enforces that.
 */
export async function catatRevisi(
  db: Db | Tx,
  eraportId: string,
  input: InputCatatRevisi
): Promise<RevisiEraport> {
  // 1. Existence check (RLS-scoped): a missing / cross-tenant parent throws.
  const existing = await db
    .select({ id: drafEraport.id })
    .from(drafEraport)
    .where(eq(drafEraport.id, eraportId));
  if (existing.length === 0) {
    throw new Error("Draf E-Raport tidak ditemukan");
  }

  // 2. Append the revision row (NEVER update/delete prior rows).
  const [revisi] = await db
    .insert(revisiEraport)
    .values({
      eraportId,
      alasan: input.alasan,
      kontenPerubahan: input.kontenPerubahan ?? null,
      dibuatOleh: input.dibuatOleh ?? null,
    })
    .returning();

  // 3. Flip the parent status to 'revisi' (atomic with step 2 via the tx).
  await db
    .update(drafEraport)
    .set({ status: "revisi" })
    .where(eq(drafEraport.id, eraportId));

  return revisi;
}

/**
 * List the append-only revision history for a draf_eraport (RLS-scoped),
 * newest first (`dibuatPada` DESC). Returns `[]` when the eraport has no
 * revisions yet, or when the eraport id is absent / cross-tenant (RLS hides
 * both the parent and its revisions).
 */
export async function listRevisiByEraport(
  db: Db | Tx,
  eraportId: string,
  limit: number = 500
): Promise<RevisiEraport[]> {
  return db
    .select()
    .from(revisiEraport)
    .where(eq(revisiEraport.eraportId, eraportId))
    .orderBy(desc(revisiEraport.dibuatPada))
    .limit(limit);
}

/**
 * Batch variant of {@linkcode listRevisiByEraport}: fetches the revision
 * history for MANY eraport ids in a SINGLE query (uses `inArray`), then groups
 * the rows into a `Map<eraportId, RevisiEraport[]>` (each list newest-first,
 * capped at `limit` per eraport). Replaces the N+1 `Promise.all` fan-out the
 * page used to run one `listRevisiByEraport` per eraport.
 *
 * RLS scopes every row to the current tenant. `eraportId`s absent from the
 * result map simply have no revisions (or are cross-tenant / missing — RLS
 * hides both). An empty `eraportIds` input short-circuits to an empty Map
 * (no query issued), avoiding an `IN ()` syntax error.
 */
export async function listRevisiByEraportBatch(
  db: Db | Tx,
  eraportIds: readonly string[],
  limit: number = 500
): Promise<Map<string, RevisiEraport[]>> {
  if (eraportIds.length === 0) return new Map();

  const rows = await db
    .select()
    .from(revisiEraport)
    .where(inArray(revisiEraport.eraportId, [...eraportIds]))
    .orderBy(desc(revisiEraport.dibuatPada))
    .limit(limit);

  const grouped = new Map<string, RevisiEraport[]>();
  for (const row of rows) {
    const list = grouped.get(row.eraportId);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.eraportId, [row]);
    }
  }
  return grouped;
}
