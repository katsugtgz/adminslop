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
  const updateReturning = { current: [{ id: "mock_row" }] as unknown[] };
  function snakeToCamel(s: string): string {
    return s.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());
  }
  function isEqualityParam(
    c: unknown
  ): c is { value: unknown; encoder: { name: string } } {
    if (!c || typeof c !== "object") return false;
    const enc = (c as { encoder?: { name?: unknown } }).encoder;
    return !!enc && typeof enc.name === "string";
  }
  function collectEqualities(
    node: unknown,
    out: { col: string; val: unknown }[] = []
  ): typeof out {
    if (!node || typeof node !== "object") return out;
    if (isEqualityParam(node)) {
      out.push({ col: node.encoder.name, val: node.value });
      return out;
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) for (const c of chunks) collectEqualities(c, out);
    return out;
  }
  const fakeTxLocal = {
    // CONTRACT-ENFORCING `.where`: introspects the drizzle eq/and Param chunks (encoder.name + value) to actually filter fixture rows, so an omitted or mis-specified ownership predicate FAILS the test rather than silently passing. `insert`/`update` are write-path spies for deny assertions.
    select: () => ({
      from: (table: unknown) => ({
        where: (expr: unknown) => {
          const rows = tableRows.get(table) ?? [];
          const preds = collectEqualities(expr);
          // Fail closed: bila mock tak bisa deteksi equality pred, throw —
          // jangan return all rows (silent pass bila prod lupa .where(eq(...))).
          if (preds.length === 0) {
            throw new Error(
              "Mock .where() received no supported equality predicates.",
            );
          }
          const filtered = rows.filter((r) => {
            const row = r as Record<string, unknown>;
            return preds.every(
              (p) => row[snakeToCamel(p.col)] === p.val || row[p.col] === p.val
            );
          }) as unknown[] & { orderBy?: () => unknown[] };
          // listPenempatanByPesertaDidik chains `.orderBy(asc(...))`. Fixture
          // order is irrelevant to the route's `.some()` check, so a no-op
          // keeps the WHERE contract intact without modeling sort direction.
          filtered.orderBy = () => filtered;
          return filtered;
        },
      }),
    }),
    insert: vi.fn(() => ({
      values: () => ({ returning: async () => [{ id: "mock_row" }] }),
    })),
    // `updateReturning.current` is the row set returned by UPDATE...RETURNING.
    // Default = one row (happy UPDATE). The AC#4 lost-race test sets it to []
    // to simulate 0 rows matching the (id, versi) predicate.
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({ returning: async () => updateReturning.current }),
      }),
    })),
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
    updateReturning,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  fakeTx: fakeTxRef,
  tableRows,
  updateReturning,
} = mocks;

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
  absensi?: unknown[];
  penempatan?: unknown[];
}): void {
  tableRows.clear();
  if (opts.penilaian) tableRows.set(dbSchema.penilaian, opts.penilaian);
  if (opts.komponen) tableRows.set(dbSchema.komponenNilai, opts.komponen);
  if (opts.beban) tableRows.set(dbSchema.bebanMengajar, opts.beban);
  if (opts.rombel) tableRows.set(dbSchema.rombonganBelajar, opts.rombel);
  if (opts.wali) tableRows.set(dbSchema.waliKelas, opts.wali);
  if (opts.absensi) tableRows.set(dbSchema.absensiHarian, opts.absensi);
  if (opts.penempatan)
    tableRows.set(dbSchema.penempatanRombonganBelajar, opts.penempatan);
}

/** Build a POST Request whose JSON body is `body`. Sends a same-origin
 * `Origin` header so requests clear the SEC-07 origin gate (browsers always
 * send Origin on POST); cross-origin rejection is covered in its own test. */
