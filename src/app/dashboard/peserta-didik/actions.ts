"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Peserta Didik page (T7/T8) may hide a form for a `guru`
// client, but a determined client can construct a `fetch` + `FormData` and POST
// it directly to this action. That POST MUST still throw — the action is the
// boundary, not the UI. The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (identity doc §13 — "no global superuser"):
// `orgId` comes ONLY from `akses.membership.orgId` (the live WorkOS
// Keanggotaan). A tampered `orgId`/`tenantId` field in formData is deliberately
// NEVER read — it is ignored. Tenant scoping happens via
// `withTenant(db, orgId, ...)` which sets the RLS session GUC `app.tenant_id`.
//
// SECURITY (identity doc §13 — pembatasan wins):
// `boleh()` returns `{diizinkan:false, sumber:"pembatasan"}` when an admin has
// a `pembatasan_akses` row for the requested slug. Even
// `admin_satuan_pendidikan` / `dev` cannot bypass a restriction — there is no
// superuser. The AC#5 proof test for "admin WITH pembatasan['peserta_didik:buat']"
// verifies this.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant, type Tx } from "@/db/client";
import {
  hapusKontakDarurat,
  hapusWali,
  tambahKontakDarurat,
  tambahWali,
} from "@/db/queries/kontak-peserta-didik";
import { tambahMutasi } from "@/db/queries/mutasi-peserta-didik";
import {
  buatPesertaDidik,
  cariPesertaDidikById,
  ubahPesertaDidik,
  ubahStatus,
  type JenisKelamin,
  type StatusPesertaDidik,
} from "@/db/queries/peserta-didik";
import { requireAksesAktif } from "@/lib/auth/akses-saya";
import { trimField } from "@/lib/form/parser";

const REVALIDATE_TARGET = "/dashboard/peserta-didik";

// --- manual validation helpers (no zod) ------------------------------------

/** NISN is exactly 8 digits when present. */
const NISN_RE = /^\d{8}$/;
/** Valid status literals (mirror the schema CHECK constraint). */
const STATUS_VALID = ["aktif", "pindah", "lulus", "keluar"] as const;
/** Valid arah mutasi literals. */
const ARAH_VALID = ["masuk", "keluar"] as const;
type ArahMutasi = (typeof ARAH_VALID)[number];

/**
 * True iff `value` parses as a real calendar date. Accepts ISO `YYYY-MM-DD`
 * (the schema column type) and any string `Date.parse` accepts. Empty string
 * is invalid (caller checks presence first).
 */
function isParseableDate(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Tenant-scoped existence guard (cubic P1-5). RLS already filters cross-tenant
 * rows, but resolving the id explicitly inside `withTenant` turns a missing or
 * cross-tenant id into a clear error BEFORE any write/audit runs — otherwise a
 * bad `pesertaDidikId` would surface as an opaque FK violation or a silent
 * repo-layer throw. Throws when the row is absent under the active tenant.
 */
async function assertPesertaAda(tx: Tx, id: string): Promise<void> {
  const existing = await cariPesertaDidikById(tx, id);
  if (!existing) {
    throw new Error("Peserta Didik tidak ditemukan.");
  }
}

// 1. simpanPesertaDidikBaruAction --------------------------------------------

/**
 * Create a Peserta Didik (student) in the active Satuan Pendidikan. Requires
 * the `peserta_didik:buat` izin. The new row's status defaults to `'aktif'`
 * (seeded by `buatPesertaDidik` together with the initial riwayat row — AC#2).
 */
export async function simpanPesertaDidikBaruAction(
  formData: FormData
): Promise<void> {
  // 1. Resolve + authorize (SERVER-SIDE — this is the boundary, NOT the UI)
  const akses = await requireAksesAktif("peserta_didik:buat", "Anda tidak memiliki izin untuk menambah Peserta Didik.");

  // 2. Manual validation (no zod)
  const nama = trimField(formData, "nama");
  if (!nama) throw new Error("Nama wajib diisi.");

  const tanggalLahir = trimField(formData, "tanggalLahir");
  if (!isParseableDate(tanggalLahir)) {
    throw new Error("Tanggal lahir wajib diisi.");
  }

  const jenisRaw = trimField(formData, "jenisKelamin");
  if (jenisRaw !== "L" && jenisRaw !== "P") {
    throw new Error("Jenis kelamin tidak valid.");
  }
  const jenisKelamin: JenisKelamin = jenisRaw;

  const nisnRaw = trimField(formData, "nisn");
  if (nisnRaw && !NISN_RE.test(nisnRaw)) {
    throw new Error("NISN harus 8 digit.");
  }
  const nisn = nisnRaw || null;

  const nis = trimField(formData, "nis") || null;

  // 3. Execute under tenant scope + audit. orgId from membership ONLY.
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const pd = await buatPesertaDidik(tx, {
      nama,
      nisn,
      nis,
      tanggalLahir,
      jenisKelamin,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_peserta_didik",
      target: `peserta_didik:${pd.id}`,
      beban: { nama, nisn, nis, tanggalLahir, jenisKelamin },
    });
  });

  // 4. Revalidate
  revalidatePath(REVALIDATE_TARGET);
}

