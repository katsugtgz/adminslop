import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors src/app/dashboard/akses/actions.test.ts: hoist all mocks, mock the
// modules to wire them in, then import the actions under test.
//
// OWNERSHIP CHAIN (AC#4): the repos expose no `cari*ById`, and this layer must
// not touch src/db. The action resolves ownership via private helpers that do
// `tx.select().from(table)` + a JS `.find` by id. We therefore mock `withTenant`
// to run each callback with a `fakeTx` whose `select().from(table)` returns a
// per-table fixture array keyed by the REAL schema table object (re-exported
// through the `@/db/client` mock via importOriginal). Populating the Map per
// test lets us prove the full ownership chain end-to-end.

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
    buatKomponenNilai: vi.fn(async () => ({ id: "kn_new" })),
    hapusKomponenNilai: vi.fn(async () => undefined),
    buatPenilaian: vi.fn(async () => ({ id: "p_new" })),
    hapusPenilaian: vi.fn(async () => undefined),
    upsertNilai: vi.fn(async () => ({ id: "n_new" })),
    hapusNilai: vi.fn(async () => undefined),
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
  buatKomponenNilai,
  hapusKomponenNilai,
  buatPenilaian,
  hapusPenilaian,
  upsertNilai,
  hapusNilai,
  revalidatePath,
  fakeTx: fakeTxRef,
  tableRows,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
