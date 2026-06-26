"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Penilaian page (T6) may hide a button for a `wali_kelas`
// client, but a determined client can construct a `fetch` + `FormData` and POST
// it directly to this action. That POST MUST still throw — the action is the
// boundary, not the UI. The proof lives in `actions.test.ts` describe block
// "AC#5: hiding UI is not the authorization boundary".
//
// SECURITY — DUAL AUTHORIZATION (AC#4, the core invariant of issue #11):
// Penilaian is the FIRST surface where role izin ALONE is insufficient. A guru
// holds `penilaian:buat`/`penilaian:ubah` (role-level gate 1), but may ONLY act
// on a Beban Mengajar they OWN (ownership gate 2). This composes two checks:
//
//   1. ROLE GATE  — `akses.boleh("penilaian:buat"|"penilaian:ubah")`. Fails for
//                   wali_kelas / kepala_sekolah (read-only) and any guru without
//                   the slug. Thrown BEFORE any DB work.
//   2. OWNERSHIP  — resolve the target row's Beban Mengajar chain and confirm
//                   `beban_mengajar.ptkId === akses.pengguna.ptkId`. Admin
//                   (`akses:kelola`) manages ALL Beban Mengajar school-wide and
//                   BYPASSES ownership. A guru without a linked PTK is refused.
//
// Admin bypass is deliberate (identity doc: admin manages school-wide), NOT a
// superuser escape — the role gate still binds, and `pembatasan` can still deny
// the admin at gate 1 (no global superuser, §13).
//
// The ownership chain depth varies by action:
//   komponen_nilai baru ........ formData.bebanMengajarId  (direct)
//   penilaian baru ............. komponen_nilai -> beban
//   nilai upsert ............... penilaian -> komponen_nilai -> beban
//   hapus komponen_nilai ....... komponen_nilai(id) -> beban
//   hapus penilaian ............ penilaian(id) -> komponen_nilai -> beban
//   hapus nilai ................ nilai(id) -> penilaian -> komponen_nilai -> beban
//
// SECURITY (identity doc §13 — tenant tamper-proofing): `orgId` comes ONLY from
// `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered `tenantId`
// field in formData is deliberately NEVER read. Tenant scoping happens via
// `withTenant(db, orgId, ...)` which sets the RLS session GUC `app.tenant_id`,
// so every chain lookup is already scoped to the active tenant — a cross-tenant
// id simply resolves to "not found" (a deny).

import { revalidatePath } from "next/cache";

import { catatAudit, dbSchema, getDb, withTenant } from "@/db/client";
import type { Tx } from "@/db/client";
import type {
  BebanMengajar,
  KomponenNilai,
  NilaiPesertaDidik,
  Penilaian,
} from "@/db/schema";
import { buatKomponenNilai, hapusKomponenNilai } from "@/db/queries/komponen-nilai";
import { buatPenilaian, hapusPenilaian } from "@/db/queries/penilaian";
import { hapusNilai, upsertNilai } from "@/db/queries/nilai-peserta-didik";
import { getAksesSaya, type AksesSaya } from "@/lib/auth/akses-saya";

const REVALIDATE_TARGET = "/dashboard/penilaian";

/** The "active" branch of {@linkcode AksesSaya} (post status check). */
type AksesAktif = Extract<AksesSaya, { status: "active" }>;

// ---------------------------------------------------------------------------
// Ownership chain resolvers (private).
//
// The repos expose list/create/update/delete but no `cari*ById`, and this layer
// cannot touch src/db. These helpers resolve a single row by id via a tenant-
// scoped SELECT (RLS hides cross-tenant rows) and `.find` in TS. Bounded by the
// tenant, they are correct; an indexed `cari*ById` repo helper would optimize
// them once permitted.
// ---------------------------------------------------------------------------

/** Find a beban_mengajar by id (tenant-scoped via the surrounding withTenant). */
async function cariBebanMengajarById(
  tx: Tx,
  id: string
): Promise<BebanMengajar | null> {
  const rows = await tx.select().from(dbSchema.bebanMengajar);
  return rows.find((r) => r.id === id) ?? null;
}

/** Find a komponen_nilai by id. */
async function cariKomponenNilaiById(
  tx: Tx,
  id: string
): Promise<KomponenNilai | null> {
  const rows = await tx.select().from(dbSchema.komponenNilai);
  return rows.find((r) => r.id === id) ?? null;
}

/** Find a penilaian by id. */
async function cariPenilaianById(tx: Tx, id: string): Promise<Penilaian | null> {
  const rows = await tx.select().from(dbSchema.penilaian);
  return rows.find((r) => r.id === id) ?? null;
}

