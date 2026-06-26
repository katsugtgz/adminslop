"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Beban Mengajar page (T6) may hide a form for a `guru`
// client, but a determined client can construct a `fetch` + `FormData` and
// POST it directly to this action. That POST MUST still throw — the action is
// the boundary, not the UI. The proof lives in `actions.test.ts` describe
// block "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY (identity doc §13 — "no global superuser"):
// `orgId` comes ONLY from `akses.membership.orgId` (the live WorkOS
// Keanggotaan). A tampered `tenantId` field in formData is deliberately NEVER
// read — it is ignored. Tenant scoping happens via `withTenant(db, orgId, ...)`
// which sets the RLS session GUC `app.tenant_id`.
//
// SECURITY (identity doc §13 — pembatasan wins):
// `boleh()` returns `{diizinkan:false, sumber:"pembatasan"}` when an admin has
// a `pembatasan_akses` row for the requested slug. Even
// `admin_satuan_pendidikan` / `dev` cannot bypass a restriction — there is no
// superuser. The proof test for "admin WITH pembatasan['beban_mengajar:buat']"
// verifies this.
//
// AC#2 (XOR): exactly one of `rombonganBelajarId` / `tingkatId` must be set on
// a beban_mengajar. The action validates this BEFORE touching the DB so the
// error message is Bahasa + actionable (the schema CHECK constraint would
// otherwise reject with a generic Postgres error).
//
// AC#4 (active period SERVER-SIDE): the active Tahun Ajaran + Semester are
// resolved inside `withTenant` via `getTahunAjaranAktif(tx)` +
// `getSemesterAktif(tx)` — NEVER from formData. A guru's "my context" view
// (T6) derives from this same active period; the action uses the identical
// source so admin writes + guru reads cannot diverge.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import {
  buatBebanMengajar,
  hapusBebanMengajar,
  ubahBebanMengajar,
} from "@/db/queries/beban-mengajar";
import type { Semester } from "@/db/queries/beban-mengajar";
import { hapusWaliKelas, upsertWaliKelas } from "@/db/queries/wali-kelas";
import { getSemesterAktif, getTahunAjaranAktif } from "@/db/queries/tahun-ajaran";
import { getAksesSaya } from "@/lib/auth/akses-saya";

const REVALIDATE_TARGET = "/dashboard/beban-mengajar";

// --- shared helpers --------------------------------------------------------

/**
 * Read a formData field as a trimmed string, returning `null` when empty.
 * Used for optional id-style fields where empty means "absent".
 */
function optionalString(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  return raw || null;
}

/**
 * Read a formData field as a trimmed string, throwing the given Bahasa error
 * when empty. Used for required id-style fields.
 */
function requiredString(formData: FormData, key: string, error: string): string {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) throw new Error(error);
  return raw;
}

/**
 * Resolve the active academic period (Tahun Ajaran + Semester) SERVER-SIDE
 * from the tenant-scoped tx. AC#4: the active period is the single source of
 * truth shared by admin writes + guru reads — never trust formData for it.
 * Throws Bahasa when either is unset.
 */
async function resolvePeriodAktif(tx: unknown): Promise<{
  tahunAjaranId: string;
  semester: Semester;
}> {
  const taAktif = await getTahunAjaranAktif(tx as Parameters<typeof getTahunAjaranAktif>[0]);
  if (!taAktif) {
    throw new Error("Belum ada Tahun Ajaran aktif.");
  }
  const semester = await getSemesterAktif(tx as Parameters<typeof getSemesterAktif>[0]);
  if (!semester) {
    throw new Error("Belum ada Semester aktif.");
  }
  return { tahunAjaranId: taAktif.id, semester };
}

// 1. simpanBebanMengajarBaruAction ------------------------------------------

/**
 * Create a Beban Mengajar (teaching load) for the active academic period.
 * Requires the `beban_mengajar:buat` izin. AC#2 XOR: exactly one of
 * `rombonganBelajarId` / `tingkatId` must be provided. AC#4: the active
 * Tahun Ajaran + Semester are resolved server-side.
 */
export async function simpanBebanMengajarBaruAction(
  formData: FormData
): Promise<void> {
  // 1. Resolve + authorize (SERVER-SIDE — this is the boundary, NOT the UI)
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanBuat = akses.boleh("beban_mengajar:buat");
  if (!keputusanBuat.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk menambah Beban Mengajar.");
  }

  // 2. Manual validation (no zod)
  const ptkId = requiredString(
    formData,
    "ptkId",
    "ID PTK wajib diisi."
  );
  const mataPelajaranId = requiredString(
    formData,
    "mataPelajaranId",
    "ID Mata Pelajaran wajib diisi."
  );
  const rombonganBelajarId = optionalString(formData, "rombonganBelajarId");
  const tingkatId = optionalString(formData, "tingkatId");

  // AC#2 XOR: exactly one of rombonganBelajarId / tingkatId.
  const hasRombel = rombonganBelajarId !== null;
  const hasTingkat = tingkatId !== null;
  if (hasRombel === hasTingkat) {
    throw new Error(
      "Pilih salah satu: Rombongan Belajar atau Tingkat."
    );
  }

  // 3. Execute under tenant scope + audit. orgId from membership ONLY.
  //    AC#4: active TA + semester resolved server-side inside withTenant.
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const { tahunAjaranId, semester } = await resolvePeriodAktif(tx);
    const beban = await buatBebanMengajar(tx, {
      ptkId,
      mataPelajaranId,
      rombonganBelajarId,
      tingkatId,
      tahunAjaranId,
      semester,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_beban_mengajar",
      target: `beban_mengajar:${beban.id}`,
      beban: {
        ptkId,
        mataPelajaranId,
        rombonganBelajarId,
        tingkatId,
        tahunAjaranId,
        semester,
      },
    });
  });

  // 4. Revalidate
  revalidatePath(REVALIDATE_TARGET);
}