// Preserve the REAL dbSchema (table object refs) so the action's ownership
// resolvers and this test's fixture Map share identical keys.
vi.mock("@/db/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/db/client")>();
  return {
    getDb: mocks.getDb,
    withTenant: mocks.withTenant,
    catatAudit: mocks.catatAudit,
    dbSchema: actual.dbSchema,
  };
});
vi.mock("@/db/queries/komponen-nilai", () => ({
  buatKomponenNilai: mocks.buatKomponenNilai,
  hapusKomponenNilai: mocks.hapusKomponenNilai,
}));
vi.mock("@/db/queries/penilaian", () => ({
  buatPenilaian: mocks.buatPenilaian,
  hapusPenilaian: mocks.hapusPenilaian,
}));
vi.mock("@/db/queries/nilai-peserta-didik", () => ({
  upsertNilai: mocks.upsertNilai,
  hapusNilai: mocks.hapusNilai,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { dbSchema } from "@/db/client";
import {
  hapusKomponenNilaiAction,
  hapusNilaiAction,
  hapusPenilaianAction,
  simpanKomponenNilaiBaruAction,
  simpanPenilaianBaruAction,
  upsertNilaiAction,
} from "./actions";

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
const ID_KOMPONEN = "11111111-1111-4111-8111-111111111111";
const ID_PENILAIAN = "22222222-2222-4222-8222-222222222222";
const ID_NILAI = "33333333-3333-4333-8333-333333333333";

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default). `ptkId` threads
 * the ownership identity (AC#4 gate 2) — null = guru not linked to a PTK.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[]; ptkId?: string | null }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const ptkId = opts?.ptkId ?? null;
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "akses:kelola",
      "akses:baca",
      "penilaian:baca",
      "penilaian:buat",
      "penilaian:ubah",
    ],
    dev: [
      "akses:kelola",
      "akses:baca",
      "penilaian:baca",
      "penilaian:buat",
      "penilaian:ubah",
    ],
    kepala_sekolah: ["akses:baca", "penilaian:baca"],
    guru: ["penilaian:baca", "penilaian:buat", "penilaian:ubah"],
    wali_kelas: ["penilaian:baca"],
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

/** Populate the fakeTx fixture rows for the ownership chain (cleared first). */
function aturFixtures(opts: {
  beban?: unknown[];
  komponen?: unknown[];
  penilaian?: unknown[];
  nilai?: unknown[];
}): void {
  tableRows.clear();
  if (opts.beban) tableRows.set(dbSchema.bebanMengajar, opts.beban);
  if (opts.komponen) tableRows.set(dbSchema.komponenNilai, opts.komponen);
  if (opts.penilaian) tableRows.set(dbSchema.penilaian, opts.penilaian);
  if (opts.nilai) tableRows.set(dbSchema.nilaiPesertaDidik, opts.nilai);
}

beforeEach(() => {
  getAksesSaya.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  buatKomponenNilai.mockReset();
  hapusKomponenNilai.mockReset();
  buatPenilaian.mockReset();
  hapusPenilaian.mockReset();
  upsertNilai.mockReset();
  hapusNilai.mockReset();
  revalidatePath.mockReset();
  // restore default implementations cleared by mockReset
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(
    async (
      _db: unknown,
      _tenantId: unknown,
      fn: (tx: unknown) => Promise<unknown>
    ) => fn(fakeTxRef)
  );
  buatKomponenNilai.mockResolvedValue({ id: "kn_new" });
  hapusKomponenNilai.mockResolvedValue(undefined);
  buatPenilaian.mockResolvedValue({ id: "p_new" });
  hapusPenilaian.mockResolvedValue(undefined);
  upsertNilai.mockResolvedValue({ id: "n_new" });
  hapusNilai.mockResolvedValue(undefined);
  catatAudit.mockResolvedValue(undefined);
  tableRows.clear();
});

// ===========================================================================
// A. Role denial (gate 1) — wali_kelas holds penilaian:baca ONLY. Any write
// action MUST throw BEFORE any DB work. AC#4 gate 1.
// ===========================================================================

describe("A. role denial — wali_kelas (penilaian:baca only)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas", { ptkId: "ptk_A" }));
  });

  it("1. simpanPenilaianBaruAction -> throws /izin/i; buatPenilaian + audit NOT called", async () => {
    await expect(
      simpanPenilaianBaruAction(
        formData({ komponenNilaiId: "kn_1", nama: "Tugas 1", tanggal: "2026-01-01" })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatPenilaian).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. upsertNilaiAction -> throws /izin/i; upsertNilai NOT called", async () => {
    await expect(
      upsertNilaiAction(
        formData({ penilaianId: "p_1", pesertaDidikId: "pd_1", nilai: "80" })
      )
    ).rejects.toThrow(/izin/i);
    expect(upsertNilai).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Admin success (ownership BYPASS) — admin (akses:kelola) manages every
// Beban Mengajar school-wide. No chain resolution, no ownership check; the
// repo write + audit happen directly.
// ===========================================================================

describe("B. admin success — ownership bypassed (akses:kelola)", () => {
  beforeEach(() => {
    // admin with NO ptkId at all — proves ownership is bypassed, not satisfied.
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("3. simpanKomponenNilaiBaruAction -> buatKomponenNilai + audit(buat_komponen_nilai)", async () => {
    await simpanKomponenNilaiBaruAction(
      formData({ bebanMengajarId: "bm_1", nama: "UTS", bobot: "30" })
    );
    expect(buatKomponenNilai).toHaveBeenCalledWith(fakeTxRef, {
      bebanMengajarId: "bm_1",
      nama: "UTS",
      bobot: 30,
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_komponen_nilai",
        target: "komponen_nilai:kn_new",
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/penilaian");
  });

  it("4. simpanPenilaianBaruAction -> buatPenilaian(dibuatOleh) + audit(buat_penilaian)", async () => {
    await simpanPenilaianBaruAction(
      formData({ komponenNilaiId: "kn_1", nama: "Tugas 1", tanggal: "2026-01-01" })
    );
    expect(buatPenilaian).toHaveBeenCalledWith(fakeTxRef, {
      komponenNilaiId: "kn_1",
      nama: "Tugas 1",
      tanggal: "2026-01-01",
      dibuatOleh: "workos_u_1",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ aksi: "buat_penilaian", target: "penilaian:p_new" })
    );
  });

  it("5. upsertNilaiAction -> upsertNilai + audit(upsert_nilai)", async () => {
    await upsertNilaiAction(
      formData({
        penilaianId: "p_1",
        pesertaDidikId: "pd_1",
        nilai: "85",
        catatan: "Bagus",
      })
    );
    expect(upsertNilai).toHaveBeenCalledWith(fakeTxRef, {
      penilaianId: "p_1",
      pesertaDidikId: "pd_1",
      nilai: 85,
      catatan: "Bagus",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "upsert_nilai",
        target: "nilai:n_new",
        beban: { penilaianId: "p_1", pesertaDidikId: "pd_1", nilai: 85, catatan: "Bagus" },
      })
    );
  });

  it("6. hapusKomponenNilaiAction -> hapusKomponenNilai + audit(hapus_komponen_nilai)", async () => {
    await hapusKomponenNilaiAction(formData({ id: ID_KOMPONEN }));
    expect(hapusKomponenNilai).toHaveBeenCalledWith(fakeTxRef, ID_KOMPONEN);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "hapus_komponen_nilai",
        target: `komponen_nilai:${ID_KOMPONEN}`,
      })
    );
  });

  it("7. hapusPenilaianAction -> hapusPenilaian + audit(hapus_penilaian)", async () => {
    await hapusPenilaianAction(formData({ id: ID_PENILAIAN }));
    expect(hapusPenilaian).toHaveBeenCalledWith(fakeTxRef, ID_PENILAIAN);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ aksi: "hapus_penilaian", target: `penilaian:${ID_PENILAIAN}` })
    );
  });

  it("8. hapusNilaiAction -> hapusNilai + audit(hapus_nilai)", async () => {
    await hapusNilaiAction(formData({ id: ID_NILAI }));
    expect(hapusNilai).toHaveBeenCalledWith(fakeTxRef, ID_NILAI);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ aksi: "hapus_nilai", target: `nilai:${ID_NILAI}` })
    );
  });

  it("8b. admin DOES NOT resolve the ownership chain (no fakeTx.from hit)", async () => {
    // Admin bypass means the chain resolvers never run — tableRows stays empty
    // yet the action succeeds. This is the ownership-BYPASS proof.
    await hapusNilaiAction(formData({ id: ID_NILAI }));
    expect(hapusNilai).toHaveBeenCalledTimes(1);
    expect(tableRows.size).toBe(0);
  });
});

