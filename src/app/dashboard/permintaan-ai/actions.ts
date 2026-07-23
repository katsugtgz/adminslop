"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Permintaan AI page (T6) may hide a button for a `wali_kelas`
// client, but a determined client can construct a `fetch` + `FormData` and POST
// it directly to this action. That POST MUST still throw — the action is the
// boundary, not the UI. The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY from
// `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered `tenantId`
// field in formData is deliberately NEVER read. Tenant scoping happens via
// `withTenant(db, orgId, ...)` which sets the RLS session GUC `app.tenant_id`,
// so every repo lookup (TA aktif, semester, kuota, permintaan, draf) is already
// scoped to the active tenant — a cross-tenant id simply resolves to "not
// found" (a deny).
//
// AI LIFECYCLE (AC#1–5 of issue #12):
//   AC#1 — the `status` state machine is visible: dibuat -> diproses -> selesai
//          (or gagal / dibatalkan). This action stamps each transition.
//   AC#2 — every draf_ai carries `provenance` (model + timestamp) so AI output
//          is traceable, never anonymous. See `jalankanMockAi`.
//   AC#3 — verification gate: AI content is NOT final by default. New drafts
//          start at status_verifikasi='menunggu'; only `disetujui` is usable
//          downstream. `verifikasiDrafAiAction` is the gate.
//   AC#4 — retry (NEW row linked via permintaanTerkaitId), cancel, and
//          idempotent verification (the repo refuses a second verdict).
//   AC#5 — kuota budget: kuota `tersisa` is checked BEFORE any processing and
//          `tambahPemakaianKuota` increments within the same transaction.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import type { Tx } from "@/db/client";
import { buatDrafAi, verifikasiDrafAi } from "@/db/queries/draf-ai";
import type { StatusVerifikasi } from "@/db/queries/draf-ai";
import {
  getAtauBuatKuotaAi,
  tambahPemakaianKuota,
} from "@/db/queries/kuota-ai";
import {
  batalkanPermintaanAi,
  buatPermintaanAi,
  cariPermintaanAiById,
  ubahStatusPermintaanAi,
} from "@/db/queries/permintaan-ai";
import type { JenisPermintaanAi, StatusPermintaanAi } from "@/db/queries/permintaan-ai";
import { getSemesterAktif, getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import { requireAksesAktif } from "@/lib/auth/akses-saya";
import { assertPemilikPermintaan } from "@/lib/auth/kepemilikan";
import { optionalString, requiredString, trimField } from "@/lib/form/parser";

const REVALIDATE_TARGET = "/dashboard/permintaan-ai";

/** Closed vocabulary of valid JenisPermintaanAi literals (mirrors schema CHECK). */
const JENIS_PERMINTAAN_AI = ["deskripsi_cp", "deskripsi_tp", "deskripsi_atp", "narasi_raport"] as const;

/** True iff `v` is one of the JenisPermintaanAi literals. */
function isValidJenis(v: string): v is JenisPermintaanAi {
  return (JENIS_PERMINTAAN_AI as readonly string[]).includes(v);
}

/**
 * MOCK AI (MVP). There is NO real LLM call here — this generates deterministic
 * placeholder content. This is deliberate: what we are validating in this wave
 * is the verification-gate architecture (AC#3) + provenance (AC#2) + the state
 * machine (AC#1), NOT AI quality. Provenance is still recorded so even mock
 * output is traceable (`mock-model-v1@<ISO ts>`). Real provider integration is
 * deferred to a later wave.
 */
function jalankanMockAi(jenis: JenisPermintaanAi): {
  konten: string;
  provenance: string;
} {
  return {
    konten: `[AI-GENERATED: jenis ${jenis}]`,
    provenance: `mock-model-v1@${new Date().toISOString()}`,
  };
}

/**
 * Shared "process a freshly-created permintaan" core for `buatPermintaanAiAction`
 * and `retryPermintaanAiAction` (AC#4: retry processes identically). Runs INSIDE
 * the caller's `withTenant` transaction so the kuota check + increment + state
 * transitions + draft insert are atomic (AC#5 budget correctness).
 *
 * Order matters and is load-bearing:
 *   1. resolve Tahun Ajaran aktif + Semester aktif (both required)
 *   2. AC#5 — read kuota `tersisa`; reject BEFORE processing when <= 0
 *   3. AC#1 — insert permintaan_ai (status='dibuat'), then diproses, then selesai
 *   4. AC#5 — increment terpakai (only after the gate passed)
 *   5. AC#2 — run mock AI + store draf with provenance (status_verifikasi='menunggu')
 *   6. catatAudit
 */
async function prosesPermintaanAi(
  tx: Tx,
  userId: string,
  jenis: JenisPermintaanAi,
  konteks: Record<string, unknown>,
  permintaanTerkaitId: string | null,
  aksiAudit: "buat_permintaan_ai" | "retry_permintaan_ai"
): Promise<void> {
  // 1. Active period resolution (tenant-scoped via the surrounding withTenant).
  const ta = await getTahunAjaranAktif(tx);
  if (!ta) throw new Error("Tahun Ajaran aktif belum diatur.");
  const semester = await getSemesterAktif(tx);
  if (!semester) throw new Error("Semester aktif belum diatur.");

  // 2. AC#5 budget gate — fast-path early reject. This pre-read is only a
  //    hint to avoid processing when the budget is already obviously spent;
  //    the AUTHORITATIVE gate is the atomic `terpakai < batas` predicate
  //    inside tambahPemakaianKuota (step 4), which eliminates the TOCTOU race
  //    between this read and the increment under concurrent calls.
  const kuota = await getAtauBuatKuotaAi(tx, ta.id, semester);
  if (kuota.tersisa <= 0) {
    throw new Error("Kuota AI untuk semester ini habis.");
  }

  // 3. AC#1 state machine: dibuat -> diproses -> selesai.
  // react-doctor-disable-next-line async-parallel: AC#1 state machine + AC#5 budget: each step depends on prior completing, react-doctor/async-parallel
  const permintaan = await buatPermintaanAi(tx, {
    jenis,
    konteks,
    dibuatOleh: userId,
    permintaanTerkaitId,
  });

  // 4. AC#5 increment (only after the gate above passed).
  await tambahPemakaianKuota(tx, ta.id, semester);
  await ubahStatusPermintaanAi(tx, permintaan.id, "diproses");

  // 5. AC#2 provenance + AC#3 menunggu draft (not final by default).
  const { konten, provenance } = jalankanMockAi(jenis);
  // react-doctor-disable-next-line async-parallel: AC#1 state machine: draft creation follows diproses transition, react-doctor/async-parallel
  await buatDrafAi(tx, {
    permintaanAiId: permintaan.id,
    konten,
    provenance,
  });
  await ubahStatusPermintaanAi(tx, permintaan.id, "selesai");

  // 6. Audit. Retry beban carries the linkage so the chain is traceable.
  await catatAudit(tx, {
    aktor: userId,
    aksi: aksiAudit,
    target: `permintaan_ai:${permintaan.id}`,
    beban: permintaanTerkaitId
      ? { permintaanTerkaitId, jenis, status: "selesai" as const }
      : { jenis, status: "selesai" as const },
  });
}

// 1. buatPermintaanAiAction --------------------------------------------------

/**
 * Create + synchronously process a permintaan_ai (mock AI) in one transaction.
 * Requires `permintaan_ai:buat`. Resolves the active Tahun Ajaran + Semester,
 * enforces the AC#5 kuota gate, runs the state machine dibuat -> diproses ->
 * selesai, stores a menunggu draf with provenance (AC#2/AC#3), and audits.
 *
 * Validation: `jenis` (required, must be a valid literal); `konteks` (optional
 * JSON object string, default `{}`). All errors are Bahasa Indonesia.
 */
export async function buatPermintaanAiAction(formData: FormData): Promise<void> {
  // 1. Resolve + authorize (SERVER-SIDE — this is the boundary, NOT the UI).
  const akses = await requireAksesAktif(
    "permintaan_ai:buat",
    "Anda tidak memiliki izin untuk Permintaan AI."
  );

  // 2. Manual validation (no zod).
  const jenisRaw = trimField(formData, "jenis");
  if (!isValidJenis(jenisRaw)) {
    throw new Error("Jenis Permintaan AI tidak valid.");
  }
  const jenis: JenisPermintaanAi = jenisRaw;

  const konteksRaw = optionalString(formData, "konteks");
  let konteks: Record<string, unknown> = {};
  if (konteksRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(konteksRaw);
    } catch {
      throw new Error("Konteks harus berupa JSON yang valid.");
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Konteks harus berupa objek JSON.");
    }
    konteks = parsed as Record<string, unknown>;
  }

  // 3. Process under tenant scope + audit. orgId from membership ONLY.
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await prosesPermintaanAi(
      tx,
      akses.userId,
      jenis,
      konteks,
      null,
      "buat_permintaan_ai"
    );
  });

  // 4. Revalidate.
  revalidatePath(REVALIDATE_TARGET);
}

