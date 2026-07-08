import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors the idiom in src/app/auth/actions.test.ts: hoist all mocks, mock the
// modules to wire them in, then import the actions under test.

const mocks = vi.hoisted(() => {
  const fakeTxLocal = { __tx: true };
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    // withTenant runs the callback with fakeTx so repo fns receive it.
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTxLocal)
    ),
    catatAudit: vi.fn(
      async (
        _tx: unknown,
        _entry: {
          aktor: string;
          aksi: string;
          target?: string;
          beban?: unknown;
        }
      ) => undefined
    ),
    buatPtk: vi.fn(async (_tx: unknown, input: { nama: string }) => ({
      id: "ptk_new",
      tenantId: "org_A",
      nama: input.nama,
      nip: null,
      jenis: "pendidik",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    })),
    hapusPtk: vi.fn(async () => undefined),
    linkPtk: vi.fn(async () => undefined),
    aturIzin: vi.fn(async () => undefined),
    aturPembatasan: vi.fn(async () => undefined),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  buatPtk,
  hapusPtk,
  linkPtk,
  aturIzin,
  aturPembatasan,
  revalidatePath,
  fakeTx: fakeTxRef,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
  // Mirror the real requireAksesAktif: delegate to the mocked getAksesSaya so
  // every existing getAksesSaya.mockResolvedValue(...) setup continues to drive
  // both the status branch and the boleh() branch unchanged.
  requireAksesAktif: async (izin: IzinSlug, pesanTolak?: string) => {
    const akses = await mocks.getAksesSaya();
    if (akses.status !== "active") {
      throw new Error("Satuan Pendidikan Aktif belum dipilih.");
    }
    if (!akses.boleh(izin).diizinkan) {
      throw new Error(pesanTolak ?? "Anda tidak memiliki izin untuk aksi ini.");
    }
    return akses;
  },
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/akses", () => ({
  buatPtk: mocks.buatPtk,
  hapusPtk: mocks.hapusPtk,
  linkPtk: mocks.linkPtk,
  aturIzin: mocks.aturIzin,
  aturPembatasan: mocks.aturPembatasan,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  aturIzinAksesAction,
  aturPembatasanAksesAction,
  hapusPtkAction,
  linkPtkPenggunaAction,
  simpanPtkBaruAction,
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

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default) so the tests are
 * realistic.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "ptk:baca",
      "ptk:buat",
      "ptk:hapus",
      "akses:kelola",
      "akses:baca",
    ],
    dev: ["ptk:baca", "ptk:buat", "ptk:hapus", "akses:kelola", "akses:baca"],
    kepala_sekolah: ["akses:baca"],
    guru: [],
    wali_kelas: [],
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
    pengguna: null,
    izin,
    pembatasan,
    boleh,
  };
}

beforeEach(() => {
  getAksesSaya.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  buatPtk.mockReset();
  hapusPtk.mockReset();
  linkPtk.mockReset();
  aturIzin.mockReset();
  aturPembatasan.mockReset();
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
  buatPtk.mockImplementation(async (_tx: unknown, input: { nama: string }) => ({
    id: "ptk_new",
    tenantId: "org_A",
    nama: input.nama,
    nip: null,
    jenis: "pendidik",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  }));
  hapusPtk.mockResolvedValue(undefined);
  linkPtk.mockResolvedValue(undefined);
  aturIzin.mockResolvedValue(undefined);
  aturPembatasan.mockResolvedValue(undefined);
  catatAudit.mockResolvedValue(undefined);
});

// ===========================================================================
// A. Authorization denial (guru) — core security: action throws BEFORE any DB.
// ===========================================================================

