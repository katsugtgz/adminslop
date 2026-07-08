/**
 * Ownership guards (gate 2 of the dual-authorization model, identity doc §12
 * + issue #11 AC#4). Pure module — NO "use server". Imported freely by server
 * actions (each `src/app/dashboard/<feature>/actions.ts`) and the sync route
 * (`src/app/api/sinkronisasi/route.ts`), giving ONE source of truth for the
 * "does this Pengguna own this resource?" decision.
 *
 * SECURITY model (mirrors the comment block formerly in
 * `penilaian/actions.ts`):
 *
 *   1. ROLE GATE  — `akses.boleh(...)` (evaluated by the caller BEFORE these
 *                   guards). Fails for roles lacking the feature slug.
 *   2. OWNERSHIP  — resolve the target row's owning PTK and confirm it equals
 *                   `akses.pengguna.ptkId`. Admin (`akses:kelola`) manages
 *                   EVERYTHING school-wide and short-circuits WITHOUT resolving
 *                   (no DB hit, no check). A guru without a linked PTK is
 *                   refused outright.
 *
 * Admin bypass is deliberate (identity doc: admin manages school-wide), NOT a
 * superuser escape — the role gate still binds, and `pembatasan` can still deny
 * the admin at gate 1 (no global superuser, §13).
 *
 * TENANT TAMPER-PROOFING (identity doc §13): every resolver runs inside the
 * caller's `withTenant(db, orgId, ...)` so RLS scopes all reads via the session
 * GUC `app.tenant_id`. A cross-tenant id simply resolves to "not found" (a
 * deny). `orgId` is NEVER read from client input.
 *
 * Resolvers use indexed `tx.select().from(table).where(eq(table.id, id))`
 * lookups (the bounded tenant + RLS scopes all reads). A trailing JS `.find`
 * is retained as a defensive safety net over the already-filtered result set.
 */

import { and, eq } from "drizzle-orm";

import { dbSchema, type Tx } from "@/db/client";
import type {
  BebanMengajar,
  KomponenNilai,
  NilaiPesertaDidik,
  Penilaian,
  RombonganBelajar,
  WaliKelas,
} from "@/db/schema";

import type { AksesSaya } from "./akses-saya";

/** The "active" branch of {@linkcode AksesSaya} (post status check). */
export type AksesAktif = Extract<AksesSaya, { status: "active" }>;

/**
 * Ownership-denial error — lets callers (e.g. the sync route) distinguish a
 * 403 (ownership gate) from a 500 (DB/programming/audit) via `instanceof`,
 * without inspecting message text.
 */
export class KepemilikanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KepemilikanError";
  }
}

// ---------------------------------------------------------------------------
// Beban Mengajar ownership chain resolvers (Penilaian surface).
// The chain depth varies by action:
//   komponen_nilai baru ........ formData.bebanMengajarId  (direct)
//   penilaian baru ............. komponen_nilai -> beban
//   nilai upsert ............... penilaian -> komponen_nilai -> beban
//   hapus komponen_nilai ....... komponen_nilai(id) -> beban
//   hapus penilaian ............ penilaian(id) -> komponen_nilai -> beban
//   hapus nilai ................ nilai(id) -> penilaian -> komponen_nilai -> beban
// ---------------------------------------------------------------------------

/** Find a beban_mengajar by id (tenant-scoped via the surrounding withTenant). */
async function cariBebanMengajarById(
  tx: Tx,
  id: string
): Promise<BebanMengajar | null> {
  const rows = await tx
    .select()
    .from(dbSchema.bebanMengajar)
    .where(eq(dbSchema.bebanMengajar.id, id));
  return rows.find((r) => r.id === id) ?? null;
}

/** Find a komponen_nilai by id. */
async function cariKomponenNilaiById(
  tx: Tx,
  id: string
): Promise<KomponenNilai | null> {
  const rows = await tx
    .select()
    .from(dbSchema.komponenNilai)
    .where(eq(dbSchema.komponenNilai.id, id));
  return rows.find((r) => r.id === id) ?? null;
}

/** Find a penilaian by id. */
async function cariPenilaianById(tx: Tx, id: string): Promise<Penilaian | null> {
  const rows = await tx
    .select()
    .from(dbSchema.penilaian)
    .where(eq(dbSchema.penilaian.id, id));
  return rows.find((r) => r.id === id) ?? null;
}

/** Find a nilai_peserta_didik by id. */
async function cariNilaiById(
  tx: Tx,
  id: string
): Promise<NilaiPesertaDidik | null> {
  const rows = await tx
    .select()
    .from(dbSchema.nilaiPesertaDidik)
    .where(eq(dbSchema.nilaiPesertaDidik.id, id));
  return rows.find((r) => r.id === id) ?? null;
}

