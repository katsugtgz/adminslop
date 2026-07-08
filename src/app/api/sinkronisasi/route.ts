import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { catatAudit, getDb, withTenant } from "@/db/client";
import { dbSchema } from "@/db/client";
import { listPenempatanByPesertaDidik } from "@/db/queries/penempatan-rombongan-belajar";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import {
  assertPemilikBeban,
  assertPemilikRombongan,
  bebanIdDariPenilaian,
  KepemilikanError,
  type AksesAktif,
} from "@/lib/auth/kepemilikan";
import { DraftAbsensiSchema, DraftNilaiSchema } from "@/lib/offline/schemas";
import type { AmplopDraft, DraftAbsensi, DraftNilai, ResponsSinkronisasi } from "@/lib/offline/types";

// NOTE: the spec proposed `src/app/dashboard/sinkronisasi/route.ts`. Next.js
// App Router forbids a `page.tsx` and a `route.ts` in the SAME route segment
// (the two collide on the path's handler). We split: the UI page lives at
// `/dashboard/sinkronisasi` (page.tsx) and this API endpoint lives at
// `/api/sinkronisasi` (route.ts), matching the existing `/api/auth/callback`
// convention. The client (`src/lib/offline/sync.ts`) fetches this path.
//
// SECURITY (identity doc §12 — hiding UI is not authorization): the route
// re-evaluates `getAksesSaya().boleh(...)` SERVER-SIDE on every call. The
// client-side sync queue is a convenience; this endpoint is the boundary.
// SECURITY (identity doc §13): `orgId` comes ONLY from
// `akses.membership.orgId` (the live WorkOS Keanggotaan). A tampered `tenantId`
// field in the body is deliberately NEVER read — tenant scoping happens via
// `withTenant(db, orgId, ...)` (RLS session GUC `app.tenant_id`).
//
// AC#4 (load-bearing): the UPDATE matches on (id, versi = clientVersi). When a
// newer server edit bumped versi past the client's value, 0 rows match →
// conflict. The server row is NOT overwritten — the client is told the current
// versi so it can refresh.

export const dynamic = "force-dynamic";

/**
 * Resolve an existing nilai_peserta_didik row by its natural key
 * (penilaianId, pesertaDidikId). RLS scopes the read to the active tenant — a
 * cross-tenant key resolves to null (a deny).
 */
async function cariNilaiByNaturalKey(
  tx: Parameters<Parameters<typeof withTenant>[2]>[0],
  penilaianId: string,
  pesertaDidikId: string
) {
  const found = await tx
    .select()
    .from(dbSchema.nilaiPesertaDidik)
    .where(
      and(
        eq(dbSchema.nilaiPesertaDidik.penilaianId, penilaianId),
        eq(dbSchema.nilaiPesertaDidik.pesertaDidikId, pesertaDidikId)
      )
    );
  return found[0] ?? null;
}

/**
 * Resolve an existing absensi_harian row by its natural key (pesertaDidikId,
 * tanggal). RLS scopes the read to the active tenant.
 */
async function cariAbsensiByNaturalKey(
  tx: Parameters<Parameters<typeof withTenant>[2]>[0],
  pesertaDidikId: string,
  tanggal: string
) {
  const found = await tx
    .select()
    .from(dbSchema.absensiHarian)
    .where(
      and(
        eq(dbSchema.absensiHarian.pesertaDidikId, pesertaDidikId),
        eq(dbSchema.absensiHarian.tanggal, tanggal)
      )
    );
  return found[0] ?? null;
}

/**
 * AC#4 upsert for a Nilai draft. When the server row exists and its `versi`
 * matches the client's, apply the edit and bump `versi`. When the row exists
 * but `versi` differs, refuse (conflict). When the row does not exist, INSERT
 * (a brand-new offline edit). Returns the sync response.
 *
 * C1 (security): an OWNERSHIP gate ({@linkcode assertPemilikBeban}) runs BEFORE
 * any write — the active guru must own the Beban Mengajar that owns the target
 * Penilaian (admin bypasses). Without this, a hostile guru could sync a draft
 * referencing ANOTHER guru's `penilaianId` and overwrite their nilai.
 */
