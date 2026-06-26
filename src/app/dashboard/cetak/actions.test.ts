import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

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
    buatTemplateCetak: vi.fn(async (_tx: unknown, _input: unknown) => ({
      id: "tpl_new",
    })),
    buatDokumenCetak: vi.fn(async (_tx: unknown, _input: unknown) => ({
      id: "dok_new",
    })),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  buatTemplateCetak,
  buatDokumenCetak,
  revalidatePath,
  fakeTx: fakeTxRef,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/cetak", () => ({
  buatTemplateCetak: mocks.buatTemplateCetak,
  buatDokumenCetak: mocks.buatDokumenCetak,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { buatDokumenCetakAction, buatTemplateCetakAction } from "./actions";

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

const TX = expect.anything();
const DB = expect.anything();

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default).
 *
 * Cetak role defaults (#14):
 *   admin / dev           — cetak:baca + cetak:buat + cetak:ubah
 *   kepala_sekolah        — cetak:baca + cetak:buat
 *   guru                  — cetak:baca
 *   wali_kelas            — cetak:baca
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: ["cetak:baca", "cetak:buat", "cetak:ubah"],
    dev: ["cetak:baca", "cetak:buat", "cetak:ubah"],
    kepala_sekolah: ["cetak:baca", "cetak:buat"],
    guru: ["cetak:baca"],
    wali_kelas: ["cetak:baca"],
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
  vi.clearAllMocks();
  getAksesSaya.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  buatTemplateCetak.mockReset();
  buatDokumenCetak.mockReset();
  revalidatePath.mockReset();
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(
    async (
      _db: unknown,
      _tenantId: unknown,
      fn: (tx: unknown) => Promise<unknown>
    ) => fn(fakeTxRef)
  );
  catatAudit.mockResolvedValue(undefined);
  buatTemplateCetak.mockResolvedValue({ id: "tpl_new" });
  buatDokumenCetak.mockResolvedValue({ id: "dok_new" });
});

// ===========================================================================
// A. Role denial — guru/wali_kelas hold cetak:baca ONLY. Any write action
// MUST throw BEFORE any DB work (gate 1).
// ===========================================================================

describe("A. role denial — guru (cetak:baca only)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("1. buatTemplateCetakAction -> throws /izin/i; repo + audit + withTenant NOT called", async () => {
    await expect(
      buatTemplateCetakAction(formData({ nama: "X" }))
    ).rejects.toThrow(/izin/i);
    expect(buatTemplateCetak).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. buatDokumenCetakAction -> throws /izin/i; repo NOT called", async () => {
    await expect(
      buatDokumenCetakAction(
        formData({ drafEraportId: "er_1", templateCetakId: "tpl_1", format: "a4" })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatDokumenCetak).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Admin success — buatTemplateCetakAction builds pengaturan from formData.
// ===========================================================================

describe("B. admin success — buatTemplateCetakAction", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("3. parses pengaturan fields + isDefault; audit(buat_template_cetak)", async () => {
    await buatTemplateCetakAction(
      formData({
        nama: "Template Standar",
        marginMm: "15",
        fontSize: "12",
        headerText: "LAPORAN",
        footerText: "Elektronik",
        showLogo: "on",
        showHeader: "on",
        isDefault: "on",
      })
    );

    expect(buatTemplateCetak).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        nama: "Template Standar",
        isDefault: true,
        dibuatOleh: "workos_u_1",
        pengaturan: expect.objectContaining({
          marginMm: 15,
          fontSize: 12,
          headerText: "LAPORAN",
          footerText: "Elektronik",
          showLogo: true,
          showHeader: true,
        }),
      })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_template_cetak",
        target: "template_cetak:tpl_new",
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/cetak");
  });

  it("4. no optional fields -> pengaturan carries only show booleans (default false)", async () => {
    await buatTemplateCetakAction(formData({ nama: "Minimal" }));
    const call = buatTemplateCetak.mock.calls[0][1] as {
      pengaturan: Record<string, unknown>;
      isDefault: boolean;
    };
    expect(call.pengaturan).toEqual({ showLogo: false, showHeader: false });
    expect(call.isDefault).toBe(false);
  });
});

// ===========================================================================
// C. Dokumen Cetak success + AC#2 propagation.
// ===========================================================================

