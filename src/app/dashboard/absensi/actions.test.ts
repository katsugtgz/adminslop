import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors src/app/dashboard/akses/actions.test.ts + penilaian/actions.test.ts:
// hoist all mocks, mock the modules to wire them in, then import the actions
// under test.
//
// OWNERSHIP CHAIN (C3): absensi is now rombel-ownership-gated via
// assertPemilikRombongan (in @/lib/auth/kepemilikan), which resolves
// beban_mengajar / wali_kelas rows by (rombonganBelajarId, ptkId) via
// `tx.select().from(table)` + a JS `.find`. We therefore mock `withTenant` to
// run each callback with a `fakeTx` whose `select().from(table)` returns a
// per-table fixture array keyed by the REAL schema table object (re-exported
// through the `@/db/client` mock via importOriginal). Populating the Map per
// test lets us prove the ownership decision end-to-end (allow + deny).

const mocks = vi.hoisted(() => {
  // Per-table fixture rows, keyed by the real dbSchema table object reference.
  const tableRows = new Map<unknown, unknown[]>();
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
    // CONTRACT-ENFORCING `.where`: introspects the drizzle eq/and Param chunks (encoder.name + value) to actually filter fixture rows, so an omitted or mis-specified ownership predicate FAILS the test rather than silently passing.
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
          return rows.filter((r) => {
            const row = r as Record<string, unknown>;
            return preds.every(
              (p) => row[snakeToCamel(p.col)] === p.val || row[p.col] === p.val
            );
          });
        },
      }),
    }),
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
    catatAbsensi: vi.fn(async () => ({ id: "absensi_new" })),
    ubahAbsensi: vi.fn(async () => ({ id: "absensi_1" })),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
    tableRows,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  catatAbsensi,
  ubahAbsensi,
  revalidatePath,
  fakeTx: fakeTxRef,
  tableRows,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