async function terapkanDraftNilai(
  orgId: string,
  akses: AksesAktif,
  userId: string,
  draft: DraftNilai
): Promise<ResponsSinkronisasi> {
  const { db } = getDb();
  return withTenant(db, orgId, async (tx) => {
    // C1 gate 2: ownership (admin bypasses; guru must own the Penilaian's
    // Beban Mengajar). Runs before the read AND before either write branch so
    // no write can occur without ownership, conflict-path or otherwise.
    await assertPemilikBeban(tx, akses, () =>
      bebanIdDariPenilaian(tx, draft.penilaianId)
    );

    const existing = await cariNilaiByNaturalKey(
      tx,
      draft.penilaianId,
      draft.pesertaDidikId
    );

    if (!existing) {
      const [row] = await tx
        .insert(dbSchema.nilaiPesertaDidik)
        .values({
          penilaianId: draft.penilaianId,
          pesertaDidikId: draft.pesertaDidikId,
          nilai: String(draft.nilai),
          catatan: draft.catatan ?? null,
          versi: 1,
        })
        .returning();
      await catatAudit(tx, {
        aktor: userId,
        aksi: "sync_offline_nilai_buat",
        target: `nilai:${row.id}`,
        beban: { penilaianId: draft.penilaianId, pesertaDidikId: draft.pesertaDidikId },
      });
      return { status: "ok" as const, versi: 1 };
    }

    // AC#4: optimistic concurrency. Match on (id, versi = client's view).
    if (existing.versi !== draft.versi) {
      return { status: "konflik" as const, versi: existing.versi };
    }

    const versiBaru = existing.versi + 1;
    const updated = await tx
      .update(dbSchema.nilaiPesertaDidik)
      .set({
        nilai: String(draft.nilai),
        catatan: draft.catatan ?? null,
        versi: versiBaru,
      })
      .where(
        and(
          eq(dbSchema.nilaiPesertaDidik.id, existing.id),
          eq(dbSchema.nilaiPesertaDidik.versi, draft.versi)
        )
      )
      .returning();

    if (updated.length === 0) {
      // Lost the race between the SELECT above and this UPDATE — another sync
      // bumped versi in between. Treat as a conflict (AC#4).
      return { status: "konflik" as const, versi: versiBaru };
    }

    await catatAudit(tx, {
      aktor: userId,
      aksi: "sync_offline_nilai_ubah",
      target: `nilai:${existing.id}`,
      beban: {
        versiLama: draft.versi,
        versiBaru,
        nilai: draft.nilai,
      },
    });
    return { status: "ok" as const, versi: versiBaru };
  });
}

/**
 * AC#4 upsert for an Absensi draft. Same versi-match logic as nilai. New rows
 * carry `metode_input` from the draft; existing rows preserve their original
 * `metode_input` + `sumber_qr` (AC#3 correctable invariant from #15).
 *
 * C3 (security): an OWNERSHIP gate ({@linkcode assertPemilikRombongan}) runs
 * BEFORE any write — the active guru must own the target Rombongan Belajar via
 * a beban_mengajar or wali_kelas assignment (admin bypasses). Without this, a
 * hostile guru could sync attendance for ANY rombel id.
 */