// 2. ubahPesertaDidikAction --------------------------------------------------

/**
 * Update a Peserta Didik's biodata ONLY (nama / nisn / nis / tanggalLahir /
 * jenisKelamin). Requires `peserta_didik:ubah`. The `status` cache is
 * deliberately untouched — status changes flow through `ubahStatus` so the
 * append-only history stays consistent (AC#2).
 */
export async function ubahPesertaDidikAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif("peserta_didik:ubah", "Anda tidak memiliki izin untuk mengubah Peserta Didik.");

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID Peserta Didik wajib diisi.");

  const input: {
    nama?: string;
    nisn?: string | null;
    nis?: string | null;
    tanggalLahir?: string;
    jenisKelamin?: JenisKelamin;
  } = {};

  const nama = trimField(formData, "nama");
  if (nama) input.nama = nama;

  const tanggalLahir = trimField(formData, "tanggalLahir");
  if (tanggalLahir) {
    if (!isParseableDate(tanggalLahir)) {
      throw new Error("Tanggal lahir wajib diisi.");
    }
    input.tanggalLahir = tanggalLahir;
  }

  const jenisRaw = trimField(formData, "jenisKelamin");
  if (jenisRaw) {
    if (jenisRaw !== "L" && jenisRaw !== "P") {
      throw new Error("Jenis kelamin tidak valid.");
    }
    input.jenisKelamin = jenisRaw;
  }

  const nisnRaw = trimField(formData, "nisn");
  if (nisnRaw) {
    if (!NISN_RE.test(nisnRaw)) {
      throw new Error("NISN harus 8 digit.");
    }
    input.nisn = nisnRaw;
  } else if (formData.has("nisn")) {
    // explicit empty → clear
    input.nisn = null;
  }

  const nis = trimField(formData, "nis");
  if (nis) input.nis = nis;
  else if (formData.has("nis")) input.nis = null;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // react-doctor-disable-next-line async-parallel: ubahPesertaDidik depends on existence guard; audit logs after successful update, react-doctor/async-parallel
    await assertPesertaAda(tx, id);
    await ubahPesertaDidik(tx, id, input);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "ubah_peserta_didik",
      target: `peserta_didik:${id}`,
      beban: input,
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. ubahStatusPesertaDidikAction --------------------------------------------

/**
 * Transition a Peserta Didik's status (aktif / pindah / lulus / keluar).
 * Requires `peserta_didik:ubah`. Delegates to `ubahStatus` which appends a new
 * riwayat row AND updates the cache atomically (AC#2 — history is append-only,
 * never rewritten or deleted).
 */
export async function ubahStatusPesertaDidikAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif("peserta_didik:ubah", "Anda tidak memiliki izin untuk mengubah Peserta Didik.");

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID Peserta Didik wajib diisi.");

  const statusRaw = trimField(formData, "status");
  if (!(STATUS_VALID as readonly string[]).includes(statusRaw)) {
    throw new Error("Status tidak valid.");
  }
  const status = statusRaw as StatusPesertaDidik;

  const catatan = trimField(formData, "catatan") || null;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // react-doctor-disable-next-line async-parallel: ubahStatus depends on existence guard; audit logs after successful update, react-doctor/async-parallel
    await assertPesertaAda(tx, id);
    await ubahStatus(tx, id, {
      status,
      catatan: catatan ?? undefined,
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "ubah_status_peserta_didik",
      target: `peserta_didik:${id}`,
      beban: { status, catatan },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 4. catatMutasiPesertaDidikAction -------------------------------------------

/**
 * Record a student transfer (mutasi) AND transition status atomically in ONE
 * `withTenant` transaction. Requires `peserta_didik:ubah`.
 *
 * ATOMIC COMPOSITION POINT: this is the single place where the mutasi repo
 * (`tambahMutasi`) and the peserta-didik status repo (`ubahStatus`) meet in one
 * tx. Keeping them in one tx guarantees the transfer record and the status
 * cache can never disagree — a crash mid-way rolls both back (AC#3 — mutasi
 * recorded; AC#2 — status change atomic with history append).
 *
 * DOMAIN MAPPING (arah → status): an incoming student (`arah='masuk'`) is now
 * active at this Satuan Pendidikan → status `'aktif'`. An outgoing student
 * (`arah='keluar'`) has left → status `'pindah'` (the student still exists in
 * the registry; 'keluar' is reserved for permanent exit which is a separate
 * status-only action #3).
 */
export async function catatMutasiPesertaDidikAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif("peserta_didik:ubah", "Anda tidak memiliki izin untuk mengubah Peserta Didik.");

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID Peserta Didik wajib diisi.");

  const arahRaw = trimField(formData, "arah");
  if (!(ARAH_VALID as readonly string[]).includes(arahRaw)) {
    throw new Error("Arah mutasi tidak valid.");
  }
  const arah = arahRaw as ArahMutasi;

  const tanggal = trimField(formData, "tanggal");
  if (!isParseableDate(tanggal)) {
    throw new Error("Tanggal mutasi wajib diisi.");
  }

  const asalSekolah = trimField(formData, "asalSekolah") || null;
  const tujuanSekolah = trimField(formData, "tujuanSekolah") || null;
  const alasan = trimField(formData, "alasan") || null;

  // arah → status mapping (see doc comment above).
  const statusAkhir: StatusPesertaDidik = arah === "masuk" ? "aktif" : "pindah";

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // react-doctor-disable-next-line async-parallel: mutasi depends on existence guard; status transition + audit follow atomically (AC#3), react-doctor/async-parallel
    await assertPesertaAda(tx, id);
    // 1. Record the transfer row (mutasi repo).
    await tambahMutasi(tx, {
      pesertaDidikId: id,
      arah,
      asalSekolah: asalSekolah ?? undefined,
      tujuanSekolah: tujuanSekolah ?? undefined,
      tanggal,
      alasan: alasan ?? undefined,
      dibuatOleh: akses.userId,
    });
    // 2. Transition status (peserta-didik repo) — same tx, same RLS GUC.
    await ubahStatus(tx, id, {
      status: statusAkhir,
      dibuatOleh: akses.userId,
    });
    // 3. Single audit row for the composed operation.
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "catat_mutasi",
      target: `peserta_didik:${id}`,
      beban: { arah, tanggal, asalSekolah, tujuanSekolah, statusAkhir },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 5. tambahWaliAction --------------------------------------------------------

/**
 * Add a wali (parent/guardian) CONTACT record to a Peserta Didik. Requires
 * `peserta_didik:ubah`. DOMAIN (AC#4): a wali is a contact ONLY — it is NOT a
 * Pengguna and cannot sign in. No user_id/auth columns are touched here.
 */
export async function tambahWaliAction(formData: FormData): Promise<void> {
  const akses = await requireAksesAktif("peserta_didik:ubah", "Anda tidak memiliki izin untuk mengubah Peserta Didik.");

  const pesertaDidikId = trimField(formData, "pesertaDidikId");
  if (!pesertaDidikId) throw new Error("ID Peserta Didik wajib diisi.");

  const nama = trimField(formData, "nama");
  if (!nama) throw new Error("Nama wajib diisi.");

  const hubungan = trimField(formData, "hubungan") || null;
  const telepon = trimField(formData, "telepon") || null;
  const email = trimField(formData, "email") || null;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // react-doctor-disable-next-line async-parallel: tambahWali depends on existence guard; audit logs after successful insert, react-doctor/async-parallel
    await assertPesertaAda(tx, pesertaDidikId);
    await tambahWali(tx, {
      pesertaDidikId,
      nama,
      hubungan: hubungan ?? undefined,
      telepon: telepon ?? undefined,
      email: email ?? undefined,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "tambah_wali",
      target: `peserta_didik:${pesertaDidikId}`,
      beban: { nama, hubungan, telepon, email },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 6. hapusWaliAction ---------------------------------------------------------

/**
 * Delete a wali contact by id. Requires `peserta_didik:ubah`. RLS scopes the
 * delete to the active tenant — a cross-tenant id is a silent no-op.
 */
export async function hapusWaliAction(formData: FormData): Promise<void> {
  const akses = await requireAksesAktif("peserta_didik:ubah", "Anda tidak memiliki izin untuk mengubah Peserta Didik.");

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID wali wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await hapusWali(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "hapus_wali",
      target: `wali:${id}`,
      beban: { id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 7. tambahKontakDaruratAction -----------------------------------------------

/**
 * Add an emergency-contact record to a Peserta Didik. Requires
 * `peserta_didik:ubah`. Like wali, a kontak_darurat is a contact ONLY (AC#4).
 */
export async function tambahKontakDaruratAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif("peserta_didik:ubah", "Anda tidak memiliki izin untuk mengubah Peserta Didik.");

  const pesertaDidikId = trimField(formData, "pesertaDidikId");
  if (!pesertaDidikId) throw new Error("ID Peserta Didik wajib diisi.");

  const nama = trimField(formData, "nama");
  if (!nama) throw new Error("Nama wajib diisi.");

  const hubungan = trimField(formData, "hubungan") || null;
  const telepon = trimField(formData, "telepon") || null;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // react-doctor-disable-next-line async-parallel: tambahKontakDarurat depends on existence guard; audit logs after successful insert, react-doctor/async-parallel
    await assertPesertaAda(tx, pesertaDidikId);
    await tambahKontakDarurat(tx, {
      pesertaDidikId,
      nama,
      hubungan: hubungan ?? undefined,
      telepon: telepon ?? undefined,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "tambah_kontak_darurat",
      target: `peserta_didik:${pesertaDidikId}`,
      beban: { nama, hubungan, telepon },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 8. hapusKontakDaruratAction ------------------------------------------------

/**
 * Delete an emergency contact by id. Requires `peserta_didik:ubah`. RLS scopes
 * the delete to the active tenant — a cross-tenant id is a silent no-op.
 */
export async function hapusKontakDaruratAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif("peserta_didik:ubah", "Anda tidak memiliki izin untuk mengubah Peserta Didik.");

  const id = trimField(formData, "id");
  if (!id) throw new Error("ID kontak darurat wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await hapusKontakDarurat(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "hapus_kontak_darurat",
      target: `kontak_darurat:${id}`,
      beban: { id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