// ===========================================================================
// C. Guru OWNS the Beban Mengajar (AC#4 success) — role gate passed; ownership
// chain resolves to the guru's own ptkId. Repo write + audit happen.
// ===========================================================================

describe("C. AC#4 success — guru owns the Beban Mengajar", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: "ptk_A" }));
    // beban_mengajar bm_A is owned by ptk_A (this guru). Full chain present.
    aturFixtures({
      beban: [{ id: "bm_A", ptkId: "ptk_A" }],
      komponen: [{ id: "kn_1", bebanMengajarId: "bm_A" }],
      penilaian: [{ id: "p_1", komponenNilaiId: "kn_1" }],
      nilai: [{ id: "n_1", penilaianId: "p_1" }],
    });
  });

  it("9. simpanKomponenNilaiBaruAction (beban bm_A) -> buatKomponenNilai called (ownership matches)", async () => {
    await simpanKomponenNilaiBaruAction(
      formData({ bebanMengajarId: "bm_A", nama: "UAS", bobot: "40" })
    );
    expect(buatKomponenNilai).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("10. simpanPenilaianBaruAction (komponen kn_1 -> bm_A) -> buatPenilaian called", async () => {
    await simpanPenilaianBaruAction(
      formData({ komponenNilaiId: "kn_1", nama: "Tugas 1", tanggal: "2026-01-01" })
    );
    expect(buatPenilaian).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("11. upsertNilaiAction (penilaian p_1 -> kn_1 -> bm_A) -> upsertNilai called (deepest chain)", async () => {
    await upsertNilaiAction(
      formData({ penilaianId: "p_1", pesertaDidikId: "pd_1", nilai: "90" })
    );
    expect(upsertNilai).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// D. Guru does NOT own the Beban Mengajar (AC#4 DENY) — THE KEY TEST BLOCK.
// Role gate passes (guru has penilaian:buat), but ownership fails. The action
// MUST throw BEFORE the repo write. Tested across every chain depth.
// ===========================================================================

describe("D. AC#4 DENY — guru does NOT own the Beban Mengajar", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: "ptk_A" }));
    // beban_mengajar bm_X is owned by ptk_B (a DIFFERENT guru).
    aturFixtures({
      beban: [{ id: "bm_X", ptkId: "ptk_B" }],
      komponen: [
        { id: "kn_1", bebanMengajarId: "bm_X" },
        { id: ID_KOMPONEN, bebanMengajarId: "bm_X" },
      ],
      penilaian: [{ id: "p_1", komponenNilaiId: "kn_1" }],
      nilai: [{ id: "n_1", penilaianId: "p_1" }],
    });
  });

  it("12. simpanKomponenNilaiBaruAction (beban bm_X) -> throws /Beban Mengajar/i; buatKomponenNilai NOT called", async () => {
    await expect(
      simpanKomponenNilaiBaruAction(
        formData({ bebanMengajarId: "bm_X", nama: "UAS", bobot: "40" })
      )
    ).rejects.toThrow(/Beban Mengajar/i);
    expect(buatKomponenNilai).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("13. simpanPenilaianBaruAction (komponen kn_1 -> bm_X) -> throws /Beban Mengajar/i; NOT called", async () => {
    await expect(
      simpanPenilaianBaruAction(
        formData({ komponenNilaiId: "kn_1", nama: "Tugas 1", tanggal: "2026-01-01" })
      )
    ).rejects.toThrow(/Beban Mengajar/i);
    expect(buatPenilaian).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("14. upsertNilaiAction (penilaian p_1 -> kn_1 -> bm_X) -> throws /Beban Mengajar/i; NOT called", async () => {
    await expect(
      upsertNilaiAction(
        formData({ penilaianId: "p_1", pesertaDidikId: "pd_1", nilai: "90" })
      )
    ).rejects.toThrow(/Beban Mengajar/i);
    expect(upsertNilai).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("15. hapusKomponenNilaiAction (komponen kn_1 -> bm_X) -> throws /Beban Mengajar/i; NOT called", async () => {
    await expect(hapusKomponenNilaiAction(formData({ id: ID_KOMPONEN }))).rejects.toThrow(
      /Beban Mengajar/i
    );
    expect(hapusKomponenNilai).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// E. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary".
// The page hides write buttons for unauthorized roles, but a hostile client
// can bypass the UI and POST the action fn directly. The server MUST still
// decide correctly: guru-owner succeeds, wali_kelas denied, admin succeeds.
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("16. guru OWNER calling upsertNilaiAction directly -> succeeds (ownership proven server-side)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: "ptk_A" }));
    aturFixtures({
      beban: [{ id: "bm_A", ptkId: "ptk_A" }],
      komponen: [{ id: "kn_1", bebanMengajarId: "bm_A" }],
      penilaian: [{ id: "p_1", komponenNilaiId: "kn_1" }],
    });
    // Direct invocation — no page, no button, no fetch guard.
    await upsertNilaiAction(
      formData({ penilaianId: "p_1", pesertaDidikId: "pd_1", nilai: "75" })
    );
    expect(upsertNilai).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("17. wali_kelas calling upsertNilaiAction directly -> DENIED at role gate; no write", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas", { ptkId: "ptk_A" }));
    await expect(
      upsertNilaiAction(
        formData({ penilaianId: "p_1", pesertaDidikId: "pd_1", nilai: "75" })
      )
    ).rejects.toThrow(/izin/i);
    expect(upsertNilai).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("18. admin calling upsertNilaiAction directly -> succeeds (server distinguishes by role, not click)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await upsertNilaiAction(
      formData({ penilaianId: "p_1", pesertaDidikId: "pd_1", nilai: "75" })
    );
    expect(upsertNilai).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// F. No linked PTK — a guru whose Pengguna has no ptkId cannot satisfy
// ownership and is refused outright (no chain resolution). Admin with no ptkId
// still bypasses ownership.
// ===========================================================================

describe("F. no linked PTK (pengguna.ptkId is null)", () => {
  it("19. guru with ptkId=null -> throws /belum terhubung dengan PTK/i; repo NOT called; no resolution", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { ptkId: null }));
    await expect(
      simpanKomponenNilaiBaruAction(
        formData({ bebanMengajarId: "bm_A", nama: "UTS", bobot: "30" })
      )
    ).rejects.toThrow(/belum terhubung dengan PTK/i);
    expect(buatKomponenNilai).not.toHaveBeenCalled();
    // Resolution never ran — the ptkId check throws first.
    expect(tableRows.size).toBe(0);
  });

  it("20. admin with ptkId=null -> BYPASSES ownership; succeeds", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await simpanKomponenNilaiBaruAction(
      formData({ bebanMengajarId: "bm_A", nama: "UTS", bobot: "30" })
    );
    expect(buatKomponenNilai).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// G. Manual validation failures (no zod).
// ===========================================================================

describe("G. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("21. simpanKomponenNilaiBaruAction + empty nama -> /Nama Komponen wajib diisi/i", async () => {
    await expect(
      simpanKomponenNilaiBaruAction(
        formData({ bebanMengajarId: "bm_1", nama: "   ", bobot: "30" })
      )
    ).rejects.toThrow(/Nama Komponen wajib diisi/i);
    expect(buatKomponenNilai).not.toHaveBeenCalled();
  });

  it("22. simpanKomponenNilaiBaruAction + bobot 0 -> /Bobot harus lebih besar dari 0/i", async () => {
    await expect(
      simpanKomponenNilaiBaruAction(
        formData({ bebanMengajarId: "bm_1", nama: "UTS", bobot: "0" })
      )
    ).rejects.toThrow(/Bobot harus lebih besar dari 0/i);
    expect(buatKomponenNilai).not.toHaveBeenCalled();
  });

  it("23. simpanKomponenNilaiBaruAction + non-numeric bobot -> /harus berupa angka/i", async () => {
    await expect(
      simpanKomponenNilaiBaruAction(
        formData({ bebanMengajarId: "bm_1", nama: "UTS", bobot: "abc" })
      )
    ).rejects.toThrow(/harus berupa angka/i);
    expect(buatKomponenNilai).not.toHaveBeenCalled();
  });

  it("24. hapusPenilaianAction + malformed id -> /ID tidak valid/i before DB", async () => {
    await expect(hapusPenilaianAction(formData({ id: "bukan-uuid" }))).rejects.toThrow(
      /ID tidak valid/i
    );
    expect(withTenant).not.toHaveBeenCalled();
    expect(hapusPenilaian).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// H. Non-active context (denied / choose) — no active Satuan Pendidikan.
// ===========================================================================

describe("H. non-active akses context", () => {
  it("25. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(
      simpanKomponenNilaiBaruAction(
        formData({ bebanMengajarId: "bm_1", nama: "UTS", bobot: "30" })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("26. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    await expect(
      upsertNilaiAction(
        formData({ penilaianId: "p_1", pesertaDidikId: "pd_1", nilai: "80" })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// I. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("I. tenant tamper-proofing", () => {
  it("27. bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await simpanKomponenNilaiBaruAction(
      formData({
        bebanMengajarId: "bm_1",
        nama: "UTS",
        bobot: "30",
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