/** Resolve komponen_nilai(id) -> beban_mengajar id. Throws when absent. */
async function bebanIdDariKomponen(tx: Tx, komponenNilaiId: string): Promise<string> {
  const kn = await cariKomponenNilaiById(tx, komponenNilaiId);
  if (!kn) throw new KepemilikanError("Komponen Nilai tidak ditemukan.");
  return kn.bebanMengajarId;
}

/** Resolve penilaian(id) -> komponen_nilai -> beban_mengajar id. */
export async function bebanIdDariPenilaian(tx: Tx, penilaianId: string): Promise<string> {
  const p = await cariPenilaianById(tx, penilaianId);
  if (!p) throw new KepemilikanError("Penilaian tidak ditemukan.");
  return bebanIdDariKomponen(tx, p.komponenNilaiId);
}

/** Resolve nilai(id) -> penilaian -> komponen_nilai -> beban_mengajar id. */
export async function bebanIdDariNilai(tx: Tx, nilaiId: string): Promise<string> {
  const n = await cariNilaiById(tx, nilaiId);
  if (!n) throw new KepemilikanError("Nilai tidak ditemukan.");
  return bebanIdDariPenilaian(tx, n.penilaianId);
}

// Exported so the Penilaian actions can resolve the shallow komponen -> beban
// chain without duplicating the resolver (DRY — single source of truth).
export { bebanIdDariKomponen };

/**
 * AC#4 OWNERSHIP GATE (gate 2). Resolves the target Beban Mengajar via
 * `bebanResolver` and confirms the active guru owns it. Admin (`akses:kelola`)
 * manages every Beban Mengajar school-wide and short-circuits WITHOUT resolving
 * (no DB hit, no check). A guru without a linked PTK is refused outright.
 *
 * `bebanResolver` is lazy so admin never pays the chain-resolution cost.
 *
 * MOVED VERBATIM from `src/app/dashboard/penilaian/actions.ts` (issue #11) so
 * the sync route (`/api/sinkronisasi`) can enforce the SAME gate (C1) without
 * duplicating the logic.
 */
export async function assertPemilikBeban(
  tx: Tx,
  akses: AksesAktif,
  bebanResolver: () => Promise<string>
): Promise<void> {
  // Admin bypass: manages all Beban Mengajar. (Not a superuser — the role gate
  // already bound, and pembatasan can still deny at gate 1.)
  if (akses.boleh("akses:kelola").diizinkan) return;

  const myPtkId = akses.pengguna?.ptkId ?? null;
  if (!myPtkId) {
    throw new KepemilikanError("Akun Anda belum terhubung dengan PTK. Hubungi admin.");
  }
  const bebanMengajarId = await bebanResolver();
  const beban = await cariBebanMengajarById(tx, bebanMengajarId);
  if (!beban || beban.ptkId !== myPtkId) {
    throw new KepemilikanError("Anda tidak memiliki izin untuk Beban Mengajar ini.");
  }
}

// ---------------------------------------------------------------------------
// Rombongan Belajar ownership (Absensi surface — C3).
//
// A guru may record/correct Absensi for a Rombongan Belajar iff they have a
// CURRENT assignment linking their PTK to that rombel:
//   (a) a beban_mengajar row (rombonganBelajarId, ptkId), OR
//   (b) a wali_kelas row (rombonganBelajarId, ptkId).
//
// NOTE on "current period": like {@linkcode assertPemilikBeban}, this matches on
// (rombonganBelajarId, ptkId) without filtering by tahun_ajaran/semester/arsip.
// A historical assignment therefore continues to authorize the guru for the
// rombel; tightening to the active period is a future refinement and is NOT
// required to close the C3 hole (cross-guru isolation is fully enforced here).
// ---------------------------------------------------------------------------

/** Find a beban_mengajar row linking (rombonganBelajarId, ptkId). */
async function cariBebanMengajarByRombelDanPtk(
  tx: Tx,
  rombonganBelajarId: string,
  ptkId: string
): Promise<BebanMengajar | null> {
  const rows = await tx
    .select()
    .from(dbSchema.bebanMengajar)
    .where(
      and(
        eq(dbSchema.bebanMengajar.rombonganBelajarId, rombonganBelajarId),
        eq(dbSchema.bebanMengajar.ptkId, ptkId)
      )
    );
  return (
    rows.find(
      (r) => r.rombonganBelajarId === rombonganBelajarId && r.ptkId === ptkId
    ) ?? null
  );
}

/** Find a wali_kelas row linking (rombonganBelajarId, ptkId). */
async function cariWaliKelasByRombelDanPtk(
  tx: Tx,
  rombonganBelajarId: string,
  ptkId: string
): Promise<WaliKelas | null> {
  const rows = await tx
    .select()
    .from(dbSchema.waliKelas)
    .where(
      and(
        eq(dbSchema.waliKelas.rombonganBelajarId, rombonganBelajarId),
        eq(dbSchema.waliKelas.ptkId, ptkId)
      )
    );
  return (
    rows.find(
      (r) => r.rombonganBelajarId === rombonganBelajarId && r.ptkId === ptkId
    ) ?? null
  );
}

