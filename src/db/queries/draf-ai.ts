/**
 * Data-access layer over the draf_ai table (AI output + verification gate).
 * Pure repository functions — no authz logic, no validation, no audit. Composed
 * by the action layer (T6).
 *
 * §13 isolation invariant: every query runs inside
 * `withTenant(db, tenantId, tx => fn(tx, ...))`. RLS scopes all rows to the
 * tenant set in the session GUC `app.tenant_id`. `tenant_id` is NEVER passed
 * as a function argument — it always defaults from the GUC.
 *
 * AC#2 PROVENANCE: `provenance` records model + prompt_hash + timestamp so AI
 * output is traceable, never anonymous. The repo passes the string through
 * verbatim — the action layer is responsible for constructing it.
 *
 * AC#3 VERIFICATION GATE: `statusVerifikasi` flows menunggu -> disetujui |
 * ditolak. New drafts start at 'menunggu' (schema default) — AI content is
 * NOT final by default. Only `disetujui` may be used downstream as a Dokumen
 * AI. `verifikasiDrafAi` is idempotent — once a terminal state is reached, a
 * second call throws rather than silently re-writing the verdict/approver.
 *
 * 1:1 (permintaan -> draf): the schema UNIQUE on `permintaanAiId` enforces one
 * draft per request. `buatDrafAi` therefore naturally de-dupes within a
 * transaction; the action layer catches the constraint violation to convert a
 * duplicate insert into a 409/idempotent retry.
 */
import { and, eq, inArray } from "drizzle-orm";

import type { Db, Tx } from "../client";
import { drafAi } from "../schema";
import type { DrafAi } from "../schema";

/** Mirrors the schema CHECK constraint on `draf_ai.status_verifikasi`. */
export type StatusVerifikasi = "menunggu" | "disetujui" | "ditolak";

/**
 * Input for `buatDrafAi`. `permintaanAiId` links the draft to its 1:1
 * permintaan (schema UNIQUE). `konten` is the AI-generated text (placeholder /
 * mock in MVP). `provenance` (AC#2) records model + prompt_hash + timestamp so
 * output is traceable.
 */
export interface InputBuatDrafAi {
  readonly permintaanAiId: string;
  readonly konten: string;
  readonly provenance: string;
}

/**
 * Create a draf_ai with `statusVerifikasi='menunggu'` (schema default — AC#3:
 * not final by default). Runs inside `withTenant` so `tenant_id` defaults from
 * the GUC. The schema UNIQUE on `permintaanAiId` makes a duplicate insert for
 * the same permintaan reject at the DB level (1:1 idempotency).
 */
export async function buatDrafAi(
  db: Db | Tx,
  input: InputBuatDrafAi
): Promise<DrafAi> {
  const [row] = await db
    .insert(drafAi)
    .values({
      permintaanAiId: input.permintaanAiId,
      konten: input.konten,
      provenance: input.provenance,
    })
    .returning();
  return row;
}

/**
 * 1:1 lookup: the (at most one) draf_ai for a permintaan, within the current
 * tenant (RLS-scoped). Returns null when absent — including when the
 * permintaan exists only in another tenant (RLS hides both rows).
 */
export async function cariDrafAiByPermintaan(
  db: Db | Tx,
  permintaanAiId: string
): Promise<DrafAi | null> {
  const rows = await db
    .select()
    .from(drafAi)
    .where(eq(drafAi.permintaanAiId, permintaanAiId));
  return rows[0] ?? null;
}

/**
 * Batch 1:1 lookup (PERF-02): resolves every draf_ai for the given permintaan
 * ids in a SINGLE query (replaces N serial `cariDrafAiByPermintaan` calls — the
 * N+1 `Promise.all` loop over a `selesai` permintaan list). RLS-scoped to the
 * current tenant. Returns a `Map<permintaanAiId, DrafAi>`; absent ids (and
 * cross-tenant ids hidden by RLS) are simply absent from the map.
 *
 * Empty input short-circuits to an empty map without hitting the DB (avoids
 * `inArray([])` which Drizzle expands to a always-false predicate).
 */
export async function cariDrafAiByPermintaanBatch(
  db: Db | Tx,
  permintaanAiIds: readonly string[]
): Promise<Map<string, DrafAi>> {
  const out = new Map<string, DrafAi>();
  if (permintaanAiIds.length === 0) return out;
  const rows = await db
    .select()
    .from(drafAi)
    .where(inArray(drafAi.permintaanAiId, permintaanAiIds));
  for (const row of rows) {
    out.set(row.permintaanAiId, row);
  }
  return out;
}

/**
 * AC#3 verification gate. Transitions `statusVerifikasi` out of 'menunggu' to
 * 'disetujui' | 'ditolak', stamps `diverifikasiPada` and records the approver
 * userId. Idempotent: once the row has left 'menunggu' a second call throws
 * (cannot re-verify) rather than silently rewriting the verdict. Also throws
 * when the row is absent (RLS cross-tenant or missing id) — a silent no-op
 * would mask failure for the action layer.
 *
 * BUGS-04 (race safety): the UPDATE is conditioned on
 * `status_verifikasi = 'menunggu'` (not just `id`). The pre-check SELECT is
 * kept for a clear not-found message, but a concurrent transaction that
 * verifies the same row between the SELECT and the UPDATE can no longer
 * silently overwrite the verdict: the conditional UPDATE matches 0 rows and
 * this function throws "sudah diverifikasi". Without the WHERE clause the
 * UPDATE would unconditionally rewrite `diverifikasi_oleh`/`diverifikasi_pada`
 * for an already-terminal row — a lost-ververity bug under concurrency.
 */
export async function verifikasiDrafAi(
  db: Db | Tx,
  id: string,
  status: StatusVerifikasi,
  diverifikasiOleh: string
): Promise<DrafAi> {
  const existing = await db
    .select()
    .from(drafAi)
    .where(eq(drafAi.id, id));
  if (existing.length === 0) {
    throw new Error("Draf AI tidak ditemukan");
  }
  if (existing[0].statusVerifikasi !== "menunggu") {
    throw new Error("Draf AI sudah diverifikasi");
  }

  // BUGS-04: condition the UPDATE on status_verifikasi='menunggu' so a
  // concurrent verify between the SELECT above and this UPDATE cannot silently
  // overwrite the verdict/approver. 0 rows returned by `.returning()` => a
  // concurrent verifier won the race (the row left 'menunggu') — throw the same
  // idempotency error the pre-check would have thrown.
  const rows = await db
    .update(drafAi)
    .set({
      statusVerifikasi: status,
      diverifikasiOleh,
      diverifikasiPada: new Date(),
    })
    .where(and(eq(drafAi.id, id), eq(drafAi.statusVerifikasi, "menunggu")))
    .returning();
  if (rows.length === 0) {
    throw new Error("Draf AI sudah diverifikasi");
  }
  return rows[0];
}