/** Find a nilai_peserta_didik by id. */
async function cariNilaiById(
  tx: Tx,
  id: string
): Promise<NilaiPesertaDidik | null> {
  const rows = await tx.select().from(dbSchema.nilaiPesertaDidik);
  return rows.find((r) => r.id === id) ?? null;
}

/** Resolve komponen_nilai(id) -> beban_mengajar id. Throws when absent. */
async function bebanIdDariKomponen(tx: Tx, komponenNilaiId: string): Promise<string> {
  const kn = await cariKomponenNilaiById(tx, komponenNilaiId);
  if (!kn) throw new Error("Komponen Nilai tidak ditemukan.");
  return kn.bebanMengajarId;
}

/** Resolve penilaian(id) -> komponen_nilai -> beban_mengajar id. */
async function bebanIdDariPenilaian(tx: Tx, penilaianId: string): Promise<string> {
  const p = await cariPenilaianById(tx, penilaianId);
  if (!p) throw new Error("Penilaian tidak ditemukan.");
  return bebanIdDariKomponen(tx, p.komponenNilaiId);
}

/** Resolve nilai(id) -> penilaian -> komponen_nilai -> beban_mengajar id. */
async function bebanIdDariNilai(tx: Tx, nilaiId: string): Promise<string> {
  const n = await cariNilaiById(tx, nilaiId);
  if (!n) throw new Error("Nilai tidak ditemukan.");
  return bebanIdDariPenilaian(tx, n.penilaianId);
}

/**
 * AC#4 OWNERSHIP GATE (gate 2). Resolves the target Beban Mengajar via
 * `bebanResolver` and confirms the active guru owns it. Admin (`akses:kelola`)
 * manages every Beban Mengajar school-wide and short-circuits WITHOUT resolving
 * (no DB hit, no check). A guru without a linked PTK is refused outright.
 *
 * `bebanResolver` is lazy so admin never pays the chain-resolution cost.
 */
async function assertPemilikBeban(
  tx: Tx,
  akses: AksesAktif,
  bebanResolver: () => Promise<string>
): Promise<void> {
  // Admin bypass: manages all Beban Mengajar. (Not a superuser — the role gate
  // already bound, and pembatasan can still deny at gate 1.)
  if (akses.boleh("akses:kelola").diizinkan) return;

  const myPtkId = akses.pengguna?.ptkId ?? null;
  if (!myPtkId) {
    throw new Error("Akun Anda belum terhubung dengan PTK. Hubungi admin.");
  }
  const bebanMengajarId = await bebanResolver();
  const beban = await cariBebanMengajarById(tx, bebanMengajarId);
  if (!beban || beban.ptkId !== myPtkId) {
    throw new Error("Anda tidak memiliki izin untuk Beban Mengajar ini.");
  }
}

// 1. simpanKomponenNilaiBaruAction ------------------------------------------

/**
 * Create a Komponen Nilai (grading component) on a Beban Mengajar. Requires
 * `penilaian:buat`. Ownership: the guru must own the target Beban Mengajar
 * (admin bypasses). `bobot` must be a positive number (matches the schema
 * `komponen_nilai_bobot_check`).
 */