describe("C. dokumen cetak — buatDokumenCetakAction", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
  });

  it("5. forwards tandaTanganNama/Peran/stempelUrl + format; audit(buat_dokumen_cetak)", async () => {
    await buatDokumenCetakAction(
      formData({
        drafEraportId: "er_1",
        templateCetakId: "tpl_1",
        format: "f4",
        tandaTanganNama: "Siti",
        tandaTanganPeran: "Kepala Sekolah",
        stempelUrl: "https://s.example/stamp.png",
      })
    );

    expect(buatDokumenCetak).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        drafEraportId: "er_1",
        templateCetakId: "tpl_1",
        format: "f4",
        tandaTanganNama: "Siti",
        tandaTanganPeran: "Kepala Sekolah",
        stempelUrl: "https://s.example/stamp.png",
        dibuatOleh: "workos_u_1",
      })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "buat_dokumen_cetak",
        target: "dokumen_cetak:dok_new",
      })
    );
  });

  it("6. AC#2 propagation: repo throws 'Terbit' -> action propagates; audit NOT called", async () => {
    buatDokumenCetak.mockRejectedValueOnce(
      new Error("Hanya E-Raport berstatus Terbit yang dapat dicetak")
    );
    await expect(
      buatDokumenCetakAction(
        formData({ drafEraportId: "er_draf", templateCetakId: "tpl_1", format: "a4" })
      )
    ).rejects.toThrow(/Terbit/i);
    expect(buatDokumenCetak).toHaveBeenCalledTimes(1);
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary".
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("7. admin (has cetak:buat) calling buatTemplateCetakAction DIRECTLY -> succeeds", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await buatTemplateCetakAction(formData({ nama: "Direct" }));
    expect(buatTemplateCetak).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("8. guru (no cetak:buat) calling buatTemplateCetakAction DIRECTLY -> throws /izin/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await expect(
      buatTemplateCetakAction(formData({ nama: "Direct" }))
    ).rejects.toThrow(/izin/i);
    expect(buatTemplateCetak).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("9. guru (no cetak:buat) calling buatDokumenCetakAction DIRECTLY -> throws /izin/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await expect(
      buatDokumenCetakAction(
        formData({ drafEraportId: "er_1", templateCetakId: "tpl_1", format: "a4" })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatDokumenCetak).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("10. pembatasan wins: admin WITH pembatasan['cetak:buat'] -> denied", async () => {
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", { pembatasan: ["cetak:buat"] })
    );
    await expect(
      buatTemplateCetakAction(formData({ nama: "X" }))
    ).rejects.toThrow(/izin/i);
    expect(buatTemplateCetak).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// E. Manual validation failures (no zod).
// ===========================================================================

describe("E. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("11. buatTemplateCetakAction + missing nama -> /Nama Template wajib/i; repo NOT called", async () => {
    await expect(buatTemplateCetakAction(formData({}))).rejects.toThrow(
      /Nama Template wajib/i
    );
    expect(buatTemplateCetak).not.toHaveBeenCalled();
  });

  it("12. buatDokumenCetakAction + missing drafEraportId -> /Draf E-Raport wajib/i", async () => {
    await expect(
      buatDokumenCetakAction(formData({ templateCetakId: "tpl_1", format: "a4" }))
    ).rejects.toThrow(/Draf E-Raport wajib/i);
    expect(buatDokumenCetak).not.toHaveBeenCalled();
  });

  it("13. buatDokumenCetakAction + missing templateCetakId -> /Template Cetak wajib/i", async () => {
    await expect(
      buatDokumenCetakAction(formData({ drafEraportId: "er_1", format: "a4" }))
    ).rejects.toThrow(/Template Cetak wajib/i);
    expect(buatDokumenCetak).not.toHaveBeenCalled();
  });

  it("14. buatDokumenCetakAction + invalid format -> /Format Kertas tidak valid/i", async () => {
    await expect(
      buatDokumenCetakAction(
        formData({ drafEraportId: "er_1", templateCetakId: "tpl_1", format: "letter" })
      )
    ).rejects.toThrow(/Format Kertas tidak valid/i);
    expect(buatDokumenCetak).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F. Non-active context (denied / choose) — no active Satuan Pendidikan.
// ===========================================================================

describe("F. non-active akses context", () => {
  it("15. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(
      buatTemplateCetakAction(formData({ nama: "X" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("16. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    await expect(
      buatDokumenCetakAction(
        formData({ drafEraportId: "er_1", templateCetakId: "tpl_1", format: "a4" })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. dev role is admin-equivalent; tenant tamper-proofing.
// ===========================================================================

describe("G. dev role + tenant tamper-proofing", () => {
  it("17. buatTemplateCetakAction with dev role -> succeeds (repo + audit)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("dev"));
    await buatTemplateCetakAction(formData({ nama: "Dev" }));
    expect(buatTemplateCetak).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/cetak");
  });

  it("18. bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await buatTemplateCetakAction(
      formData({ nama: "Tamper", tenantId: "org_VICTIM" })
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
