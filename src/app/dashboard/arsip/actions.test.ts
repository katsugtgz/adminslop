import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors src/app/dashboard/penilaian/actions.test.ts: hoist all mocks, mock
// the modules, then import the actions under test. The arsip repo is mocked
// wholesale since these tests prove the ACTION contract (authz gate, table
// whitelist, audit, revalidation), not the repo SQL (covered by arsip.test.ts).

const mocks = vi.hoisted(() => {
  const fakeTxLocal = { __tx: true };
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
    arsipkan: vi.fn(async () => 1),
    pulihkan: vi.fn(async () => 1),
    aturRetensi: vi.fn(async () => ({ id: "ret_1" })),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  arsipkan,
  pulihkan,
  aturRetensi,
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
vi.mock("@/db/queries/arsip", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/queries/arsip")>();
  return {
    arsipkan: mocks.arsipkan,
    pulihkan: mocks.pulihkan,
    aturRetensi: mocks.aturRetensi,
    isTabelArsip: actual.isTabelArsip,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  arsipkanAction,
  aturRetensiAction,
  pulihkanAction,
} from "./actions";

// --- helpers ---------------------------------------------------------------

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

const TX = expect.anything();
const DB = expect.anything();

function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: ["akses:kelola", "arsip:baca", "arsip:kelola"],
    dev: ["akses:kelola", "arsip:baca", "arsip:kelola"],
    kepala_sekolah: ["arsip:baca"],
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
  arsipkan.mockReset();
  pulihkan.mockReset();
  aturRetensi.mockReset();
  revalidatePath.mockReset();
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(
    async (
      _db: unknown,
      _tenantId: unknown,
      fn: (tx: unknown) => Promise<unknown>
    ) => fn(fakeTxRef)
  );
  arsipkan.mockResolvedValue(1);
  pulihkan.mockResolvedValue(1);
  aturRetensi.mockResolvedValue({ id: "ret_1" });
  catatAudit.mockResolvedValue(undefined);
});

// ===========================================================================
// A. Admin success — arsip:kelola granted, repo + audit + revalidate all fire.
// ===========================================================================

describe("A. admin success (arsip:kelola)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("1. arsipkanAction(ptk) -> arsipkan + audit(arsipkan_record) + revalidate", async () => {
    await arsipkanAction(formData({ tabel: "ptk", id: "ptk_1" }));
    expect(arsipkan).toHaveBeenCalledWith(fakeTxRef, "ptk", "ptk_1", "workos_u_1");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "arsipkan_record",
        target: "ptk:ptk_1",
        beban: { tabel: "ptk", id: "ptk_1" },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/arsip");
  });

  it("2. arsipkanAction(penilaian) -> arsipkan with the right tabel literal", async () => {
    await arsipkanAction(formData({ tabel: "penilaian", id: "pen_1" }));
    expect(arsipkan).toHaveBeenCalledWith(
      fakeTxRef,
      "penilaian",
      "pen_1",
      "workos_u_1"
    );
  });

  it("3. pulihkanAction(beban_mengajar) -> pulihkan + audit(pulihkan_record)", async () => {
    await pulihkanAction(
      formData({ tabel: "beban_mengajar", id: "bm_1" })
    );
    expect(pulihkan).toHaveBeenCalledWith(fakeTxRef, "beban_mengajar", "bm_1");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "pulihkan_record",
        target: "beban_mengajar:bm_1",
      })
    );
  });

  it("4. aturRetensiAction(ptk, 84) -> aturRetensi + audit(atur_retensi)", async () => {
    await aturRetensiAction(
      formData({ tabel: "ptk", periodeBulan: "84", keterangan: "7 tahun" })
    );
    expect(aturRetensi).toHaveBeenCalledWith(fakeTxRef, {
      tabel: "ptk",
      periodeBulan: 84,
      keterangan: "7 tahun",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "atur_retensi",
        target: "retensi:ptk",
        beban: { tabel: "ptk", periodeBulan: 84, keterangan: "7 tahun" },
      })
    );
  });

  it("5. aturRetensiAction with empty keterangan -> keterangan passed as undefined", async () => {
    await aturRetensiAction(
      formData({ tabel: "wali_kelas", periodeBulan: "60" })
    );
    expect(aturRetensi).toHaveBeenCalledWith(fakeTxRef, {
      tabel: "wali_kelas",
      periodeBulan: 60,
      keterangan: undefined,
    });
  });
});

// ===========================================================================
// B. Role denial (gate 1) — guru / wali_kelas / kepala_sekolah hold NO
// arsip:kelola. Any archive/recover/retention action MUST throw BEFORE any DB
// work. AC#5 gate 1.
// ===========================================================================

