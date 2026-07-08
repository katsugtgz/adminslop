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
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { requireAuth } from "@/lib/auth/server";

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
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("bank_soal:buat").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Bank Soal.");
  }

  const mataPelajaranId = String(formData.get("mataPelajaranId") ?? "").trim();
  if (!mataPelajaranId) throw new Error("Mata Pelajaran wajib diisi.");
  const tingkatIdRaw = String(formData.get("tingkatId") ?? "").trim();
  const tingkatId = tingkatIdRaw || null;
  const jenisRaw = String(formData.get("jenis") ?? "").trim();
  if (!isValidJenis(jenisRaw)) {
    throw new Error("Jenis Butir Soal tidak valid.");
  }
  const jenis: JenisButirSoal = jenisRaw;
  const pertanyaan = String(formData.get("pertanyaan") ?? "").trim();
  if (!pertanyaan) throw new Error("Pertanyaan wajib diisi.");
  const kunciJawaban = String(formData.get("kunciJawaban") ?? "").trim();
  if (!kunciJawaban) throw new Error("Kunci Jawaban wajib diisi.");
  const pembahasanRaw = String(formData.get("pembahasan") ?? "").trim();
  const pembahasan = pembahasanRaw || null;
  const pilihanRaw = String(formData.get("pilihan") ?? "").trim();
  const pilihan = pilihanRaw
    ? JSON.parse(pilihanRaw) as unknown
    : null;
  const drafAiIdRaw = String(formData.get("drafAiId") ?? "").trim();
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
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("bank_soal:ubah").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Bank Soal.");
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("ID Butir Soal wajib diisi.");

  const perubahan: Record<string, unknown> = {};
  const mataPelajaranId = String(formData.get("mataPelajaranId") ?? "").trim();
  if (mataPelajaranId) perubahan.mataPelajaranId = mataPelajaranId;
  const tingkatIdRaw = String(formData.get("tingkatId") ?? "").trim();
  if (formData.has("tingkatId")) perubahan.tingkatId = tingkatIdRaw || null;
  const jenisRaw = String(formData.get("jenis") ?? "").trim();
  if (jenisRaw) {
    if (!isValidJenis(jenisRaw)) {
      throw new Error("Jenis Butir Soal tidak valid.");
    }
    perubahan.jenis = jenisRaw;
  }
  const pertanyaan = String(formData.get("pertanyaan") ?? "").trim();
  if (pertanyaan) perubahan.pertanyaan = pertanyaan;
  const kunciJawaban = String(formData.get("kunciJawaban") ?? "").trim();
  if (kunciJawaban) perubahan.kunciJawaban = kunciJawaban;
  const pembahasanRaw = String(formData.get("pembahasan") ?? "").trim();
  if (formData.has("pembahasan"))
    perubahan.pembahasan = pembahasanRaw || null;
  const pilihanRaw = String(formData.get("pilihan") ?? "").trim();
  if (pilihanRaw) perubahan.pilihan = JSON.parse(pilihanRaw) as unknown;

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
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("bank_soal:ubah").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Bank Soal.");
  }

  const id = String(formData.get("id") ?? "").trim();
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
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("paket_soal:buat").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Paket Soal.");
  }

  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) throw new Error("Nama Paket wajib diisi.");
  const mataPelajaranId = String(formData.get("mataPelajaranId") ?? "").trim();
  if (!mataPelajaranId) throw new Error("Mata Pelajaran wajib diisi.");
  const tahunAjaranId = String(formData.get("tahunAjaranId") ?? "").trim();
  if (!tahunAjaranId) throw new Error("Tahun Ajaran wajib diisi.");
  const tingkatIdRaw = String(formData.get("tingkatId") ?? "").trim();
  const tingkatId = tingkatIdRaw || null;
  const semesterRaw = String(formData.get("semester") ?? "").trim();
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
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("paket_soal:ubah").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Paket Soal.");
  }

  const paketSoalId = String(formData.get("paketSoalId") ?? "").trim();
  if (!paketSoalId) throw new Error("ID Paket Soal wajib diisi.");
  const butirSoalId = String(formData.get("butirSoalId") ?? "").trim();
  if (!butirSoalId) throw new Error("ID Butir Soal wajib diisi.");
  const urutanRaw = String(formData.get("urutan") ?? "").trim();
  if (!urutanRaw) throw new Error("Urutan wajib diisi.");
  const urutan = Number(urutanRaw);
  if (Number.isNaN(urutan)) throw new Error("Urutan harus berupa angka.");
  const bobotRaw = String(formData.get("bobot") ?? "").trim();
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
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("paket_soal:ubah").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Paket Soal.");
  }

  const paketSoalId = String(formData.get("paketSoalId") ?? "").trim();
  if (!paketSoalId) throw new Error("ID Paket Soal wajib diisi.");
  const butirSoalId = String(formData.get("butirSoalId") ?? "").trim();
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
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("bank_soal:buat").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Bank Soal.");
  }

  const jsonText = String(formData.get("jsonButir") ?? "").trim();
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
    const hasilSimpan = await Promise.all(
      kandidat.map(async (item) => {
        try {
          const butir = await buatButirSoal(tx, {
            mataPelajaranId: item.mataPelajaranId,
            tingkatId: item.tingkatId,
            jenis: item.jenis,
            pertanyaan: item.pertanyaan,
            pilihan: item.pilihan,
            kunciJawaban: item.kunciJawaban,
            pembahasan: item.pembahasan,
            dibuatOleh: akses.userId,
          });
          await catatAudit(tx, {
            aktor: akses.userId,
            aksi: "impor-ai-eksternal",
            target: `butir_soal:${butir.id}`,
            beban: {
              provenance: `eksternal-pengguna:${akses.userId}:${item.jenis}:${new Date().toISOString()}`,
            },
          });
          return { ok: true as const };
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : "kesalahan basis data";
          return {
            ok: false as const,
            error: `Butir ${item.nomor}: gagal disimpan (${detail}).`,
          };
        }
      })
    );
    for (const hasil of hasilSimpan) {
      if (hasil.ok) {
        tersimpan += 1;
      } else {
        gagal += 1;
        errors.push(hasil.error);
      }
    }
  });

  if (tersimpan > 0) revalidatePath(REVALIDATE_TARGET);
  return { ok: tersimpan > 0, tersimpan, gagal, errors };
}