export async function simpanKomponenNilaiBaruAction(
  formData: FormData
): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("penilaian:buat").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Penilaian.");
  }

  const bebanMengajarId = String(formData.get("bebanMengajarId") ?? "").trim();
  if (!bebanMengajarId) throw new Error("ID Beban Mengajar wajib diisi.");
  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) throw new Error("Nama Komponen wajib diisi.");
  const bobotRaw = String(formData.get("bobot") ?? "").trim();
  if (!bobotRaw) throw new Error("Bobot wajib diisi.");
  const bobot = Number(bobotRaw);
  if (Number.isNaN(bobot)) throw new Error("Bobot harus berupa angka.");
  if (bobot <= 0) throw new Error("Bobot harus lebih besar dari 0.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // AC#4 gate 2: ownership (admin bypasses; guru must own beban_mengajar).
    await assertPemilikBeban(tx, akses, async () => bebanMengajarId);
    const kn = await buatKomponenNilai(tx, { bebanMengajarId, nama, bobot });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_komponen_nilai",
      target: `komponen_nilai:${kn.id}`,
      beban: { bebanMengajarId, nama, bobot },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 2. simpanPenilaianBaruAction ----------------------------------------------

/**
 * Create a Penilaian (assessment) within a Komponen Nilai. Requires
 * `penilaian:buat`. Ownership resolved via komponen_nilai -> beban_mengajar.
 */
export async function simpanPenilaianBaruAction(
  formData: FormData
): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("penilaian:buat").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Penilaian.");
  }

  const komponenNilaiId = String(formData.get("komponenNilaiId") ?? "").trim();
  if (!komponenNilaiId) throw new Error("ID Komponen Nilai wajib diisi.");
  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) throw new Error("Nama Penilaian wajib diisi.");
  const tanggal = String(formData.get("tanggal") ?? "").trim();
  if (!tanggal) throw new Error("Tanggal Penilaian wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // AC#4 gate 2: resolve komponen -> beban, then ownership.
    await assertPemilikBeban(tx, akses, () =>
      bebanIdDariKomponen(tx, komponenNilaiId)
    );
    const p = await buatPenilaian(tx, {
      komponenNilaiId,
      nama,
      tanggal,
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_penilaian",
      target: `penilaian:${p.id}`,
      beban: { komponenNilaiId, nama, tanggal },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. upsertNilaiAction ------------------------------------------------------

/**
 * Upsert a per-student score (nilai) for a Penilaian. Requires `penilaian:buat`.
 * Ownership resolved via penilaian -> komponen_nilai -> beban_mengajar. `nilai`
 * is optional (null/absent = student has a row but no score); `catatan` is an
 * optional teacher note.
 */
export async function upsertNilaiAction(formData: FormData): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("penilaian:buat").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Penilaian.");
  }

  const penilaianId = String(formData.get("penilaianId") ?? "").trim();
  if (!penilaianId) throw new Error("ID Penilaian wajib diisi.");
  const pesertaDidikId = String(formData.get("pesertaDidikId") ?? "").trim();
  if (!pesertaDidikId) throw new Error("ID Peserta Didik wajib diisi.");
  const nilaiRaw = String(formData.get("nilai") ?? "").trim();
  let nilai: number | null = null;
  if (nilaiRaw) {
    const parsed = Number(nilaiRaw);
    if (Number.isNaN(parsed)) throw new Error("Nilai harus berupa angka.");
    nilai = parsed;
  }
  const catatanRaw = String(formData.get("catatan") ?? "").trim();
  const catatan: string | undefined = catatanRaw || undefined;

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // AC#4 gate 2: resolve penilaian -> komponen -> beban, then ownership.
    await assertPemilikBeban(tx, akses, () =>
      bebanIdDariPenilaian(tx, penilaianId)
    );
    const n = await upsertNilai(tx, {
      penilaianId,
      pesertaDidikId,
      nilai,
      catatan,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "upsert_nilai",
      target: `nilai:${n.id}`,
      beban: { penilaianId, pesertaDidikId, nilai, catatan },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 4. hapusKomponenNilaiAction -----------------------------------------------

/**
 * Delete a Komponen Nilai by id. Requires `penilaian:ubah`. Ownership resolved
 * via komponen_nilai(id) -> beban_mengajar. RLS scopes the delete to the active
 * tenant — a cross-tenant id is a silent no-op.
 */
export async function hapusKomponenNilaiAction(
  formData: FormData
): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("penilaian:ubah").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Penilaian.");
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("ID Komponen Nilai wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // AC#4 gate 2: resolve komponen(id) -> beban, then ownership.
    await assertPemilikBeban(tx, akses, () => bebanIdDariKomponen(tx, id));
    await hapusKomponenNilai(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "hapus_komponen_nilai",
      target: `komponen_nilai:${id}`,
      beban: { id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 5. hapusPenilaianAction ---------------------------------------------------

/**
 * Delete a Penilaian by id. Requires `penilaian:ubah`. Ownership resolved via
 * penilaian(id) -> komponen_nilai -> beban_mengajar.
 */
export async function hapusPenilaianAction(formData: FormData): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("penilaian:ubah").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Penilaian.");
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("ID Penilaian wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // AC#4 gate 2: resolve penilaian(id) -> komponen -> beban, then ownership.
    await assertPemilikBeban(tx, akses, () => bebanIdDariPenilaian(tx, id));
    await hapusPenilaian(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "hapus_penilaian",
      target: `penilaian:${id}`,
      beban: { id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 6. hapusNilaiAction -------------------------------------------------------

/**
 * Delete a nilai row by id. Requires `penilaian:ubah`. Ownership resolved via
 * nilai(id) -> penilaian -> komponen_nilai -> beban_mengajar.
 */
export async function hapusNilaiAction(formData: FormData): Promise<void> {
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("penilaian:ubah").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk Penilaian.");
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("ID Nilai wajib diisi.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // AC#4 gate 2: resolve nilai(id) -> penilaian -> komponen -> beban, then ownership.
    await assertPemilikBeban(tx, akses, () => bebanIdDariNilai(tx, id));
    await hapusNilai(tx, id);
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "hapus_nilai",
      target: `nilai:${id}`,
      beban: { id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