// Preserve the REAL dbSchema (table object refs) so the action's ownership
// resolvers (in @/lib/auth/kepemilikan) and this test's fixture Map share
// identical keys.
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return {
    getDb: mocks.getDb,
    withTenant: mocks.withTenant,
    catatAudit: mocks.catatAudit,
    dbSchema: actual.dbSchema,
  };
});
vi.mock("@/db/queries/absensi", () => ({
  catatAbsensi: mocks.catatAbsensi,
  ubahAbsensi: mocks.ubahAbsensi,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { dbSchema } from "@/db/client";
import { catatAbsensiAction, ubahAbsensiAction } from "./actions";

// --- helpers ---------------------------------------------------------------

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

/** `expect.anything()` stand-in for the fakeTx passed as the first repo arg. */
const TX = expect.anything();
/** `expect.anything()` stand-in for the db passed as first withTenant arg. */
const DB = expect.anything();

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default). Mirrors the
 * helper in penilaian/actions.test.ts. `ptkId` threads the C3 ownership
 * identity — defaults to "ptk_A" (the owner of fixture rombel_1); null = guru
 * not linked to a PTK.
 */
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
      "absensi:baca",
      "absensi:buat",
      "absensi:ubah",
    ],
    dev: [
      "akses:kelola",
      "akses:baca",
      "absensi:baca",
      "absensi:buat",
      "absensi:ubah",
    ],
    kepala_sekolah: ["akses:baca", "absensi:baca"],
    guru: ["absensi:baca", "absensi:buat", "absensi:ubah"],
    wali_kelas: ["absensi:baca"],
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

/** Populate the fakeTx fixture rows for the C3 ownership lookup (cleared first). */
function aturFixtures(opts: {
  beban?: unknown[];
  wali?: unknown[];
  rombel?: unknown[];
  absensi?: unknown[];
}): void {
  tableRows.clear();
  if (opts.beban) tableRows.set(dbSchema.bebanMengajar, opts.beban);
  if (opts.wali) tableRows.set(dbSchema.waliKelas, opts.wali);
  if (opts.rombel) tableRows.set(dbSchema.rombonganBelajar, opts.rombel);
  if (opts.absensi) tableRows.set(dbSchema.absensiHarian, opts.absensi);
}

beforeEach(() => {
  getAksesSaya.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  catatAbsensi.mockReset();
  ubahAbsensi.mockReset();
  revalidatePath.mockReset();
  // restore default implementations cleared by mockReset
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(async (_db, _tenantId, fn) => fn(fakeTxRef));
  catatAbsensi.mockResolvedValue({ id: "absensi_new" });
  ubahAbsensi.mockResolvedValue({ id: "absensi_1" });
  catatAudit.mockResolvedValue(undefined);
  // Default C3 ownership fixtures: guru ptk_A owns rombel_1 via beban_mengajar,
  // and absensi_1 lives under rombel_1. Cleared per test; deny tests override.
  aturFixtures({
    beban: [{ rombonganBelajarId: "rombel_1", ptkId: "ptk_A" }],
    absensi: [{ id: "absensi_1", rombonganBelajarId: "rombel_1" }],
  });
});

// ===========================================================================
// A. Guru success — guru holds absensi:buat/ubah via peran default. The full
// catat/ubah flow runs: repo write + audit + revalidate.
// ===========================================================================

describe("A. guru success — absensi:buat/ubah via peran default", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("1. catatAbsensiAction -> catatAbsensi(dibuatOleh) + audit(catat_absensi) + revalidate", async () => {
    await catatAbsensiAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        tanggal: "2026-04-01",
        statusKehadiran: "hadir",
        catatan: "Tepat waktu",
      })
    );

    expect(catatAbsensi).toHaveBeenCalledWith(fakeTxRef, {
      pesertaDidikId: "pd_1",
      rombonganBelajarId: "rombel_1",
      tanggal: "2026-04-01",
      statusKehadiran: "hadir",
      metodeInput: undefined, // omitted → repo defaults to 'manual'
      catatan: "Tepat waktu",
      sumberQr: undefined,
      dibuatOleh: "workos_u_1",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "catat_absensi",
        target: "absensi:absensi_new",
        beban: {
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
          metodeInput: "manual",
        },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/absensi");
  });

  it("2. catatAbsensiAction with metodeInput=qr + sumberQr -> carries through; AC#3 still correctable", async () => {
    await catatAbsensiAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        tanggal: "2026-04-01",
        statusKehadiran: "hadir",
        metodeInput: "qr",
        sumberQr: "qr-token-abc",
      })
    );

    expect(catatAbsensi).toHaveBeenCalledWith(fakeTxRef, {
      pesertaDidikId: "pd_1",
      rombonganBelajarId: "rombel_1",
      tanggal: "2026-04-01",
      statusKehadiran: "hadir",
      metodeInput: "qr",
      catatan: undefined,
      sumberQr: "qr-token-abc",
      dibuatOleh: "workos_u_1",
    });
    // AC#3: still just an INSERT — no lock, no special-casing. catatAbsensi
    // was called exactly once; no ubahAbsensi.
    expect(catatAbsensi).toHaveBeenCalledTimes(1);
  });

  it("3. ubahAbsensiAction -> ubahAbsensi(id, perubahan) + audit(ubah_absensi) + revalidate", async () => {
    await ubahAbsensiAction(
      formData({
        id: "absensi_1",
        statusKehadiran: "izin",
        catatan: "Sakit demam",
      })
    );

    expect(ubahAbsensi).toHaveBeenCalledWith(fakeTxRef, "absensi_1", {
      statusKehadiran: "izin",
      catatan: "Sakit demam",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "ubah_absensi",
        target: "absensi:absensi_1",
        beban: {
          id: "absensi_1",
          perubahan: { statusKehadiran: "izin", catatan: "Sakit demam" },
        },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/absensi");
  });
});

// ===========================================================================
// B. Role denial (gate 1) — wali_kelas holds absensi:baca ONLY. Any write
// action MUST throw BEFORE any DB work. AC#4 gate 1.
// ===========================================================================

