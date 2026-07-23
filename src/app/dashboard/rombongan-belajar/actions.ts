"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// Every action below re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on
// every call. The Rombongan Belajar page (T9) may hide a form for a `guru`
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
// superuser.
//
// AC#4 DERIVED-CONTEXT INVARIANT (load-bearing): the "current class context" of
// a student — (Tahun Ajaran, semester) — is NEVER read from formData. It is
// ALWAYS resolved server-side via `getTahunAjaranAktif(tx)` +
// `getSemesterAktif(tx)` inside the tenant-scoped tx. A client cannot inject a
// different TA or semester to read or write another context's placements.
//
// AC#5 APPEND-ONLY INVARIANT (load-bearing): `kenaikanTingkat` and
// `tinggalTingkat` NEVER update or delete the student's current placement. They
// append a NEW placement row for the new Tahun Ajaran. The penempatan repo
// exposes no update/delete — and even if it did, these actions would not call
// them. The old row is preserved forever as historical truth.

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import {
  tambahPenempatan,
  getPenempatanByKonteks,
} from "@/db/queries/penempatan-rombongan-belajar";
import {
  buatRombonganBelajar,
  cariAtauBuatRombonganBelajar,
  cariRombonganBelajarById,
} from "@/db/queries/rombongan-belajar";
import { getTahunAjaranAktif, getSemesterAktif, cariTahunAjaranById } from "@/db/queries/tahun-ajaran";
import { buatTingkat, cariTingkatBerikutnya, cariTingkatById } from "@/db/queries/tingkat";
import { requireAksesAktif } from "@/lib/auth/akses-saya";
import { trimField } from "@/lib/form/parser";

const REVALIDATE_TARGET = "/dashboard/rombongan-belajar";

// 1. simpanTingkatBaruAction -------------------------------------------------

/**
 * Create a Tingkat (grade level, e.g. "Kelas 1") in the active Satuan
 * Pendidikan. Requires `rombongan_belajar:buat`. `urutan` is the progression
 * order — it drives the `kenaikanTingkat` "next grade" lookup.
 */
export async function simpanTingkatBaruAction(
  formData: FormData
): Promise<void> {
  // 1. Resolve + authorize (SERVER-SIDE — this is the boundary, NOT the UI)
  const akses = await requireAksesAktif(
    "rombongan_belajar:buat",
    "Anda tidak memiliki izin untuk menambah Tingkat."
  );

  // 2. Manual validation (no zod)
  const nama = trimField(formData, "nama");
  if (!nama) throw new Error("Nama Tingkat wajib diisi.");

  const urutanRaw = trimField(formData, "urutan");
  const urutan = Number(urutanRaw);
  if (!urutanRaw || Number.isNaN(urutan)) {
    throw new Error("Urutan wajib diisi.");
  }

  // 3. Execute under tenant scope + audit. orgId from membership ONLY.
  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const tingkat = await buatTingkat(tx, { nama, urutan });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_tingkat",
      target: `tingkat:${tingkat.id}`,
      beban: { nama, urutan },
    });
  });

  // 4. Revalidate
  revalidatePath(REVALIDATE_TARGET);
}

// 2. simpanRombonganBelajarBaruAction ----------------------------------------

/**
 * Create a Rombongan Belajar (class / homeroom) in the active Satuan
 * Pendidikan. Requires `rombongan_belajar:buat`. The Tahun Ajaran is resolved
 * SERVER-SIDE from the active TA — never trusted from formData (AC#4). Throws
 * when no Tahun Ajaran is active.
 */
export async function simpanRombonganBelajarBaruAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "rombongan_belajar:buat",
    "Anda tidak memiliki izin untuk menambah Rombongan Belajar."
  );

  const nama = trimField(formData, "nama");
  if (!nama) throw new Error("Nama Rombongan Belajar wajib diisi.");

  const tingkatId = trimField(formData, "tingkatId");
  if (!tingkatId) throw new Error("Tingkat wajib dipilih.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // AC#4: active TA resolved server-side — formData cannot inject it.
    const ta = await getTahunAjaranAktif(tx);
    if (!ta) {
      throw new Error("Belum ada Tahun Ajaran aktif.");
    }
    const rombel = await buatRombonganBelajar(tx, {
      nama,
      tingkatId,
      tahunAjaranId: ta.id,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "buat_rombongan_belajar",
      target: `rombongan_belajar:${rombel.id}`,
      beban: { nama, tingkatId, tahunAjaranId: ta.id },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 3. tempatkanPesertaDidikAction ---------------------------------------------

/**
 * Place a Peserta Didik into a Rombongan Belajar for the CURRENT active context
 * — the active Tahun Ajaran + active semester, both resolved SERVER-SIDE
 * (AC#4). Requires `rombongan_belajar:kelola_penempatan`. Appends a new
 * penempatan row with status `'aktif'`; never touches existing rows (AC#5).
 */
export async function tempatkanPesertaDidikAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "rombongan_belajar:kelola_penempatan",
    "Anda tidak memiliki izin untuk mengelola penempatan Peserta Didik."
  );

  const pesertaDidikId = trimField(formData, "pesertaDidikId");
  if (!pesertaDidikId) throw new Error("ID Peserta Didik wajib diisi.");

  const rombonganBelajarId = trimField(formData, "rombonganBelajarId");
  if (!rombonganBelajarId) throw new Error("Rombongan Belajar wajib dipilih.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // AC#4: class context (TA + semester) resolved server-side.
    const ta = await getTahunAjaranAktif(tx);
    if (!ta) {
      throw new Error("Belum ada Tahun Ajaran aktif.");
    }
    const semester = await getSemesterAktif(tx);
    if (!semester) {
      throw new Error("Belum ada semester aktif.");
    }
    // SECURITY (cubic P1): the rombel id is client-supplied. RLS rejects a
    // cross-tenant id (cariRombonganBelajarById returns null), but a rombel
    // from a DIFFERENT Tahun Ajaran of THIS tenant would pass RLS and create a
    // placement inconsistent with the active context. Verify both existence
    // and that the rombel belongs to the active TA before placing.
    const rombel = await cariRombonganBelajarById(tx, rombonganBelajarId);
    if (!rombel) {
      throw new Error("Rombongan Belajar tidak ditemukan.");
    }
    if (rombel.tahunAjaranId !== ta.id) {
      throw new Error(
        "Rombongan Belajar bukan dari Tahun Ajaran aktif."
      );
    }
    await tambahPenempatan(tx, {
      pesertaDidikId,
      rombonganBelajarId,
      tahunAjaranId: ta.id,
      semester,
      status: "aktif",
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "tempatkan_peserta_didik",
      target: `peserta_didik:${pesertaDidikId}`,
      beban: { pesertaDidikId, rombonganBelajarId, tahunAjaranId: ta.id, semester },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 4. kenaikanTingkatAction ---------------------------------------------------

/**
 * Promote a Peserta Didik to the NEXT tingkat in a NEW Tahun Ajaran. Requires
 * `rombongan_belajar:kelola_penempatan`.
 *
 * ATOMIC COMPOSITION POINT (AC#3 — progression preserves history): this is the
 * single place where the tingkat, rombongan_belajar, and penempatan repos meet
 * in ONE `withTenant` tx. All reads + the append below run under the same RLS
 * GUC and the same transaction — a crash mid-way rolls the whole progression
 * back. The student's CURRENT placement (in the active context) is READ but
 * NEVER MODIFIED (AC#5 — append-only): a brand-new placement row with status
 * `'naik'` is appended for the new TA, recording the promotion as a fresh
 * historical event.
 *
 * Flow:
 *   1. Resolve the student's CURRENT placement via the active context
 *      (TA + semester) — server-side (AC#4).
 *   2. Walk placement → rombel → tingkat → next tingkat.
 *   3. Find-or-create the matching rombel in the NEW TA (same nama, next
 *      tingkat).
 *   4. Append a `status='naik'` placement for the new TA + same semester.
 */
export async function kenaikanTingkatAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "rombongan_belajar:kelola_penempatan",
    "Anda tidak memiliki izin untuk mengelola penempatan Peserta Didik."
  );

  const pesertaDidikId = trimField(formData, "pesertaDidikId");
  if (!pesertaDidikId) throw new Error("ID Peserta Didik wajib diisi.");

  const tahunAjaranBaruId = trimField(formData, "tahunAjaranBaruId");
  if (!tahunAjaranBaruId) throw new Error("Tahun Ajaran baru wajib dipilih.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    // 1. Active context (AC#4) + current placement.
    const taAktif = await getTahunAjaranAktif(tx);
    if (!taAktif) {
      throw new Error("Belum ada Tahun Ajaran aktif.");
    }
    const semester = await getSemesterAktif(tx);
    if (!semester) {
      throw new Error("Belum ada semester aktif.");
    }
    // SECURITY (cubic P1): tahunAjaranBaruId is client-supplied. Verify it
    // exists in THIS tenant (RLS-scoped) before using it — otherwise a
    // cross-tenant id surfaces as an opaque FK error, and a tampered id could
    // create placements pointing outside the tenant's Tahun Ajaran set.
    const taBaru = await cariTahunAjaranById(tx, tahunAjaranBaruId);
    if (!taBaru) {
      throw new Error(
        "Tahun Ajaran baru tidak ditemukan di Satuan Pendidikan aktif."
      );
    }
    const penempatan = await getPenempatanByKonteks(
      tx,
      pesertaDidikId,
      taAktif.id,
      semester
    );
    if (!penempatan) {
      throw new Error("Peserta Didik belum ditempatkan di konteks aktif.");
    }

    // 2. Walk to the current tingkat, then the next one.
    const rombel = await cariRombonganBelajarById(
      tx,
      penempatan.rombonganBelajarId
    );
    if (!rombel) {
      // Defensive: placement exists but its rombel is gone (cascade gap). Treat
      // as a hard error rather than silently skipping the promotion.
      throw new Error("Rombongan Belajar tidak ditemukan.");
    }
    const tingkat = await cariTingkatById(tx, rombel.tingkatId);
    if (!tingkat) {
      throw new Error("Tingkat tidak ditemukan.");
    }
    const nextTingkat = await cariTingkatBerikutnya(tx, tingkat.urutan);
    if (!nextTingkat) {
      // Already at the top grade — cannot progress further.
      throw new Error("Peserta Didik sudah di tingkat tertinggi.");
    }

    // 3. Find-or-create the next-grade rombel in the NEW TA (same nama).
    // react-doctor-disable-next-line async-parallel: nextRombel depends on full ownership/tingkat chain; penempatan + audit depend on nextRombel.id, react-doctor/async-parallel
    const nextRombel = await cariAtauBuatRombonganBelajar(tx, {
      nama: rombel.nama,
      tingkatId: nextTingkat.id,
      tahunAjaranId: tahunAjaranBaruId,
    });

    // 4. APPEND the promotion (AC#5 — old penempatan untouched, new row added).
    await tambahPenempatan(tx, {
      pesertaDidikId,
      rombonganBelajarId: nextRombel.id,
      tahunAjaranId: tahunAjaranBaruId,
      semester,
      status: "naik",
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "kenaikan_tingkat",
      target: `peserta_didik:${pesertaDidikId}`,
      beban: {
        dariTahunAjaranId: taAktif.id,
        keTahunAjaranId: tahunAjaranBaruId,
        dariTingkatId: tingkat.id,
        keTingkatId: nextTingkat.id,
        semester,
      },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}

// 5. tinggalTingkatAction ----------------------------------------------------

/**
 * Hold a Peserta Didik back — repeat the SAME tingkat in a NEW Tahun Ajaran.
 * Requires `rombongan_belajar:kelola_penempatan`.
 *
 * Mirror of `kenaikanTingkatAction` but the tingkat does NOT advance: the
 * student stays in the same grade. Appends a `status='tinggal'` placement for
 * the new TA (AC#5 — append-only); the current placement is read but never
 * modified.
 */
export async function tinggalTingkatAction(
  formData: FormData
): Promise<void> {
  const akses = await requireAksesAktif(
    "rombongan_belajar:kelola_penempatan",
    "Anda tidak memiliki izin untuk mengelola penempatan Peserta Didik."
  );

  const pesertaDidikId = trimField(formData, "pesertaDidikId");
  if (!pesertaDidikId) throw new Error("ID Peserta Didik wajib diisi.");

  const tahunAjaranBaruId = trimField(formData, "tahunAjaranBaruId");
  if (!tahunAjaranBaruId) throw new Error("Tahun Ajaran baru wajib dipilih.");

  const { db } = getDb();
  await withTenant(db, akses.membership.orgId, async (tx) => {
    const taAktif = await getTahunAjaranAktif(tx);
    if (!taAktif) {
      throw new Error("Belum ada Tahun Ajaran aktif.");
    }
    const semester = await getSemesterAktif(tx);
    if (!semester) {
      throw new Error("Belum ada semester aktif.");
    }
    // SECURITY (cubic P1): mirror of kenaikanTingkat — verify the client-
    // supplied tahunAjaranBaruId exists in THIS tenant before using it.
    const taBaru = await cariTahunAjaranById(tx, tahunAjaranBaruId);
    if (!taBaru) {
      throw new Error(
        "Tahun Ajaran baru tidak ditemukan di Satuan Pendidikan aktif."
      );
    }
    const penempatan = await getPenempatanByKonteks(
      tx,
      pesertaDidikId,
      taAktif.id,
      semester
    );
    if (!penempatan) {
      throw new Error("Peserta Didik belum ditempatkan di konteks aktif.");
    }

    const rombel = await cariRombonganBelajarById(
      tx,
      penempatan.rombonganBelajarId
    );
    if (!rombel) {
      throw new Error("Rombongan Belajar tidak ditemukan.");
    }
    // No tingkat walk here — the student stays in the SAME tingkat. We do not
    // even need to load `tingkat`; `rombel.tingkatId` carries forward directly.

    // Find-or-create the SAME-grade rombel in the NEW TA (same nama, same
    // tingkat — no progression).
    // react-doctor-disable-next-line async-parallel: nextRombel depends on ownership chain; penempatan + audit depend on nextRombel.id, react-doctor/async-parallel
    const nextRombel = await cariAtauBuatRombonganBelajar(tx, {
      nama: rombel.nama,
      tingkatId: rombel.tingkatId,
      tahunAjaranId: tahunAjaranBaruId,
    });

    // APPEND the repeat (AC#5).
    await tambahPenempatan(tx, {
      pesertaDidikId,
      rombonganBelajarId: nextRombel.id,
      tahunAjaranId: tahunAjaranBaruId,
      semester,
      status: "tinggal",
      dibuatOleh: akses.userId,
    });
    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "tinggal_tingkat",
      target: `peserta_didik:${pesertaDidikId}`,
      beban: {
        dariTahunAjaranId: taAktif.id,
        keTahunAjaranId: tahunAjaranBaruId,
        tingkatId: rombel.tingkatId,
        semester,
      },
    });
  });

  revalidatePath(REVALIDATE_TARGET);
}
