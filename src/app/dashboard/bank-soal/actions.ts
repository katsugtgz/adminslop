"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Bank Soal page (T6) may hide a button for a `wali_kelas`
// client, but a determined client can construct a `fetch` + `FormData` and POST
// it directly to this action. That POST MUST still throw — the action is the
// boundary, not the UI. The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY
// from `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered
// `tenantId` field in formData is deliberately NEVER read. Tenant scoping
// happens via `withTenant(db, orgId, ...)` which sets the RLS session GUC
// `app.tenant_id`, so every repo lookup is already scoped to the active
// tenant — a cross-tenant id simply resolves to "not found" (a deny).
//
// OWNERSHIP MODEL: Bank Soal (Butir Soal + Paket Soal) is a SCHOOL-WIDE shared
// resource — any guru with `bank_soal:buat`/`:ubah` may create/edit any Butir
// or Paket in the tenant. No gate-2 ownership check is applied (unlike Beban
// Mengajar / Rombongan Belajar which are PTK-owned). RLS + the role gate are
// the boundary.
//
// AC#2 (AI provenance + verification gate): `buatButirSoalAction` passes
// `drafAiId` through to the repo, which REJECTS any non-null value whose
// draf_ai.status_verifikasi is not 'disetujui'. Unverified AI content cannot
// become canonical — the throw propagates to the client as a Bahasa error.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import {
  arsipkanButirSoal,
  buatButirSoal,
  buatPaketSoal,
  hapusButirDariPaket,
  tambahButirKePaket,
  ubahButirSoal,
} from "@/db/queries/bank-soal";
import type { JenisButirSoal } from "@/db/queries/bank-soal";
import { requireAksesAktif } from "@/lib/auth/akses-saya";
import { KepemilikanError } from "@/lib/auth/kepemilikan";
import { trimField } from "@/lib/form/parser";

const REVALIDATE_TARGET = "/dashboard/bank-soal";

/** Closed vocabulary of valid JenisButirSoal literals (mirrors schema CHECK). */
const JENIS_BUTIR = ["pg", "essay", "isian", "jodohkan", "benar_salah"] as const;

/** True iff `v` is one of the JenisButirSoal literals. */
function isValidJenis(v: string): v is JenisButirSoal {
  return (JENIS_BUTIR as readonly string[]).includes(v);
}

export interface HasilImpor {
  readonly ok: boolean;
  readonly tersimpan: number;
  readonly gagal: number;
  readonly errors: readonly string[];
}

interface KandidatImporButir {
  readonly nomor: number;
  readonly mataPelajaranId: string;
  readonly tingkatId: string | null;
  readonly jenis: JenisButirSoal;
  readonly pertanyaan: string;
  readonly pilihan: unknown;
  readonly kunciJawaban: string;
  readonly pembahasan: string | null;
}

function ambilString(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parse the `pilihan` JSON field (BUGS-05). A malformed payload used to throw a
 * raw `SyntaxError` whose message ("Unexpected token...") leaks parser internals
 * and reads as an English stack trace to a Bahasa user. This wraps the parse in
 * a try/catch and re-throws a plain Bahasa validation error so the action layer
 * surfaces a consistent, localized message — mirroring the JSON guard already
 * present in `imporButirSoalJsonAction`.
 */
function parsePilihan(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Format pilihan tidak valid (wajib JSON yang valid).");
  }
}