describe("B. role denial — wali_kelas (absensi:baca only)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
  });

  it("4. catatAbsensiAction -> throws /izin/i; catatAbsensi + audit NOT called", async () => {
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
        })
      )
    ).rejects.toThrow(/izin/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("5. ubahAbsensiAction -> throws /izin/i; ubahAbsensi NOT called", async () => {
    await expect(
      ubahAbsensiAction(
        formData({ id: "absensi_1", statusKehadiran: "izin" })
      )
    ).rejects.toThrow(/izin/i);
    expect(ubahAbsensi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary".
// The page hides write buttons for unauthorized roles, but a hostile client
// can bypass the UI and POST the action fn directly. The server MUST still
// decide correctly: guru succeeds; wali_kelas denied; guru WITH pembatasan
// denied (pembatasan wins, §13); admin succeeds.
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("6. guru calling catatAbsensiAction directly -> succeeds (guru holds absensi:buat)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    // Direct invocation — no page, no button, no fetch guard.
    await catatAbsensiAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        tanggal: "2026-04-01",
        statusKehadiran: "hadir",
      })
    );
    expect(catatAbsensi).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("7. wali_kelas calling catatAbsensiAction directly -> DENIED at role gate; no write", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
        })
      )
    ).rejects.toThrow(/izin/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("8. guru WITH pembatasan['absensi:buat'] calling directly -> DENIED (pembatasan wins, §13)", async () => {
    // guru ordinarily has absensi:buat via peran default. A pembatasan row
    // for that slug OVERRIDES the default — there is no superuser bypass.
    getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { pembatasan: ["absensi:buat"] })
    );
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
        })
      )
    ).rejects.toThrow(/izin/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("9. admin calling catatAbsensiAction directly -> succeeds (admin manages school-wide)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await catatAbsensiAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        tanggal: "2026-04-01",
        statusKehadiran: "hadir",
      })
    );
    expect(catatAbsensi).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// D. Manual validation failures (no zod).
// ===========================================================================

