"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Perangkat Ajar page (T6) may hide a button for a `wali_kelas`
// client, but a determined client can construct a `fetch` + `FormData` and POST
// it directly to this action. That POST MUST still throw — the action is the
// boundary, not the UI. The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY from
// `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered `tenantId`
// field in formData is deliberately NEVER read. Tenant scoping happens via
// `withTenant(db, orgId, ...)` which sets the RLS session GUC `app.tenant_id`,
// so every repo lookup is already scoped to the active tenant — a cross-tenant
// id simply resolves to "not found" (a deny).
//
// OWNERSHIP MODEL: Perangkat Ajar is a SCHOOL-WIDE shared resource — any guru
// with `perangkat_ajar:buat`/`:ubah` may create/edit any Perangkat Ajar in the
// tenant. No gate-2 ownership check is applied (unlike Beban Mengajar /
// Rombongan Belajar which are PTK-owned). RLS + the role gate are the boundary.
//
// PERANGKAT AJAR LIFECYCLE (AC#1–5 of issue #17):
//   AC#1 — documents are created per `jenis` (modul_ajar|rpp|silabus|prota|
//          promes); jenis is fixed at creation (a CHECK discriminator).
//   AC#2 — references kurikulum via `mataPelajaranId` (GLOBAL, RESTRICT).
//   AC#3 — AI-assisted docs: when `drafAiId` is supplied the repo sets
//          status_dokumen_ai='menunggu' (NOT resmi until verified).
//          `verifikasiDokumenAiAction` is the gate (menunggu->disetujui|
//          ditolak). Unverified dokumen AI cannot be an official doc.
//   AC#4 — jenis drives type-specific slices; invalid jenis is rejected.
//   AC#5 — tests prove the authz boundary (see actions.test.ts).

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import {
  buatPerangkatAjar,
  cariPerangkatAjarById,
  ubahPerangkatAjar,
  verifikasiDokumenAi,
} from "@/db/queries/perangkat-ajar";
import type {
  JenisPerangkatAjar,
  KeputusanVerifikasi,
  Semester,
} from "@/db/queries/perangkat-ajar";
import { getSemesterAktif, getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import { requireAksesAktif } from "@/lib/auth/akses-saya";
import { trimField } from "@/lib/form/parser";

const REVALIDATE_TARGET = "/dashboard/perangkat-ajar";

/** Closed vocabulary of valid JenisPerangkatAjar literals (mirrors schema CHECK). */
const JENIS_PERANGKAT_AJAR = ["modul_ajar", "rpp", "silabus", "prota", "promes"] as const;

/** True iff `v` is one of the JenisPerangkatAjar literals (AC#4 validation). */
function isValidJenis(v: string): v is JenisPerangkatAjar {
  return (JENIS_PERANGKAT_AJAR as readonly string[]).includes(v);
}

/** Parse an optional JSON-object string from formData into a record (no zod). */
function parseKonten(raw: string): Record<string, unknown> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Konten harus berupa JSON yang valid.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Konten harus berupa objek JSON.");
  }
  return parsed as Record<string, unknown>;
}

// 1. buatPerangkatAjarAction ------------------------------------------------

/**
 * Create a Perangkat Ajar. Requires `perangkat_ajar:buat`. Resolves the active
 * Tahun Ajaran + Semester SERVER-SIDE (never from formData — §13). AC#3: when
 * `drafAiId` is supplied the repo sets status_dokumen_ai='menunggu' (AI-assisted
 * — NOT resmi until verified). AC#4: `jenis` must be a valid literal.
 *
 * Validation: `jenis` (required, valid literal); `mataPelajaranId` (required);
 * `judul` (required, non-empty); `konten` (optional JSON object, default `{}`);
 * `drafAiId` / `tingkatId` (optional). All errors are Bahasa Indonesia.
 */