function validasiKandidatImpor(
  item: unknown,
  index: number
): { kandidat: KandidatImporButir | null; errors: string[] } {
  const label = `Butir ${index + 1}`;
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return { kandidat: null, errors: [`${label}: objek JSON tidak valid.`] };
  }

  const row = item as Record<string, unknown>;
  const errors: string[] = [];
  const mataPelajaranId = ambilString(row, "mataPelajaranId");
  if (!mataPelajaranId) errors.push(`${label}: mataPelajaranId wajib diisi.`);

  const jenisRaw = ambilString(row, "jenis");
  if (!isValidJenis(jenisRaw)) {
    errors.push(`${label}: jenis Butir Soal tidak valid.`);
  }

  const pertanyaan = ambilString(row, "pertanyaan");
  if (!pertanyaan) errors.push(`${label}: pertanyaan wajib diisi.`);

  const kunciJawaban = ambilString(row, "kunciJawaban");
  if (!kunciJawaban) errors.push(`${label}: kunciJawaban wajib diisi.`);

  if (errors.length > 0 || !isValidJenis(jenisRaw)) {
    return { kandidat: null, errors };
  }

  const tingkatIdRaw = row.tingkatId;
  const tingkatId =
    typeof tingkatIdRaw === "string" && tingkatIdRaw.trim()
      ? tingkatIdRaw.trim()
      : null;
  const pembahasanRaw = row.pembahasan;
  const pembahasan =
    typeof pembahasanRaw === "string" && pembahasanRaw.trim()
      ? pembahasanRaw.trim()
      : null;

  return {
    kandidat: {
      nomor: index + 1,
      mataPelajaranId,
      tingkatId,
      jenis: jenisRaw,
      pertanyaan,
      pilihan: row.pilihan ?? null,
      kunciJawaban,
      pembahasan,
    },
    errors: [],
  };
}

// 1. buatButirSoalAction -----------------------------------------------------

/**
 * Create a Butir Soal (question item). Requires `bank_soal:buat`. AC#2: when
 * `drafAiId` is provided, the repo verifies the referenced draft is
 * 'disetujui' — unverified AI content cannot become canonical (the repo
 * throws, propagating to the client as a Bahasa error).
 */