describe("A. authorization denial — guru role (no izin, no pembatasan)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("1. simpanPtkBaruAction -> throws /izin/i; buatPtk + audit + withTenant NOT called", async () => {
    await expect(
      simpanPtkBaruAction(formData({ nama: "Budi", jenis: "pendidik" }))
    ).rejects.toThrow(/izin/i);
    expect(buatPtk).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. hapusPtkAction -> throws /izin/i; hapusPtk + audit NOT called", async () => {
    await expect(hapusPtkAction(formData({ ptkId: "ptk_1" }))).rejects.toThrow(
      /izin/i
    );
    expect(hapusPtk).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("3. linkPtkPenggunaAction -> throws (akses:kelola required); linkPtk NOT called", async () => {
    await expect(
      linkPtkPenggunaAction(formData({ penggunaId: "pg_1", ptkId: "ptk_1" }))
    ).rejects.toThrow(/izin/i);
    expect(linkPtk).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("4. aturIzinAksesAction -> throws; aturIzin NOT called", async () => {
    await expect(
      aturIzinAksesAction(
        formData({ penggunaId: "pg_1", slug: "ptk:baca", aktif: "on" })
      )
    ).rejects.toThrow(/izin/i);
    expect(aturIzin).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Authorization success (admin_satuan_pendidikan) — DB write + audit happen.
// ===========================================================================

describe("B. authorization success — admin_satuan_pendidikan", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("5. simpanPtkBaruAction -> buatPtk + audit(buat_ptk) + revalidatePath", async () => {
    await simpanPtkBaruAction(
      formData({ nama: "Budi", nip: "12345", jenis: "pendidik" })
    );
    expect(buatPtk).toHaveBeenCalledWith(fakeTxRef, {
      nama: "Budi",
      nip: "12345",
      jenis: "pendidik",
    });
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_ptk",
        target: expect.stringMatching(/^ptk:/),
        beban: { nama: "Budi", nip: "12345", jenis: "pendidik" },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/akses");
  });

  it("6. hapusPtkAction -> hapusPtk(ptkId) + audit(hapus_ptk)", async () => {
    await hapusPtkAction(formData({ ptkId: "ptk_42" }));
    expect(hapusPtk).toHaveBeenCalledWith(fakeTxRef, "ptk_42");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "hapus_ptk",
        target: "ptk:ptk_42",
        beban: { ptkId: "ptk_42" },
      })
    );
  });

  it("7. linkPtkPenggunaAction -> linkPtk(tx, penggunaId, ptkId) + audit(link_ptk_pengguna)", async () => {
    await linkPtkPenggunaAction(
      formData({ penggunaId: "pg_7", ptkId: "ptk_7" })
    );
    expect(linkPtk).toHaveBeenCalledWith(fakeTxRef, "pg_7", "ptk_7");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "link_ptk_pengguna",
        target: "pengguna:pg_7",
        beban: { ptkId: "ptk_7" },
      })
    );
  });

  it("8. aturIzinAksesAction (aktif=on) -> aturIzin(tx, pg, slug, true) + audit(atur_izin)", async () => {
    await aturIzinAksesAction(
      formData({ penggunaId: "pg_8", slug: "ptk:baca", aktif: "on" })
    );
    expect(aturIzin).toHaveBeenCalledWith(fakeTxRef, "pg_8", "ptk:baca", true);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "atur_izin",
        target: "pengguna:pg_8",
        beban: { slug: "ptk:baca", aktif: true },
      })
    );
  });

  it("9. aturPembatasanAksesAction -> aturPembatasan + audit(atur_pembatasan)", async () => {
    await aturPembatasanAksesAction(
      formData({
        penggunaId: "pg_9",
        slug: "ptk:hapus",
        aktif: "on",
        alasan: "Rotasi",
      })
    );
    expect(aturPembatasan).toHaveBeenCalledWith(
      fakeTxRef,
      "pg_9",
      "ptk:hapus",
      true,
      "Rotasi"
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "atur_pembatasan",
        target: "pengguna:pg_9",
        beban: { slug: "ptk:hapus", aktif: true, alasan: "Rotasi" },
      })
    );
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary"
// These tests invoke the action DIRECTLY (no page, no button, no fetch guard).
// A client that bypasses the UI and POSTs raw FormData is STILL blocked
// server-side. This is acceptance criterion #5 of issue #6.
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("guru calling hapusPtkAction directly (no UI) -> denied; no DB write; no audit", async () => {
    // The page would hide the delete button for guru, but a hostile client
    // can bypass the UI and POST the action fn directly. The server MUST
    // still refuse — the UI hiding is defense-in-depth, NOT the boundary.
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));

    await expect(hapusPtkAction(formData({ ptkId: "ptk_secret" }))).rejects.toThrow(
      /izin/i
    );

    expect(hapusPtk).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("admin calling hapusPtkAction directly -> succeeds; DB write + audit happen", async () => {
    // Same direct call, but an admin IS authorized — proving the action
    // distinguishes by server-evaluated role, not by who clicked.
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await hapusPtkAction(formData({ ptkId: "ptk_secret" }));

    expect(hapusPtk).toHaveBeenCalledWith(fakeTxRef, "ptk_secret");
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("admin WITH pembatasan['ptk:hapus'] calling hapusPtkAction -> DENIED (pembatasan wins, no superuser)", async () => {
    // AC#4 / identity doc §13: there is NO global superuser. An admin with
    // an active pembatasan_akses row for ptk:hapus is STILL refused. The
    // role default does not override the restriction.
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", { pembatasan: ["ptk:hapus"] })
    );

    await expect(
      hapusPtkAction(formData({ ptkId: "ptk_locked" }))
    ).rejects.toThrow(/izin/i);

    expect(hapusPtk).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("D. tenant tamper-proofing", () => {
  it("10. bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    // Hostile client injects a victim tenant id into the formData.
    await simpanPtkBaruAction(
      formData({
        nama: "Budi",
        jenis: "pendidik",
        tenantId: "org_VICTIM",
      })
    );

    // withTenant MUST be called with the membership's orgId, never the
    // tampered formData value. The action never reads formData.tenantId.
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
// E. Validation failures (manual — no zod).
// ===========================================================================

describe("E. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("11. simpanPtkBaruAction + empty nama -> /Nama PTK wajib diisi/i; buatPtk NOT called", async () => {
    await expect(
      simpanPtkBaruAction(formData({ nama: "   ", jenis: "pendidik" }))
    ).rejects.toThrow(/Nama PTK wajib diisi/i);
    expect(buatPtk).not.toHaveBeenCalled();
  });

  it("12. simpanPtkBaruAction + invalid jenis -> /Jenis PTK tidak valid/i; NOT called", async () => {
    await expect(
      simpanPtkBaruAction(formData({ nama: "Budi", jenis: "hacker" }))
    ).rejects.toThrow(/Jenis PTK tidak valid/i);
    expect(buatPtk).not.toHaveBeenCalled();
  });

  it("13. aturIzinAksesAction + invalid slug -> /Slug izin tidak valid/i; NOT called", async () => {
    await expect(
      aturIzinAksesAction(
        formData({ penggunaId: "pg_1", slug: "super:all", aktif: "on" })
      )
    ).rejects.toThrow(/Slug izin tidak valid/i);
    expect(aturIzin).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F. Non-active context (denied / choose).
// ===========================================================================

describe("F. non-active akses context", () => {
  it("14. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);

    await expect(
      simpanPtkBaruAction(formData({ nama: "Budi", jenis: "pendidik" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("14b. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);

    await expect(hapusPtkAction(formData({ ptkId: "ptk_1" }))).rejects.toThrow(
      /belum dipilih/i
    );
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. Checkbox semantics — aktif derives from formData "on" value.
// ===========================================================================

describe("G. checkbox semantics", () => {
  it("15. aturIzinAksesAction with aktif OFF -> aturIzin called with aktif=false", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    // No "aktif" field at all (unchecked checkbox submits nothing).
    await aturIzinAksesAction(
      formData({ penggunaId: "pg_15", slug: "ptk:baca" })
    );

    expect(aturIzin).toHaveBeenCalledWith(fakeTxRef, "pg_15", "ptk:baca", false);
  });
});

// ===========================================================================
// H. dev role is admin-equivalent (scoped to seeded tenants — NOT a superuser).
// ===========================================================================

describe("H. dev role behaves like admin", () => {
  it("16. simpanPtkBaruAction with dev role -> succeeds (buatPtk + audit)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("dev"));

    await simpanPtkBaruAction(
      formData({ nama: "Citra", jenis: "tenaga_kependidikan" })
    );

    expect(buatPtk).toHaveBeenCalledWith(fakeTxRef, {
      nama: "Citra",
      nip: null,
      jenis: "tenaga_kependidikan",
    });
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/akses");
  });
});
