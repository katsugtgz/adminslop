"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The E-Raport page may hide a button for a `wali_kelas` client,
// but a determined client can construct a `fetch` + `FormData` and POST it
// directly to this action. That POST MUST still throw — the action is the
// boundary, not the UI. The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY from
// `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered `tenantId`
// field in formData is deliberately NEVER read. Tenant scoping happens via
// `withTenant(db, orgId, ...)` which sets the RLS session GUC `app.tenant_id`,
// so every repo lookup (TA aktif, semester, eraport, draf_ai) is already
// scoped to the active tenant — a cross-tenant id simply resolves to "not
// found" (a deny).
//
// E-RAPORT LIFECYCLE (AC#1–5 of issue #13):
//   AC#1 — a Draf E-Raport is built FROM Nilai Akhir (#11). The action resolves
//          the active Tahun Ajaran + Semester server-side and fetches the Nilai
//          Akhir derivation to build the konten snapshot.
//   AC#2 — terbit is protected. `terbitkanEraportAction` delegates to the repo,
//          which refuses a second terbit (idempotent throw).
//   AC#3 — revisi carries accountability. `catatRevisiEraportAction` requires
//          an `alasan` and appends an auditable revisi_eraport row (the repo
//          atomically flips the parent status to 'revisi').
//   AC#4 — unverified AI is rejected. If `drafAiId` is supplied, the repo
//          validates the linked draf_ai.status_verifikasi='disetujui' (a
//          menunggu/ditolak draft throws — AI content is NOT usable until
//          verified). Proof test in describe block "AC#4: unverified AI
//          rejected".
//   AC#5 — tests cover guru create success, wali deny, terbit (already-terbit
//          throws), revisi, and validation.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import { getNilaiAkhir } from "@/db/queries/nilai-peserta-didik";
import {
  buatDrafEraport,
  catatRevisi,
  getDrafEraportById,
  terbitkanEraport,
} from "@/db/queries/eraport";
import type { SemesterEraport } from "@/db/queries/eraport";
import { getSemesterAktif, getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import { requireAksesAktif } from "@/lib/auth/akses-saya";
import { assertPemilikBeban } from "@/lib/auth/kepemilikan";
import { trimField } from "@/lib/form/parser";

const REVALIDATE_TARGET = "/dashboard/eraport";

// 1. buatDrafEraportAction --------------------------------------------------

/**
 * Create a Draf E-Raport from Nilai Akhir (AC#1). Requires `eraport:buat`.
 * Resolves the active Tahun Ajaran + Semester SERVER-SIDE (never from formData),
 * fetches `getNilaiAkhir` for the konten snapshot, and optionally links a
 * verified Draf AI (AC#4 — the repo rejects menunggu/ditolak).
 *
 * formData: `pesertaDidikId` (required), optional `bebanMengajarId` (scopes the
 * Nilai Akhir derivation), optional `drafAiId` (AC#4 link), optional `catatan`.
 */
export async function buatDrafEraportAction(formData: FormData): Promise<void> {
  // 1. Resolve + authorize (SERVER-SIDE — this is the boundary, NOT the UI).
  const akses = await requireAksesAktif(
    "eraport:buat",
    "Anda tidak memiliki izin untuk membuat Draf E-Raport."
  );

  // 2. Manual validation (no zod).
  const pesertaDidikId = trimField(formData, "pesertaDidikId");
  if (!pesertaDidikId) {
    throw new Error("Peserta Didik wajib dipilih.");
  }
  const bebanMengajarIdRaw = trimField(formData, "bebanMengajarId");
  const drafAiIdRaw = trimField(formData, "drafAiId");
  const catatanRaw = trimField(formData, "catatan");

  // 3. Resolve period + build konten under tenant scope. orgId from membership
  //    ONLY. AC#4 validation (draf_ai disetujui) runs inside buatDrafEraport.
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const ta = await getTahunAjaranAktif(tx);
    if (!ta) throw new Error("Tahun Ajaran aktif belum diatur.");
    const semesterAktif = await getSemesterAktif(tx);
    if (!semesterAktif) throw new Error("Semester aktif belum diatur.");
    const semester: SemesterEraport = semesterAktif;

    // AC#1: build the konten snapshot from Nilai Akhir. When a beban is
    // supplied, derive the entry for this peserta_didik; otherwise the konten
    // carries only the period + student context (the guru enriches it later).
    let konten: Record<string, unknown> = {
      sumber: "nilai_akhir",
      tahunAjaranId: ta.id,
      semester,
      pesertaDidikId,
    };
    if (bebanMengajarIdRaw) {
      await assertPemilikBeban(tx, akses, async () => bebanMengajarIdRaw);
      const semua = await getNilaiAkhir(tx, bebanMengajarIdRaw);
      const milikSiswa = semua.find((n) => n.pesertaDidikId === pesertaDidikId);
      if (milikSiswa) {
        konten = {
          ...konten,
          bebanMengajarId: bebanMengajarIdRaw,
          nilaiAkhir: milikSiswa.nilaiAkhir,
          rincian: milikSiswa.rincian,
        };
      }
    }

    const eraport = await buatDrafEraport(tx, {
      pesertaDidikId,
      tahunAjaranId: ta.id,
      semester,
      konten,
      drafAiId: drafAiIdRaw || null,
      catatan: catatanRaw || null,
      dibuatOleh: akses.userId,
    });

    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_draf_eraport",
      target: `draf_eraport:${eraport.id}`,
      beban: { pesertaDidikId, tahunAjaranId: ta.id, semester },
    });
  });

  // 4. Revalidate.
  revalidatePath(REVALIDATE_TARGET);
}