export async function buatButirSoalAction(formData: FormData): Promise<void> {
  const akses = await requireAksesAktif(
    "bank_soal:buat",
    "Anda tidak memiliki izin untuk Bank Soal."
  );

  const mataPelajaranId = trimField(formData, "mataPelajaranId");
  if (!mataPelajaranId) throw new Error("Mata Pelajaran wajib diisi.");
  const tingkatIdRaw = trimField(formData, "tingkatId");
  const tingkatId = tingkatIdRaw || null;
  const jenisRaw = trimField(formData, "jenis");
  if (!isValidJenis(jenisRaw)) {
    throw new Error("Jenis Butir Soal tidak valid.");
  }
  const jenis: JenisButirSoal = jenisRaw;
  const pertanyaan = trimField(formData, "pertanyaan");
  if (!pertanyaan) throw new Error("Pertanyaan wajib diisi.");
  const kunciJawaban = trimField(formData, "kunciJawaban");
  if (!kunciJawaban) throw new Error("Kunci Jawaban wajib diisi.");
  const pembahasanRaw = trimField(formData, "pembahasan");
  const pembahasan = pembahasanRaw || null;
  const pilihanRaw = trimField(formData, "pilihan");
  const pilihan = pilihanRaw ? parsePilihan(pilihanRaw) : null;
  const drafAiIdRaw = trimField(formData, "drafAiId");
  const drafAiId = drafAiIdRaw || null;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const butir = await buatButirSoal(tx, {
      mataPelajaranId,
      tingkatId,
      jenis,
      pertanyaan,
      pilihan,
      kunciJawaban,
      pembahasan,
      drafAiId,
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_butir_soal",
      target: `butir_soal:${butir.id}`,
      beban: { mataPelajaranId, jenis, drafAiId },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 2. ubahButirSoalAction -----------------------------------------------------

/**
 * Update a Butir Soal. Requires `bank_soal:ubah`. Only provided fields are
 * written. RLS scopes the update — a cross-tenant id throws "tidak
 * ditemukan".
 */
export async function ubahButirSoalAction(formData: FormData): Promise<void> {
  const akses = await requireAksesAktif(
    "bank_soal:ubah",
    "Anda tidak memiliki izin untuk Bank Soal."
  );

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID Butir Soal wajib diisi.");

  const perubahan: Record<string, unknown> = {};
  const mataPelajaranId = trimField(formData, "mataPelajaranId");
  if (mataPelajaranId) perubahan.mataPelajaranId = mataPelajaranId;
  const tingkatIdRaw = trimField(formData, "tingkatId");
  if (formData.has("tingkatId")) perubahan.tingkatId = tingkatIdRaw || null;
  const jenisRaw = trimField(formData, "jenis");
  if (jenisRaw) {
    if (!isValidJenis(jenisRaw)) {
      throw new Error("Jenis Butir Soal tidak valid.");
    }
    perubahan.jenis = jenisRaw;
  }
  const pertanyaan = trimField(formData, "pertanyaan");
  if (pertanyaan) perubahan.pertanyaan = pertanyaan;
  const kunciJawaban = trimField(formData, "kunciJawaban");
  if (kunciJawaban) perubahan.kunciJawaban = kunciJawaban;
  const pembahasanRaw = trimField(formData, "pembahasan");
  if (formData.has("pembahasan"))
    perubahan.pembahasan = pembahasanRaw || null;
  const pilihanRaw = trimField(formData, "pilihan");
  if (pilihanRaw) perubahan.pilihan = parsePilihan(pilihanRaw);

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const butir = await ubahButirSoal(tx, id, perubahan);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "ubah_butir_soal",
      target: `butir_soal:${butir.id}`,
      beban: perubahan,
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. arsipkanButirSoalAction -------------------------------------------------

/**
 * Archive a Butir Soal (soft-delete: status aktif -> arsip). Requires
 * `bank_soal:ubah`. RLS scopes the update — a cross-tenant id throws.
 */
export async function arsipkanButirSoalAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "bank_soal:ubah",
    "Anda tidak memiliki izin untuk Bank Soal."
  );

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID Butir Soal wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await arsipkanButirSoal(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "arsipkan_butir_soal",
      target: `butir_soal:${id}`,
      beban: { id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 4. buatPaketSoalAction -----------------------------------------------------

/**
 * Create a Paket Soal (assembled package). Requires `paket_soal:buat`. Tied
 * to a Tahun Ajaran (required) + optional semester + optional Tingkat.
 */
export async function buatPaketSoalAction(formData: FormData): Promise<void> {
  const akses = await requireAksesAktif(
    "paket_soal:buat",
    "Anda tidak memiliki izin untuk Paket Soal."
  );

  const nama = trimField(formData, "nama");
  if (!nama) throw new Error("Nama Paket wajib diisi.");
  const mataPelajaranId = trimField(formData, "mataPelajaranId");
  if (!mataPelajaranId) throw new Error("Mata Pelajaran wajib diisi.");
  const tahunAjaranId = trimField(formData, "tahunAjaranId");
  if (!tahunAjaranId) throw new Error("Tahun Ajaran wajib diisi.");
  const tingkatIdRaw = trimField(formData, "tingkatId");
  const tingkatId = tingkatIdRaw || null;
  const semesterRaw = trimField(formData, "semester");
  const semester = semesterRaw || null;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const paket = await buatPaketSoal(tx, {
      nama,
      mataPelajaranId,
      tingkatId,
      tahunAjaranId,
      semester,
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_paket_soal",
      target: `paket_soal:${paket.id}`,
      beban: { nama, mataPelajaranId, tahunAjaranId, semester },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 5. tambahButirKePaketAction ------------------------------------------------

/**
 * Add a Butir to a Paket at `urutan` with optional `bobot`. Requires
 * `paket_soal:ubah`. UNIQUE (tenant, paket, butir) is enforced by the schema.
 */
export async function tambahButirKePaketAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "paket_soal:ubah",
    "Anda tidak memiliki izin untuk Paket Soal."
  );

  const paketSoalId = trimField(formData, "paketSoalId");
  if (!paketSoalId) throw new Error("ID Paket Soal wajib diisi.");
  const butirSoalId = trimField(formData, "butirSoalId");
  if (!butirSoalId) throw new Error("ID Butir Soal wajib diisi.");
  const urutanRaw = trimField(formData, "urutan");
  if (!urutanRaw) throw new Error("Urutan wajib diisi.");
  const urutan = Number(urutanRaw);
  if (Number.isNaN(urutan)) throw new Error("Urutan harus berupa angka.");
  const bobotRaw = trimField(formData, "bobot");
  const bobot = bobotRaw || undefined;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const junction = await tambahButirKePaket(tx, {
      paketSoalId,
      butirSoalId,
      urutan,
      bobot,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "tambah_butir_ke_paket",
      target: `paket_soal_butir:${junction.id}`,
      beban: { paketSoalId, butirSoalId, urutan, bobot },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 6. hapusButirDariPaketAction -----------------------------------------------

/**
 * Remove a Butir from a Paket. Requires `paket_soal:ubah`. RLS scopes the
 * delete — a cross-tenant pair is a silent no-op.
 */
export async function hapusButirDariPaketAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "paket_soal:ubah",
    "Anda tidak memiliki izin untuk Paket Soal."
  );

  const paketSoalId = trimField(formData, "paketSoalId");
  if (!paketSoalId) throw new Error("ID Paket Soal wajib diisi.");
  const butirSoalId = trimField(formData, "butirSoalId");
  if (!butirSoalId) throw new Error("ID Butir Soal wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await hapusButirDariPaket(tx, paketSoalId, butirSoalId);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "hapus_butir_dari_paket",
      target: `paket_soal:${paketSoalId}`,
      beban: { paketSoalId, butirSoalId },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

export async function imporButirSoalJsonAction(
  _prevState: HasilImpor | null,
  formData: FormData
): Promise<HasilImpor> {
  const akses = await requireAksesAktif(
    "bank_soal:buat",
    "Anda tidak memiliki izin untuk Bank Soal."
  );

  const jsonText = trimField(formData, "jsonButir");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "format tidak dikenal";
    return {
      ok: false,
      tersimpan: 0,
      gagal: 0,
      errors: [`JSON tidak valid: ${detail}`],
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      ok: false,
      tersimpan: 0,
      gagal: 0,
      errors: ["JSON harus berupa array butir soal."],
    };
  }

  const errors: string[] = [];
  const kandidat: KandidatImporButir[] = [];
  for (const [index, item] of parsed.entries()) {
    const hasil = validasiKandidatImpor(item, index);
    errors.push(...hasil.errors);
    if (hasil.kandidat) kandidat.push(hasil.kandidat);
  }

  let tersimpan = 0;
  let gagal = parsed.length - kandidat.length;
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // BUGS-02: previously `Promise.all(kandidat.map(...))` over a single tx
    // client. That was structurally unsound — pg serializes queries on one
    // connection, and a failed insert aborts the surrounding transaction
    // (Postgres "current transaction is aborted" state). Every subsequent
    // insert then failed and the final COMMIT became ROLLBACK, yet the action
    // reported tersimpan:N>0. The sequential loop below processes items in
    // order, and each item runs inside its own Drizzle nested transaction
    // (SAVEPOINT sp_n ... RELEASE sp_n). A bad row rolls back ONLY that row's
    // insert+audit without poisoning the surrounding transaction, so partial
    // success is HONEST: tersimpan reflects rows that actually committed.
    for (const item of kandidat) {
      try {
        await tx.transaction(async (sp) => {
          const butir = await buatButirSoal(sp, {
            mataPelajaranId: item.mataPelajaranId,
            tingkatId: item.tingkatId,
            jenis: item.jenis,
            pertanyaan: item.pertanyaan,
            pilihan: item.pilihan,
            kunciJawaban: item.kunciJawaban,
            pembahasan: item.pembahasan,
            dibuatOleh: akses.userId,
          });
          await catatAudit(sp, {
            aktor: akses.userId,
            aksi: "impor-ai-eksternal",
            target: `butir_soal:${butir.id}`,
            beban: {
              provenance: `eksternal-pengguna:${akses.userId}:${item.jenis}:${new Date().toISOString()}`,
            },
          });
        });
        tersimpan += 1;
      } catch (error) {
        gagal += 1;
        // SEC-02: never surface raw DB internals (constraint names, column
        // identifiers, stack traces) to the client. KepemilikanError messages
        // are intentional user-facing ownership denials — preserve them
        // verbatim (mirrors src/app/api/sinkronisasi/route.ts:336-345). Any
        // other failure collapses to a generic Bahasa message; the real error
        // is logged server-side for operator triage.
        if (error instanceof KepemilikanError) {
          errors.push(`Butir ${item.nomor}: ${error.message}`);
        } else {
          console.error(
            `[imporButirSoalJsonAction] Butir ${item.nomor} gagal disimpan`,
            error
          );
          errors.push(`Butir ${item.nomor}: gagal disimpan.`);
        }
      }
    }
  });

  if (tersimpan > 0) revalidatePath(REVALIDATE_TARGET);
  return { ok: tersimpan > 0, tersimpan, gagal, errors };
}