// 2. ubahBebanMengajarAction ------------------------------------------------

/**
 * Update a Beban Mengajar by id. Requires the `beban_mengajar:ubah` izin.
 * Only provided fields are written. AC#2 XOR applies when both
 * `rombonganBelajarId` and `tingkatId` are present in the same call.
 */
export async function ubahBebanMengajarAction(
  formData: FormData
): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanUbah = akses.boleh("beban_mengajar:ubah");
  if (!keputusanUbah.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk mengubah Beban Mengajar.");
  }

  const id = requiredString(formData, "id", "ID Beban Mengajar tidak valid.");
  const input: {
    ptkId?: string;
    mataPelajaranId?: string;
    rombonganBelajarId?: string | null;
    tingkatId?: string | null;
  } = {};
  const ptkId = optionalString(formData, "ptkId");
  if (ptkId !== null) input.ptkId = ptkId;
  const mataPelajaranId = optionalString(formData, "mataPelajaranId");
  if (mataPelajaranId !== null) input.mataPelajaranId = mataPelajaranId;
  const rombonganBelajarId = optionalString(formData, "rombonganBelajarId");
  if (rombonganBelajarId !== null) input.rombonganBelajarId = rombonganBelajarId;
  const tingkatId = optionalString(formData, "tingkatId");
  if (tingkatId !== null) input.tingkatId = tingkatId;

  // AC#2 XOR when both are present in this call.
  if (
    input.rombonganBelajarId !== undefined &&
    input.tingkatId !== undefined
  ) {
    throw new Error(
      "Pilih salah satu: Rombongan Belajar atau Tingkat."
    );
  }

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await ubahBebanMengajar(tx, id, input);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "ubah_beban_mengajar",
      target: `beban_mengajar:${id}`,
      beban: { id, ...input },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. hapusBebanMengajarAction -----------------------------------------------

/**
 * Delete a Beban Mengajar by id. Requires the `beban_mengajar:ubah` izin.
 * RLS scopes the delete to the active tenant — a cross-tenant id is a silent
 * no-op.
 */
export async function hapusBebanMengajarAction(
  formData: FormData
): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanUbah = akses.boleh("beban_mengajar:ubah");
  if (!keputusanUbah.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk menghapus Beban Mengajar.");
  }

  const id = requiredString(formData, "id", "ID Beban Mengajar tidak valid.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await hapusBebanMengajar(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "hapus_beban_mengajar",
      target: `beban_mengajar:${id}`,
      beban: { id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 4. upsertWaliKelasAction --------------------------------------------------

/**
 * Assign (or reassign) the wali for a Rombongan Belajar in the active period.
 * Requires the `wali_kelas:buat` izin. AC#3: wali_kelas is a current-state
 * assignment — the schema UNIQUE constraint makes this an upsert, so changing
 * the wali for the current period is an UPDATE, not a second insert. AC#4:
 * active Tahun Ajaran + Semester resolved server-side.
 */
export async function upsertWaliKelasAction(
  formData: FormData
): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanBuat = akses.boleh("wali_kelas:buat");
  if (!keputusanBuat.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk mengatur Wali Kelas.");
  }

  const ptkId = requiredString(formData, "ptkId", "ID PTK wajib diisi.");
  const rombonganBelajarId = requiredString(
    formData,
    "rombonganBelajarId",
    "ID Rombongan Belajar wajib diisi."
  );

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const { tahunAjaranId, semester } = await resolvePeriodAktif(tx);
    const wali = await upsertWaliKelas(tx, {
      ptkId,
      rombonganBelajarId,
      tahunAjaranId,
      semester,
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "upsert_wali_kelas",
      target: `wali_kelas:${wali.id}`,
      beban: {
        ptkId,
        rombonganBelajarId,
        tahunAjaranId,
        semester,
      },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 5. hapusWaliKelasAction ---------------------------------------------------

/**
 * Delete a wali_kelas row by id. Requires the `wali_kelas:ubah` izin. RLS
 * scopes the delete to the active tenant — a cross-tenant id is a silent
 * no-op.
 */
export async function hapusWaliKelasAction(
  formData: FormData
): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  const keputusanUbah = akses.boleh("wali_kelas:ubah");
  if (!keputusanUbah.diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk menghapus Wali Kelas.");
  }

  const id = requiredString(formData, "id", "ID Wali Kelas tidak valid.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    await hapusWaliKelas(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "hapus_wali_kelas",
      target: `wali_kelas:${id}`,
      beban: { id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