export async function buatPerangkatAjarAction(
  formData: FormData
): Promise<void> {
  // 1. Resolve + authorize (SERVER-SIDE — this is the boundary, NOT the UI).
  const akses = await requireAksesAktif(
    "perangkat_ajar:buat",
    "Anda tidak memiliki izin untuk membuat Perangkat Ajar."
  );

  // 2. Manual validation (no zod).
  const jenisRaw = trimField(formData, "jenis");
  if (!isValidJenis(jenisRaw)) {
    throw new Error("Jenis Perangkat Ajar tidak valid.");
  }
  const jenis: JenisPerangkatAjar = jenisRaw;

  const mataPelajaranId = trimField(formData, "mataPelajaranId");
  if (!mataPelajaranId) {
    throw new Error("Mata Pelajaran wajib dipilih.");
  }

  const judul = trimField(formData, "judul");
  if (!judul) throw new Error("Judul wajib diisi.");

  const konten = parseKonten(trimField(formData, "konten"));

  const drafAiIdRaw = trimField(formData, "drafAiId");
  const drafAiId = drafAiIdRaw || null;

  const tingkatIdRaw = trimField(formData, "tingkatId");
  const tingkatId = tingkatIdRaw || null;

  // 3. Execute under tenant scope. orgId from membership ONLY. The active
  //    Tahun Ajaran + Semester are resolved server-side (never from formData).
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const ta = await getTahunAjaranAktif(tx);
    if (!ta) throw new Error("Tahun Ajaran aktif belum diatur.");
    const semesterAktif = await getSemesterAktif(tx);
    if (!semesterAktif) throw new Error("Semester aktif belum diatur.");
    const semester: Semester = semesterAktif;

    const perangkat = await buatPerangkatAjar(tx, {
      jenis,
      mataPelajaranId,
      tingkatId,
      tahunAjaranId: ta.id,
      semester,
      judul,
      konten,
      drafAiId,
      dibuatOleh: akses.userId,
    });

    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_perangkat_ajar",
      target: `perangkat_ajar:${perangkat.id}`,
      beban: { jenis, judul, statusDokumenAi: perangkat.statusDokumenAi },
    });
  });

  // 4. Revalidate.
  revalidatePath(REVALIDATE_TARGET);
}

// 2. ubahPerangkatAjarAction ------------------------------------------------

/**
 * Update a Perangkat Ajar by id. Requires `perangkat_ajar:ubah`. Only mutable
 * fields (judul/konten/mataPelajaranId/tingkatId) are written — `jenis` is fixed
 * at creation (AC#1) and the verification gate owns `statusDokumenAi`. RLS
 * scopes the update to the active tenant; a cross-tenant id is a silent no-op
 * that surfaces as a throw ("tidak ditemukan").
 */
export async function ubahPerangkatAjarAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "perangkat_ajar:ubah",
    "Anda tidak memiliki izin untuk mengubah Perangkat Ajar."
  );

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID Perangkat Ajar wajib diisi.");

  // Partial update: empty/absent fields -> undefined (skip, don't null-out).
  // judul is required at CREATE; here an explicit non-empty value updates it.
  const judulRaw = trimField(formData, "judul");
  const judul = judulRaw === "" ? undefined : judulRaw;

  const kontenRaw = trimField(formData, "konten");
  const konten = kontenRaw === "" ? undefined : parseKonten(kontenRaw);

  const mataPelajaranIdRaw = trimField(formData, "mataPelajaranId");
  const mataPelajaranId = mataPelajaranIdRaw || undefined;

  const tingkatIdRaw = trimField(formData, "tingkatId");
  const tingkatId = tingkatIdRaw || undefined;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const perangkat = await ubahPerangkatAjar(tx, id, {
      judul,
      konten,
      mataPelajaranId,
      tingkatId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "ubah_perangkat_ajar",
      target: `perangkat_ajar:${perangkat.id}`,
      beban: { judul, mataPelajaranId, tingkatId },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. verifikasiDokumenAiAction ----------------------------------------------

/**
 * Verify the AI-assisted content of a Perangkat Ajar — the AC#3 gate. Requires
 * `perangkat_ajar:ubah`. Transitions status_dokumen_ai menunggu -> disetujui |
 * ditolak. Only AI-assisted docs (status='menunggu') can be verified; the repo
 * is idempotent (a second verdict throws) and rejects non-AI docs (NULL status).
 * PROOF (AC#3): until this runs, an AI-assisted doc is NOT resmi — unverified
 * dokumen AI cannot be used as an official document.
 */
export async function verifikasiDokumenAiAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "perangkat_ajar:ubah",
    "Anda tidak memiliki izin untuk verifikasi Dokumen AI."
  );

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID Perangkat Ajar wajib diisi.");
  const keputusanRaw = trimField(formData, "keputusan");
  if (keputusanRaw !== "disetujui" && keputusanRaw !== "ditolak") {
    throw new Error("Keputusan verifikasi tidak valid.");
  }
  const keputusan: KeputusanVerifikasi = keputusanRaw;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // Load first so a missing/cross-tenant id throws with a clear message
    // before the repo's verify (defense in depth — the repo re-checks too).
    const perangkat = await cariPerangkatAjarById(tx, id);
    if (!perangkat) {
      throw new Error("Perangkat Ajar tidak ditemukan.");
    }
    const hasil = await verifikasiDokumenAi(tx, id, keputusan);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "verifikasi_dokumen_ai",
      target: `perangkat_ajar:${hasil.id}`,
      beban: { keputusan, statusDokumenAi: hasil.statusDokumenAi },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