function postJson(body: unknown): Request {
  return new Request("http://localhost/api/sinkronisasi", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
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
  fakeTxRef.insert.mockClear();
  fakeTxRef.update.mockClear();
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(async (_db, _tenantId, fn) => fn(fakeTxRef));
  catatAudit.mockResolvedValue(undefined);
  tableRows.clear();
  updateReturning.current = [{ id: "mock_row" }];
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
    // Ownership message surfaces verbatim (KepemilikanError -> 403 path).
    expect(body.pesan).toBe("Anda tidak memiliki izin untuk Beban Mengajar ini.");
    // Gate denies BEFORE any write — the post-gate DB write + audit never run.
    expect(fakeTxRef.insert).not.toHaveBeenCalled();
    expect(fakeTxRef.update).not.toHaveBeenCalled();
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
    // Ownership message surfaces verbatim (KepemilikanError -> 403 path).
    expect(body.pesan).toBe("Anda tidak memiliki izin untuk Rombongan Belajar ini.");
    // Gate denies BEFORE any write — the post-gate DB write + audit never run.
    expect(fakeTxRef.insert).not.toHaveBeenCalled();
    expect(fakeTxRef.update).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

describe("C3: absensi update uses existing row's rombel for ownership", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: "ptk_A" }));
    aturFixtures({
      rombel: [{ id: "rombel_A" }, { id: "rombel_B" }],
      beban: [
        { rombonganBelajarId: "rombel_A", ptkId: "ptk_A" },
        { rombonganBelajarId: "rombel_B", ptkId: "ptk_B" },
      ],
      absensi: [
        {
          id: "absensi_B",
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_B",
          tanggal: "2026-04-01",
          versi: 1,
        },
      ],
    });
  });

  it("2b. draft claims owned rombel_A but existing row is rombel_B -> 403", async () => {
    const res = await POST(
      postJson({
        tipe: "absensi",
        draft: { ...DRAFT_ABSENSI_VALID, rombonganBelajarId: "rombel_A" },
      })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.pesan).toBe("Anda tidak memiliki izin untuk Rombongan Belajar ini.");
    expect(fakeTxRef.update).not.toHaveBeenCalled();
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

// ===========================================================================
// TESTS-02 — Block B: happy-path writes + AC#4 optimistic-concurrency paths.
// Admin bypasses ownership so fixtures model only the data path. Covers the
// four distinct sync branches the C1/C3/C14 denies above do NOT exercise:
//   B.1 INSERT (no existing row)          -> ok / versi 1
//   B.2 UPDATE (versi matches)            -> ok / versi N+1
//   B.3 conflict (versi mismatch)         -> konflik / server versi (no write)
//   B.4 conflict (lost race: returning[]) -> konflik / versi N+1 (no write)
// ===========================================================================

describe("B. happy path + AC#4 conflict", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("B.1 no existing row -> INSERT -> 200 ok / versi 1 + audit", async () => {
    // No nilai_peserta_didik fixture -> natural-key lookup resolves null ->
    // INSERT branch. Admin bypasses the Beban ownership gate.
    aturFixtures({});
    const res = await POST(postJson({ tipe: "nilai", draft: DRAFT_NILAI_VALID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", versi: 1 });
    expect(fakeTxRef.insert).toHaveBeenCalledTimes(1);
    expect(fakeTxRef.update).not.toHaveBeenCalled();
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("B.2 existing row, versi matches -> UPDATE -> 200 ok / versi N+1 + audit", async () => {
    // Server row at versi 1; client draft also versi 1 -> match -> UPDATE bumps
    // to versi 2. The mock UPDATE...RETURNING yields one row (default).
    aturFixtures({});
    tableRows.set(dbSchema.nilaiPesertaDidik, [
      { id: "nilai_1", penilaianId: "p_1", pesertaDidikId: "pd_1", versi: 1 },
    ]);
    const res = await POST(postJson({ tipe: "nilai", draft: DRAFT_NILAI_VALID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", versi: 2 });
    expect(fakeTxRef.update).toHaveBeenCalledTimes(1);
    expect(fakeTxRef.insert).not.toHaveBeenCalled();
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("B.3 versi mismatch (server ahead) -> 200 konflik / server versi; no write", async () => {
    // Server row at versi 2; client draft versi 1 -> stale -> konflik. The
    // server row is NOT overwritten; the client is told the current versi.
    aturFixtures({});
    tableRows.set(dbSchema.nilaiPesertaDidik, [
      { id: "nilai_1", penilaianId: "p_1", pesertaDidikId: "pd_1", versi: 2 },
    ]);
    const res = await POST(
      postJson({ tipe: "nilai", draft: { ...DRAFT_NILAI_VALID, versi: 1 } })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "konflik", versi: 2 });
    expect(fakeTxRef.insert).not.toHaveBeenCalled();
    expect(fakeTxRef.update).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("B.4 lost race (UPDATE returning []) -> 200 konflik / versi N+1; no audit", async () => {
    // versi matched at SELECT time, but another sync bumped it before the
    // UPDATE -> 0 rows match (id, versi) -> konflik. The audit MUST NOT run
    // (nothing was written). insert never runs; update ran but wrote nothing.
    aturFixtures({});
    tableRows.set(dbSchema.nilaiPesertaDidik, [
      { id: "nilai_1", penilaianId: "p_1", pesertaDidikId: "pd_1", versi: 1 },
    ]);
    updateReturning.current = [];
    const res = await POST(postJson({ tipe: "nilai", draft: DRAFT_NILAI_VALID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "konflik", versi: 2 });
    expect(fakeTxRef.update).toHaveBeenCalledTimes(1);
    expect(fakeTxRef.insert).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// BUGS-03 — absensi new-row placement gate. A guru/admin who owns the rombel
// must NOT insert attendance for a peserta didik who is NOT enrolled there.
// The gate throws KepemilikanError -> 403 (not a 500 leak). Placed students
// still insert successfully (the allow direction).
// ===========================================================================

describe("BUGS-03: absensi placement gate on new-row insert", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("placed student -> INSERT -> 200 ok / versi 1", async () => {
    aturFixtures({
      penempatan: [
        { pesertaDidikId: "pd_1", rombonganBelajarId: "rombel_1", status: "aktif" },
      ],
    });
    const res = await POST(
      postJson({ tipe: "absensi", draft: DRAFT_ABSENSI_VALID })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", versi: 1 });
    expect(fakeTxRef.insert).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("unplaced student -> 403 KepemilikanError; no write", async () => {
    // pd_1 is placed in rombel_OTHER, but the draft targets rombel_1.
    aturFixtures({
      penempatan: [{ pesertaDidikId: "pd_1", rombonganBelajarId: "rombel_OTHER" }],
    });
    const res = await POST(
      postJson({ tipe: "absensi", draft: DRAFT_ABSENSI_VALID })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.pesan).toBe(
      "Peserta Didik tidak terdaftar di Rombongan Belajar ini."
    );
    expect(fakeTxRef.insert).not.toHaveBeenCalled();
    expect(fakeTxRef.update).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// SEC-07 — same-origin guard. A missing Origin (non-browser probe) and a
// cross-origin Origin are both rejected with 403 BEFORE any auth/DB work.
// ===========================================================================

describe("SEC-07: origin gate rejects before auth", () => {
  it("missing Origin header -> 403; no auth resolution", async () => {
    const req = new Request("http://localhost/api/sinkronisasi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tipe: "nilai", draft: DRAFT_NILAI_VALID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(getAksesSaya).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("cross-origin Origin -> 403; no auth resolution", async () => {
    const req = new Request("http://localhost/api/sinkronisasi", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ tipe: "nilai", draft: DRAFT_NILAI_VALID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(getAksesSaya).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});