async function terapkanDraftAbsensi(
  orgId: string,
  akses: AksesAktif,
  userId: string,
  draft: DraftAbsensi
): Promise<ResponsSinkronisasi> {
  const { db } = getDb();
  return withTenant(db, orgId, async (tx) => {
    // C3 gate 2: ownership of the draft's Rombongan Belajar for NEW rows
    // (admin bypasses). Existing rows are re-checked against the server row's
    // rombel below; the draft rombel is client-supplied and not authoritative
    // for updates.
    await assertPemilikRombongan(tx, akses, () => Promise.resolve(draft.rombonganBelajarId));

    const existing = await cariAbsensiByNaturalKey(
      tx,
      draft.pesertaDidikId,
      draft.tanggal
    );

    if (!existing) {
      // BUGS-03: placement check for the new-row path. The draft's
      // rombonganBelajarId is client-supplied; without this gate a guru who
      // owns the rombel could INSERT attendance for a peserta didik who is NOT
      // enrolled in that class. Mirrors `catatAbsensi` in
      // dashboard/absensi/actions.ts. Throws KepemilikanError so the denial
      // surfaces as 403 (not a 500 leak).
      const penempatan = await listPenempatanByPesertaDidik(
        tx,
        draft.pesertaDidikId
      );
      if (
        !penempatan.some((p) => p.rombonganBelajarId === draft.rombonganBelajarId)
      ) {
        throw new KepemilikanError(
          "Peserta Didik tidak terdaftar di Rombongan Belajar ini."
        );
      }
      const [row] = await tx
        .insert(dbSchema.absensiHarian)
        .values({
          pesertaDidikId: draft.pesertaDidikId,
          rombonganBelajarId: draft.rombonganBelajarId,
          tanggal: draft.tanggal,
          statusKehadiran: draft.status,
          metodeInput: draft.metode,
          catatan: draft.catatan ?? null,
          dibuatOleh: userId,
          versi: 1,
        })
        .returning();
      await catatAudit(tx, {
        aktor: userId,
        aksi: "sync_offline_absensi_buat",
        target: `absensi:${row.id}`,
        beban: {
          pesertaDidikId: draft.pesertaDidikId,
          tanggal: draft.tanggal,
          status: draft.status,
        },
      });
      return { status: "ok" as const, versi: 1 };
    }

    // Version conflict check before the per-update ownership assert: `existing`
    // is already tenant-scoped via `withTenant` + RLS, and `versi` is a
    // monotonic counter — not sensitive. The ownership assert below still runs
    // before any mutation, so we don't broaden the write boundary; we only
    // short-circuit no-op conflict paths without awaiting the assert.
    if (existing.versi !== draft.versi) {
      return { status: "konflik" as const, versi: existing.versi };
    }

    await assertPemilikRombongan(tx, akses, () => Promise.resolve(existing.rombonganBelajarId));

    const versiBaru = existing.versi + 1;
    const updated = await tx
      .update(dbSchema.absensiHarian)
      .set({
        statusKehadiran: draft.status,
        catatan: draft.catatan ?? null,
        diperbaruiPada: sql`now()`,
        versi: versiBaru,
      })
      .where(
        and(
          eq(dbSchema.absensiHarian.id, existing.id),
          eq(dbSchema.absensiHarian.versi, draft.versi)
        )
      )
      .returning();

    if (updated.length === 0) {
      return { status: "konflik" as const, versi: versiBaru };
    }

    await catatAudit(tx, {
      aktor: userId,
      aksi: "sync_offline_absensi_ubah",
      target: `absensi:${existing.id}`,
      beban: {
        versiLama: draft.versi,
        versiBaru,
        status: draft.status,
      },
    });
    return { status: "ok" as const, versi: versiBaru };
  });
}

/**
 * SEC-07: same-origin guard. Browsers always send `Origin` on a state-changing
 * request (POST here), so a missing Origin is treated as hostile (403). When
 * present, its `.origin` (scheme+host+port) MUST equal this server's origin —
 * a mismatch is a CSRF-style probe and is refused before any auth/DB work.
 * This complements — does not replace — AuthKit cookie auth + tenant resolution.
 */
