import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// Regression coverage for the three security findings fixed in this route:
//   C1  — terapkanDraftNilai ownership gate (guru-A cannot sync guru-B's nilai)
//   C3  — terapkanDraftAbsensi ownership gate (guru-A cannot sync guru-B's rombel)
//   C14 — zod runtime validation replaces unchecked `as Draft*` casts
//
// Mock surface mirrors penilaian/actions.test.ts + absensi/actions.test.ts:
// preserve the REAL dbSchema (table object refs) so the ownership resolvers in
// @/lib/auth/kepemilikan and this test's fixture Map share identical keys.
// @/lib/auth/kepemilikan + @/lib/offline/schemas run for REAL (not mocked) —
// only the authz + DB plumbing is stubbed.

const mocks = vi.hoisted(() => {
  const tableRows = new Map<unknown, unknown[]>();
  const fakeTxLocal = {
    select: () => ({ from: (table: unknown) => tableRows.get(table) ?? [] }),
  };
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTxLocal)
    ),
    catatAudit: vi.fn(async () => undefined),
    fakeTx: fakeTxLocal,
    tableRows,
  };
});

const { getAksesSaya, getDb, withTenant, catatAudit, fakeTx: fakeTxRef, tableRows } =
  mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return {
    getDb: mocks.getDb,
    withTenant: mocks.withTenant,
    catatAudit: mocks.catatAudit,
    dbSchema: actual.dbSchema,
  };
});

import { dbSchema } from "@/db/client";
import { POST } from "./route";

// --- helpers ---------------------------------------------------------------

function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[]; ptkId?: string | null }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const ptkId = opts?.ptkId ?? "ptk_A";
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "akses:kelola",
      "akses:baca",
      "penilaian:baca",
      "penilaian:buat",
      "penilaian:ubah",
      "absensi:baca",
      "absensi:buat",
      "absensi:ubah",
    ],
    dev: [
      "akses:kelola",
      "akses:baca",
      "penilaian:baca",
      "penilaian:buat",
      "penilaian:ubah",
      "absensi:baca",
      "absensi:buat",
      "absensi:ubah",
    ],
    kepala_sekolah: ["akses:baca", "penilaian:baca", "absensi:baca"],
    guru: [
      "penilaian:baca",
      "penilaian:buat",
      "penilaian:ubah",
      "absensi:baca",
      "absensi:buat",
      "absensi:ubah",
    ],
    wali_kelas: ["penilaian:baca", "absensi:baca"],
  };
  const boleh = (diminta: IzinSlug): KeputusanAkses => {
    if (pembatasan.includes(diminta))
      return { diizinkan: false, sumber: "pembatasan" as const };
    if (izin.includes(diminta))
      return { diizinkan: true, sumber: "izin" as const };
    if (defaults[roleSlug].includes(diminta))
      return { diizinkan: true, sumber: "peran" as const };
    return { diizinkan: false, sumber: "tidak_ada_izin" as const };
  };
  return {
    status: "active",
    membership: { orgId: "org_A", orgName: "Sekolah A", roleSlug },
    userId: "workos_u_1",
    pengguna: {
      id: "pg_1",
      tenantId: "org_A",
      userId: "workos_u_1",
      peranAkses: roleSlug,
      ptkId,
      nama: "Guru A",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    },
    izin,
    pembatasan,
    boleh,
  };
}

function aturFixtures(opts: {
  penilaian?: unknown[];
  komponen?: unknown[];
  beban?: unknown[];
  rombel?: unknown[];
  wali?: unknown[];
}): void {
  tableRows.clear();
  if (opts.penilaian) tableRows.set(dbSchema.penilaian, opts.penilaian);
  if (opts.komponen) tableRows.set(dbSchema.komponenNilai, opts.komponen);
  if (opts.beban) tableRows.set(dbSchema.bebanMengajar, opts.beban);
  if (opts.rombel) tableRows.set(dbSchema.rombonganBelajar, opts.rombel);
  if (opts.wali) tableRows.set(dbSchema.waliKelas, opts.wali);
}

/** Build a POST Request whose JSON body is `body`. */
function postJson(body: unknown): Request {
  return new Request("http://localhost/api/sinkronisasi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const DRAFT_NILAI_VALID = {
  id: "d1",
  penilaianId: "p_1",
  pesertaDidikId: "pd_1",
  nilai: 80,
  versi: 1,
  dibuatPada: "2026-01-01T00:00:00Z",
};

const DRAFT_ABSENSI_VALID = {
  id: "d1",
  pesertaDidikId: "pd_1",
  rombonganBelajarId: "rombel_1",
  tanggal: "2026-04-01",
  status: "hadir",
  metode: "manual",
  versi: 1,
  dibuatPada: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  getAksesSaya.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(async (_db, _tenantId, fn) => fn(fakeTxRef));
  catatAudit.mockResolvedValue(undefined);
  tableRows.clear();
});