// 2. batalkanPermintaanAiAction ---------------------------------------------

/**
 * Cancel a permintaan_ai by id. Requires `permintaan_ai:buat`. Only a request
 * still in `dibuat` or `diproses` may be cancelled — a terminal state
 * (`selesai` / `gagal` / `dibatalkan`) cannot. The repo stamps `selesaiPada`.
 * A retry is a separate new permintaan, not a resurrection of this row.
 */
export async function batalkanPermintaanAiAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "permintaan_ai:buat",
    "Anda tidak memiliki izin untuk Permintaan AI."
  );

  const id = requiredString(formData, "id", "ID Permintaan AI wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const permintaan = await cariPermintaanAiById(tx, id);
    if (!permintaan) {
      throw new Error("Permintaan AI tidak ditemukan.");
    }
    await assertPemilikPermintaan(tx, akses, () => Promise.resolve(permintaan.dibuatOleh));
    const status: StatusPermintaanAi = permintaan.status as StatusPermintaanAi;
    if (status !== "dibuat" && status !== "diproses") {
      throw new Error("Permintaan AI tidak dapat dibatalkan.");
    }
    await batalkanPermintaanAi(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "batalkan_permintaan_ai",
      target: `permintaan_ai:${id}`,
      beban: { id, status },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. verifikasiDrafAiAction -------------------------------------------------

/**
 * Verify a draf_ai — the AC#3 gate. Requires `draf_ai:verifikasi`. AI content
 * is NOT final until this runs: `menunggu` -> `disetujui` | `ditolak`. The repo
 * is idempotent: a second verdict on an already-verified draft THROWS (cannot
 * re-verify) rather than silently rewriting the verdict/approver. A missing /
 * cross-tenant draft id also throws (RLS hides it).
 */
export async function verifikasiDrafAiAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "draf_ai:verifikasi",
    "Anda tidak memiliki izin untuk verifikasi Draf AI."
  );

  const drafId = requiredString(formData, "drafId", "ID Draf AI wajib diisi.");
  const statusRaw = trimField(formData, "status");
  if (statusRaw !== "disetujui" && statusRaw !== "ditolak") {
    throw new Error("Status verifikasi tidak valid.");
  }
  const status: StatusVerifikasi = statusRaw;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await verifikasiDrafAi(tx, drafId, status, akses.userId);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "verifikasi_draf_ai",
      target: `draf_ai:${drafId}`,
      beban: { status },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 4. retryPermintaanAiAction ------------------------------------------------

/**
 * Retry a prior permintaan_ai (AC#4). Requires `permintaan_ai:buat`. Loads the
 * original request, then creates a NEW permintaan_ai carrying
 * `permintaanTerkaitId = original.id` with the same jenis + konteks, and
 * processes it identically to `buatPermintaanAiAction` (kuota gate, state
 * machine, provenance, menunggu draft). The retry consumes a fresh kuota unit.
 */
export async function retryPermintaanAiAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "permintaan_ai:buat",
    "Anda tidak memiliki izin untuk Permintaan AI."
  );

  const id = requiredString(formData, "id", "ID Permintaan AI wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const original = await cariPermintaanAiById(tx, id);
    if (!original) {
      throw new Error("Permintaan AI tidak ditemukan.");
    }
    await assertPemilikPermintaan(tx, akses, () => Promise.resolve(original.dibuatOleh));
    // Both columns are CHECK-constrained text/jsonb; narrowing to the typed
    // unions is sound (the DB guarantees the literal vocabulary).
    await prosesPermintaanAi(
      tx,
      akses.userId,
      original.jenis as JenisPermintaanAi,
      original.konteks as Record<string, unknown>,
      original.id,
      "retry_permintaan_ai"
    );
  });

  revalidatePath(REVALIDATE_TARGET);
}