describe("B. role denial — guru / wali_kelas / kepala_sekolah (no arsip:kelola)", () => {
  it("6. guru + arsipkanAction -> throws /izin/i; arsipkan + audit NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await expect(
      arsipkanAction(formData({ tabel: "ptk", id: "ptk_1" }))
    ).rejects.toThrow(/izin/i);
    expect(arsipkan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("7. wali_kelas + pulihkanAction -> throws /izin/i; pulihkan NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await expect(
      pulihkanAction(formData({ tabel: "ptk", id: "ptk_1" }))
    ).rejects.toThrow(/izin/i);
    expect(pulihkan).not.toHaveBeenCalled();
  });

  it("8. kepala_sekolah (arsip:baca only) + aturRetensiAction -> throws /izin/i", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    await expect(
      aturRetensiAction(
        formData({ tabel: "ptk", periodeBulan: "84" })
      )
    ).rejects.toThrow(/izin/i);
    expect(aturRetensi).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// C. AC#5 PROOF — "hiding UI is not the authorization boundary".
// The page hides archive buttons for unauthorized roles, but a hostile client
// can bypass the UI and POST the action fn directly. The server MUST still
// decide correctly: admin succeeds, guru denied.
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("9. guru calling arsipkanAction DIRECTLY -> DENIED at role gate; no write, no audit", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await expect(
      arsipkanAction(formData({ tabel: "ptk", id: "ptk_1" }))
    ).rejects.toThrow(/izin/i);
    expect(arsipkan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("10. admin calling arsipkanAction DIRECTLY -> succeeds (server distinguishes by role, not click)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await arsipkanAction(formData({ tabel: "ptk", id: "ptk_1" }));
    expect(arsipkan).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("11. AC#5 table whitelist: invalid tabel rejected BEFORE repo call (no SQL injection path)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await expect(
      arsipkanAction(
        formData({ tabel: "satuan_pendidikan; drop table ptk", id: "x" })
      )
    ).rejects.toThrow(/Tabel tidak didukung/i);
    expect(arsipkan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. AC#1 proof — arsipkanAction does NOT hard-delete. The repo returns a row
// count (1 = archived, 0 = not found); the action throws on 0 but never
// deletes. The mock returns 1 by default; here we assert the action treats a
// 0 return as "not found" (never silently succeeds, never hard-deletes).
// ===========================================================================

describe("D. AC#1 proof + not-found handling", () => {
  it("12. arsipkan returns 0 (not found/already archived) -> action throws /tidak ditemukan/i; NO audit", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    arsipkan.mockResolvedValue(0);
    await expect(
      arsipkanAction(formData({ tabel: "ptk", id: "ptk_missing" }))
    ).rejects.toThrow(/tidak ditemukan/i);
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("13. pulihkan returns 0 (not found/not archived) -> action throws /tidak ditemukan/i; NO audit", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    pulihkan.mockResolvedValue(0);
    await expect(
      pulihkanAction(formData({ tabel: "ptk", id: "ptk_missing" }))
    ).rejects.toThrow(/tidak ditemukan/i);
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// E. Manual validation failures (no zod).
// ===========================================================================

describe("E. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("14. arsipkanAction + empty id -> /ID wajib diisi/i", async () => {
    await expect(
      arsipkanAction(formData({ tabel: "ptk", id: "  " }))
    ).rejects.toThrow(/ID wajib diisi/i);
    expect(arsipkan).not.toHaveBeenCalled();
  });

  it("15. aturRetensiAction + empty periodeBulan -> /Periode .+ wajib diisi/i", async () => {
    await expect(
      aturRetensiAction(formData({ tabel: "ptk", periodeBulan: "" }))
    ).rejects.toThrow(/Periode .+ wajib diisi/i);
    expect(aturRetensi).not.toHaveBeenCalled();
  });

  it("16. aturRetensiAction + periodeBulan 0 -> /harus lebih besar dari 0/i", async () => {
    await expect(
      aturRetensiAction(formData({ tabel: "ptk", periodeBulan: "0" }))
    ).rejects.toThrow(/harus lebih besar dari 0/i);
    expect(aturRetensi).not.toHaveBeenCalled();
  });

  it("17. aturRetensiAction + non-numeric periodeBulan -> /harus berupa angka/i", async () => {
    await expect(
      aturRetensiAction(formData({ tabel: "ptk", periodeBulan: "abc" }))
    ).rejects.toThrow(/harus berupa angka/i);
    expect(aturRetensi).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F. Non-active context (denied / choose) — no active Satuan Pendidikan.
// ===========================================================================

describe("F. non-active akses context", () => {
  it("18. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(
      arsipkanAction(formData({ tabel: "ptk", id: "ptk_1" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("19. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    await expect(
      aturRetensiAction(formData({ tabel: "ptk", periodeBulan: "84" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("G. tenant tamper-proofing", () => {
  it("20. bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await arsipkanAction(
      formData({
        tabel: "ptk",
        id: "ptk_1",
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
// H. Pembatasan wins (§13) — admin WITH pembatasan['arsip:kelola'] is denied.
// ===========================================================================

describe("H. pembatasan wins (§13)", () => {
  it("21. admin WITH pembatasan[arsip:kelola] -> throws /izin/i; no write", async () => {
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", {
        pembatasan: ["arsip:kelola"],
      })
    );
    await expect(
      arsipkanAction(formData({ tabel: "ptk", id: "ptk_1" }))
    ).rejects.toThrow(/izin/i);
    expect(arsipkan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});