/** Find a rombongan_belajar by id (tenant-scoped via the surrounding withTenant). */
async function cariRombonganBelajarById(
  tx: Tx,
  id: string
): Promise<RombonganBelajar | null> {
  const rows = await tx
    .select()
    .from(dbSchema.rombonganBelajar)
    .where(eq(dbSchema.rombonganBelajar.id, id));
  return rows.find((r) => r.id === id) ?? null;
}

/** Find an absensi_harian by id (for resolving id -> rombonganBelajarId). */
async function cariAbsensiById(tx: Tx, id: string): Promise<{ rombonganBelajarId: string | null } | null> {
  const rows = await tx
    .select()
    .from(dbSchema.absensiHarian)
    .where(eq(dbSchema.absensiHarian.id, id));
  return rows.find((r) => r.id === id) ?? null;
}

/**
 * Resolve absensi_harian(id) -> rombongan_belajar id. Throws when the absensi
 * row is absent (RLS cross-tenant or missing id both resolve to null → deny).
 */
export async function rombonganBelajarIdDariAbsensi(
  tx: Tx,
  absensiId: string
): Promise<string> {
  const a = await cariAbsensiById(tx, absensiId);
  if (!a) throw new KepemilikanError("Absensi tidak ditemukan.");
  if (!a.rombonganBelajarId) {
    throw new KepemilikanError("Absensi tidak terhubung dengan Rombongan Belajar.");
  }
  return a.rombonganBelajarId;
}

/**
 * AC#4 OWNERSHIP GATE for the Absensi surface (C3). Resolves the target
 * Rombongan Belajar via `rombonganResolver` and confirms the active guru owns
 * it — i.e. has a beban_mengajar OR wali_kelas assignment to that rombel.
 * Admin (`akses:kelola`) manages every rombel school-wide and short-circuits
 * WITHOUT resolving. A guru without a linked PTK is refused outright.
 *
 * `rombonganResolver` is lazy so admin never pays the resolution cost. If the
 * resolved rombel does not exist (cross-tenant / bogus id), no assignment row
 * matches → the guru is denied (no separate 404 — denies must not leak
 * existence).
 */
export async function assertPemilikRombongan(
  tx: Tx,
  akses: AksesAktif,
  rombonganResolver: () => Promise<string>
): Promise<void> {
  // Admin bypass: manages all Rombongan Belajar. (Not a superuser — the role
  // gate already bound, and pembatasan can still deny at gate 1.)
  if (akses.boleh("akses:kelola").diizinkan) return;

  const myPtkId = akses.pengguna?.ptkId ?? null;
  if (!myPtkId) {
    throw new KepemilikanError("Akun Anda belum terhubung dengan PTK. Hubungi admin.");
  }
  const rombonganBelajarId = await rombonganResolver();
  // Existence is implicit: a missing rombel has no assignment rows, so both
  // lookups return null and the guru is denied. (Resolved but unused — kept to
  // make the "does this rombel exist in this tenant?" intent explicit and to
  // anchor a future active-period tighten.)
  void (await cariRombonganBelajarById(tx, rombonganBelajarId));
  const [beban, wali] = await Promise.all([
    cariBebanMengajarByRombelDanPtk(tx, rombonganBelajarId, myPtkId),
    cariWaliKelasByRombelDanPtk(tx, rombonganBelajarId, myPtkId),
  ]);
  if (!beban && !wali) {
    throw new KepemilikanError("Anda tidak memiliki izin untuk Rombongan Belajar ini.");
  }
}

// ---------------------------------------------------------------------------
// Permintaan AI ownership (per-user surface).
//
// Unlike Beban Mengajar and Rombongan Belajar (which are PTK-owned), a
// permintaan_ai is per-user: row.dibuatOleh === akses.userId. Admin
// (`akses:kelola`) manages all requests school-wide and short-circuits.
// ---------------------------------------------------------------------------

/**
 * Ownership gate for per-user resources (Permintaan AI). Confirms the
 * resource was created by the active Pengguna. Admin (`akses:kelola`)
 * short-circuits without calling the resolver.
 *
 * `pemilikResolver` returns the `dibuatOleh` value from the already-loaded
 * row (the caller loads it for status checks anyway — no extra DB hit).
 */
export async function assertPemilikPermintaan(
  _tx: Tx,
  akses: AksesAktif,
  pemilikResolver: () => Promise<string>
): Promise<void> {
  if (akses.boleh("akses:kelola").diizinkan) return;

  const myUserId = akses.userId;
  const dibuatOleh = await pemilikResolver();
  if (dibuatOleh !== myUserId) {
    throw new KepemilikanError("Anda tidak memiliki izin untuk Permintaan AI ini.");
  }
}