describe("D. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("10. catatAbsensiAction + empty pesertaDidikId -> /Peserta Didik wajib diisi/i", async () => {
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "  ",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
        })
      )
    ).rejects.toThrow(/Peserta Didik wajib diisi/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
  });

  it("11. catatAbsensiAction + bad statusKehadiran -> /Status Kehadiran tidak valid/i", async () => {
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "terlambat",
        })
      )
    ).rejects.toThrow(/Status Kehadiran tidak valid/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
  });

  it("12. catatAbsensiAction + bad tanggal shape -> /berformat YYYY-MM-DD/i", async () => {
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "1 April 2026",
          statusKehadiran: "hadir",
        })
      )
    ).rejects.toThrow(/berformat YYYY-MM-DD/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
  });

  it("13. catatAbsensiAction + bad metodeInput -> /Metode Input tidak valid/i", async () => {
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
          metodeInput: "rfid",
        })
      )
    ).rejects.toThrow(/Metode Input tidak valid/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
  });

  it("14. ubahAbsensiAction + no fields -> /Tidak ada perubahan/i", async () => {
    await expect(
      ubahAbsensiAction(formData({ id: "absensi_1" }))
    ).rejects.toThrow(/Tidak ada perubahan/i);
    expect(ubahAbsensi).not.toHaveBeenCalled();
  });

  it("15. ubahAbsensiAction + bad statusKehadiran -> /Status Kehadiran tidak valid/i", async () => {
    await expect(
      ubahAbsensiAction(
        formData({ id: "absensi_1", statusKehadiran: "bolos" })
      )
    ).rejects.toThrow(/Status Kehadiran tidak valid/i);
    expect(ubahAbsensi).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// E. Non-active context (denied / choose) — no active Satuan Pendidikan.
// ===========================================================================

describe("E. non-active akses context", () => {
  it("16. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
        })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("17. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    await expect(
      ubahAbsensiAction(
        formData({ id: "absensi_1", statusKehadiran: "izin" })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("F. tenant tamper-proofing", () => {
  it("18. bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await catatAbsensiAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        tanggal: "2026-04-01",
        statusKehadiran: "hadir",
        tenantId: "org_VICTIM",
      })
    );
    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(withTenant).toHaveBeenCalledWith(DB, "org_A", expect.anything());
    expect(withTenant).not.toHaveBeenCalledWith(
      DB,
      "org_VICTIM",
      expect.anything()
    );
  });
});

// ===========================================================================
// G. Dev role — mirrors admin (DEV_MEMBERSHIP_ALL flow). Both actions
// succeed; the action treats dev like admin (no special bypass).
// ===========================================================================

describe("G. dev role — mirrors admin (peran default carries absensi:buat/ubah)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("dev"));
  });

  it("19. catatAbsensiAction as dev -> catatAbsensi + audit called", async () => {
    await catatAbsensiAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        tanggal: "2026-04-01",
        statusKehadiran: "hadir",
      })
    );
    expect(catatAbsensi).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("20. ubahAbsensiAction as dev -> ubahAbsensi + audit called", async () => {
    await ubahAbsensiAction(
      formData({ id: "absensi_1", statusKehadiran: "izin" })
    );
    expect(ubahAbsensi).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// H. AC#4 DENY (C3) — guru does NOT own the Rombongan Belajar. Role gate
// passes (guru has absensi:buat/ubah), but ownership fails. The action MUST
// throw BEFORE the repo write. Mirrors penilaian/actions.test.ts block D.
// ===========================================================================

describe("H. C3 DENY — guru does NOT own the Rombongan Belajar", () => {
  beforeEach(() => {
    // guru ptk_A; rombel_1 is owned by a DIFFERENT guru (ptk_B). absensi_1
    // still lives under rombel_1 (for the ubah chain).
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: "ptk_A" }));
    aturFixtures({
      beban: [{ rombonganBelajarId: "rombel_1", ptkId: "ptk_B" }],
      absensi: [{ id: "absensi_1", rombonganBelajarId: "rombel_1" }],
    });
  });

  it("21. catatAbsensiAction (rombel owned by ptk_B) -> throws /Rombongan Belajar/i; catatAbsensi NOT called", async () => {
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
        })
      )
    ).rejects.toThrow(/Rombongan Belajar/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("22. ubahAbsensiAction (absensi_1 -> rombel owned by ptk_B) -> throws /Rombongan Belajar/i; ubahAbsensi NOT called", async () => {
    await expect(
      ubahAbsensiAction(
        formData({ id: "absensi_1", statusKehadiran: "izin" })
      )
    ).rejects.toThrow(/Rombongan Belajar/i);
    expect(ubahAbsensi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("23. admin still BYPASSES when the rombel is owned by nobody (bypass, not satisfaction)", async () => {
    // No beban / wali row links ANY ptk to rombel_1 — an admin succeeds anyway
    // (akses:kelola short-circuits ownership). Proves the deny above is an
    // ownership decision, not a missing-data artifact.
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    aturFixtures({
      absensi: [{ id: "absensi_1", rombonganBelajarId: "rombel_1" }],
    });
    await catatAbsensiAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        tanggal: "2026-04-01",
        statusKehadiran: "hadir",
      })
    );
    expect(catatAbsensi).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// I. wali_kelas-link ownership success — the (b) branch of
// assertPemilikRombongan. A guru with NO beban_mengajar but a wali_kelas row
// for the rombel is still the owner and may record attendance.
// ===========================================================================

describe("I. C3 ownership via wali_kelas (beban absent)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: "ptk_A" }));
    // No beban_mengajar for rombel_2, but a wali_kelas row links ptk_A to it.
    aturFixtures({
      wali: [{ rombonganBelajarId: "rombel_2", ptkId: "ptk_A" }],
    });
  });

  it("24. catatAbsensiAction (rombel_2 owned via wali_kelas) -> catatAbsensi called", async () => {
    await catatAbsensiAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_2",
        tanggal: "2026-04-01",
        statusKehadiran: "hadir",
      })
    );
    expect(catatAbsensi).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// J. Task #15 — QR data-path guardrail. Two invariants that must hold BEFORE
// the live-camera scanner UI lands:
//   (a) `metode_input='qr'` REQUIRES a non-empty `sumber_qr` token (audit-
//       trail integrity for AC#3 — a row with no provenance defeats the
//       correctable invariant).
//   (b) A `sumberQr` value carrying tenant B's marker, posted to tenant A's
//       action, does NOT leak tenant scope — `withTenant` uses
//       `akses.membership.orgId` regardless (identity doc §13). Mirrors the
//       test 18 pattern, specialized to the QR field.
// ===========================================================================

describe("J. Task #15 — QR guardrail (sumberQr required + cross-tenant deny)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("25. catatAbsensiAction + metodeInput=qr WITHOUT sumberQr -> throws /sumberQr wajib/i; no write", async () => {
    // AC#3 audit-trail integrity: a row marked qr-captured with no session
    // token defeats the correctable invariant. The guard rejects BEFORE any
    // DB work — no withTenant, no catatAbsensi, no audit.
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
          metodeInput: "qr",
          // sumberQr intentionally OMITTED
        })
      )
    ).rejects.toThrow(/Token Sesi QR wajib diisi/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("26. catatAbsensiAction + metodeInput=qr + EMPTY sumberQr (whitespace) -> throws /sumberQr wajib/i", async () => {
    // The guard must catch whitespace-only sumberQr, not just missing —
    // String().trim() collapsed it to empty, which is the same hole.
    await expect(
      catatAbsensiAction(
        formData({
          pesertaDidikId: "pd_1",
          rombonganBelajarId: "rombel_1",
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
          metodeInput: "qr",
          sumberQr: "   ",
        })
      )
    ).rejects.toThrow(/Token Sesi QR wajib diisi/i);
    expect(catatAbsensi).not.toHaveBeenCalled();
  });

  it("27. cross-tenant QR token: sumberQr carries tenant B marker, withTenant still uses membership.orgId (org_A); catatAbsensi called under tenant A scope", async () => {
    // The hostile scenario: an attacker (or a confused UI) posts a sumberQr
    // value that encodes tenant B's identifier, hoping it will route the
    // write to tenant B. The action MUST ignore sumberQr for tenant scope
    // and use akses.membership.orgId exclusively (identity doc §13).
    // `sumberQr` IS still persisted (as opaque provenance) on the tenant-A
    // row — never used to resolve the tenant.
    await catatAbsensiAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        tanggal: "2026-04-01",
        statusKehadiran: "hadir",
        metodeInput: "qr",
        sumberQr: "qr-session-TENANT_B_SECRET_TOKEN",
      })
    );

    // withTenant used membership.orgId ("org_A"), NEVER the victim id
    // embedded in the sumberQr string.
    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(withTenant).toHaveBeenCalledWith(DB, "org_A", expect.anything());
    expect(withTenant).not.toHaveBeenCalledWith(
      DB,
      "TENANT_B",
      expect.anything()
    );
    expect(withTenant).not.toHaveBeenCalledWith(
      DB,
      "org_B",
      expect.anything()
    );

    // The QR row WAS written — under tenant A scope, carrying the opaque
    // token as provenance. The cross-tenant deny is "no leak", not "no
    // write"; the token is meaningless outside tenant A.
    expect(catatAbsensi).toHaveBeenCalledWith(fakeTxRef, {
      pesertaDidikId: "pd_1",
      rombonganBelajarId: "rombel_1",
      tanggal: "2026-04-01",
      statusKehadiran: "hadir",
      metodeInput: "qr",
      catatan: undefined,
      sumberQr: "qr-session-TENANT_B_SECRET_TOKEN",
      dibuatOleh: "workos_u_1",
    });
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });
});