// 2. terbitkanEraportAction ------------------------------------------------

/**
 * Publish (terbit) a Draf E-Raport — the AC#2 protected transition. Requires
 * `eraport:terbit`. Delegates to the repo, which stamps `diterbitkanPada` and
 * refuses a second terbit (idempotent throw). A missing / cross-tenant id also
 * throws (RLS hides it).
 */
export async function terbitkanEraportAction(formData: FormData): Promise<void> {
  const akses = await requireAksesAktif(
    "eraport:terbit",
    "Anda tidak memiliki izin untuk menerbitkan E-Raport."
  );

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID E-Raport wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const eraport = await terbitkanEraport(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "terbit_eraport",
      target: `draf_eraport:${eraport.id}`,
      beban: { id, status: eraport.status },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. catatRevisiEraportAction ----------------------------------------------

/**
 * Record a revision (AC#3 accountability). Requires `eraport:revisi`. Appends a
 * new revisi_eraport row carrying the required `alasan` (+ optional
 * `kontenPerubahan` JSON), and the repo atomically flips the parent status to
 * 'revisi'. A revisi NEVER rewrites prior revision rows (append-only).
 */
export async function catatRevisiEraportAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "eraport:revisi",
    "Anda tidak memiliki izin untuk mencatat revisi E-Raport."
  );

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID E-Raport wajib diisi.");
  const alasan = trimField(formData, "alasan");
  if (!alasan) throw new Error("Alasan Revisi wajib diisi.");

  let kontenPerubahan: Record<string, unknown> | null = null;
  const kontenPerubahanRaw = trimField(formData, "kontenPerubahan");
  if (kontenPerubahanRaw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(kontenPerubahanRaw);
    } catch {
      throw new Error("Konten Perubahan harus berupa JSON yang valid.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Konten Perubahan harus berupa objek JSON.");
    }
    kontenPerubahan = parsed as Record<string, unknown>;
  }

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // Existence check (RLS-scoped) for a clearer error before catatRevisi.
    const existing = await getDrafEraportById(tx, id);
    if (!existing) {
      throw new Error("Draf E-Raport tidak ditemukan.");
    }
    const revisi = await catatRevisi(tx, id, {
      alasan,
      kontenPerubahan,
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "revisi_eraport",
      target: `draf_eraport:${id}`,
      beban: { revisiId: revisi.id, alasan },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