function originDiperbolehkan(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

/**
 * POST /api/sinkronisasi — receive one draft envelope and apply it. Body shape
 * is {@linkcode AmplopDraft}. Returns {@linkcode ResponsSinkronisasi}.
 *
 * Authz: every draft requires its owning feature's `:buat` izin (the sync is a
 * write). An inactive tenant resolution (denied / choose) yields 401. A missing
 * izin yields 403. An unrecognized envelope yields 400.
 */
export async function POST(req: Request): Promise<NextResponse<ResponsSinkronisasi>> {
  // SEC-07: reject cross-origin POSTs before any auth/DB work.
  if (!originDiperbolehkan(req)) {
    return NextResponse.json<ResponsSinkronisasi>(
      { status: "error", pesan: "Asal permintaan tidak diizinkan." },
      { status: 403 }
    );
  }

  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    return NextResponse.json<ResponsSinkronisasi>(
      { status: "error", pesan: "Satuan Pendidikan Aktif belum dipilih." },
      { status: 401 }
    );
  }

  let amplop: AmplopDraft;
  try {
    amplop = (await req.json()) as AmplopDraft;
  } catch {
    return NextResponse.json<ResponsSinkronisasi>(
      { status: "error", pesan: "Body bukan JSON yang valid." },
      { status: 400 }
    );
  }

  if (amplop.tipe === "nilai") {
    if (!akses.boleh("penilaian:buat").diizinkan) {
      return NextResponse.json<ResponsSinkronisasi>(
        { status: "error", pesan: "Anda tidak memiliki izin untuk Penilaian." },
        { status: 403 }
      );
    }
    // C14: runtime-validate the draft envelope. Replaces the unchecked
    // `as DraftNilai` cast — a hostile body with a non-numeric `nilai` or an
    // unknown enum no longer reaches the DB write.
    let draft: DraftNilai;
    try {
      draft = DraftNilaiSchema.parse(amplop.draft);
    } catch {
      return NextResponse.json<ResponsSinkronisasi>(
        { status: "error", pesan: "Draft Nilai tidak valid." },
        { status: 400 }
      );
    }
    try {
      const hasil = await terapkanDraftNilai(
        akses.membership.orgId,
        akses,
        akses.userId,
        draft
      );
      return NextResponse.json<ResponsSinkronisasi>(hasil);
    } catch (err) {
      // C1: ownership denial — the guru does not own the target Beban Mengajar.
      // KepemilikanError -> 403 (Bahasa message preserved); anything else is a
      // DB/programming/audit failure -> 500 with a generic message (no leak).
      if (err instanceof KepemilikanError) {
        return NextResponse.json<ResponsSinkronisasi>(
          { status: "error", pesan: err.message },
          { status: 403 }
        );
      }
      return NextResponse.json<ResponsSinkronisasi>(
        { status: "error", pesan: "Terjadi kesalahan." },
        { status: 500 }
      );
    }
  }

  if (amplop.tipe === "absensi") {
    if (!akses.boleh("absensi:buat").diizinkan) {
      return NextResponse.json<ResponsSinkronisasi>(
        { status: "error", pesan: "Anda tidak memiliki izin untuk mencatat Absensi." },
        { status: 403 }
      );
    }
    // C14: runtime-validate the draft envelope (status/metode enums, tanggal
    // shape, positive-int versi). Replaces the unchecked `as DraftAbsensi` cast.
    let draft: DraftAbsensi;
    try {
      draft = DraftAbsensiSchema.parse(amplop.draft);
    } catch {
      return NextResponse.json<ResponsSinkronisasi>(
        { status: "error", pesan: "Draft Absensi tidak valid." },
        { status: 400 }
      );
    }
    try {
      const hasil = await terapkanDraftAbsensi(
        akses.membership.orgId,
        akses,
        akses.userId,
        draft
      );
      return NextResponse.json<ResponsSinkronisasi>(hasil);
    } catch (err) {
      // C3: ownership denial — the guru does not own the target Rombongan Belajar.
      // KepemilikanError -> 403 (Bahasa message preserved); anything else is a
      // DB/programming/audit failure -> 500 with a generic message (no leak).
      if (err instanceof KepemilikanError) {
        return NextResponse.json<ResponsSinkronisasi>(
          { status: "error", pesan: err.message },
          { status: 403 }
        );
      }
      return NextResponse.json<ResponsSinkronisasi>(
        { status: "error", pesan: "Terjadi kesalahan." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json<ResponsSinkronisasi>(
    { status: "error", pesan: "Tipe draft tidak dikenal." },
    { status: 400 }
  );
}