// ===========================================================================
// C1 — Penilaian sync ownership bypass is closed. guru-A (ptk_A) sends a nilai
// draft whose penilaianId resolves to a Beban Mengajar owned by guru-B
// (ptk_B). The route MUST return 403; no write/audit may run.
// ===========================================================================

describe("C1: guru-A syncing guru-B's nilai -> 403 (ownership denied)", () => {
  beforeEach(() => {
    // Full ownership chain present, but the beban is owned by a DIFFERENT guru.
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: "ptk_A" }));
    aturFixtures({
      penilaian: [{ id: "p_1", komponenNilaiId: "kn_1" }],
      komponen: [{ id: "kn_1", bebanMengajarId: "bm_X" }],
      beban: [{ id: "bm_X", ptkId: "ptk_B" }],
    });
  });

  it("1. POST tipe=nilai (penilaian p_1 -> kn_1 -> bm_X owned by ptk_B) -> 403", async () => {
    const res = await POST(postJson({ tipe: "nilai", draft: DRAFT_NILAI_VALID }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// C3 — Absensi sync ownership gap is closed. guru-A (ptk_A) sends an absensi
// draft for a Rombongan Belajar owned by guru-B (ptk_B). The route MUST return
// 403; no write/audit may run.
// ===========================================================================

describe("C3: guru-A syncing guru-B's rombel absensi -> 403 (ownership denied)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: "ptk_A" }));
    aturFixtures({
      rombel: [{ id: "rombel_1" }],
      beban: [{ rombonganBelajarId: "rombel_1", ptkId: "ptk_B" }],
    });
  });

  it("2. POST tipe=absensi (rombel_1 owned by ptk_B) -> 403", async () => {
    const res = await POST(
      postJson({ tipe: "absensi", draft: DRAFT_ABSENSI_VALID })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// C14 — zod runtime validation. A hostile/buggy body with a wrong-typed field
// or an unknown enum is rejected with 400 BEFORE any DB work. Replaces the
// prior unchecked `as DraftNilai` / `as DraftAbsensi` casts.
// ===========================================================================

describe("C14: malformed draft envelope -> 400 (zod rejects)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: "ptk_A" }));
  });

  it("3. nilai draft with non-numeric `nilai` -> 400; no write", async () => {
    const res = await POST(
      postJson({
        tipe: "nilai",
        draft: { ...DRAFT_NILAI_VALID, nilai: "bukan-angka" },
      })
    );
    expect(res.status).toBe(400);
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("4. nilai draft with non-positive `versi` -> 400", async () => {
    const res = await POST(
      postJson({
        tipe: "nilai",
        draft: { ...DRAFT_NILAI_VALID, versi: 0 },
      })
    );
    expect(res.status).toBe(400);
  });

  it("5. absensi draft with unknown `status` enum -> 400; no write", async () => {
    const res = await POST(
      postJson({
        tipe: "absensi",
        draft: { ...DRAFT_ABSENSI_VALID, status: "bolos" },
      })
    );
    expect(res.status).toBe(400);
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("6. absensi draft with bad `tanggal` shape -> 400", async () => {
    const res = await POST(
      postJson({
        tipe: "absensi",
        draft: { ...DRAFT_ABSENSI_VALID, tanggal: "1 April 2026" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("7. absensi draft with unknown `metode` enum -> 400", async () => {
    const res = await POST(
      postJson({
        tipe: "absensi",
        draft: { ...DRAFT_ABSENSI_VALID, metode: "rfid" },
      })
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// Gate-1 sanity: a role lacking the write izin is denied at the role gate
// BEFORE ownership or zod runs (403, no withTenant).
// ===========================================================================

describe("gate-1: wali_kelas (read-only) -> 403 before any work", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas", { ptkId: "ptk_A" }));
  });

  it("8. POST tipe=nilai as wali_kelas -> 403 /izin/; no DB", async () => {
    const res = await POST(postJson({ tipe: "nilai", draft: DRAFT_NILAI_VALID }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.pesan).toMatch(/izin/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("9. non-active akses (denied) -> 401", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    const res = await POST(postJson({ tipe: "nilai", draft: DRAFT_NILAI_VALID }));
    expect(res.status).toBe(401);
  });

  it("10. unrecognized envelope tipe -> 400", async () => {
    const res = await POST(postJson({ tipe: "lainnya", draft: {} }));
    expect(res.status).toBe(400);
  });
});
