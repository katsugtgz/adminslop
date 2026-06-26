import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors src/app/dashboard/akses/actions.test.ts + penilaian/actions.test.ts:
// hoist all mocks, mock the modules to wire them in, then import the actions
// under test. Absensi has no ownership-chain resolution (it's rombel-scoped,
// not beban-scoped), so the mock surface is simpler than penilaian — just the
// two repo functions (catatAbsensi / ubahAbsensi) + the authz + DB plumbing.

const mocks = vi.hoisted(() => {
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn({ __tx: true })
    ),
    catatAudit: vi.fn(async () => undefined),
    catatAbsensi: vi.fn(async () => ({ id: "absensi_new" })),
    ubahAbsensi: vi.fn(async () => ({ id: "absensi_1" })),
    revalidatePath: vi.fn(),
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
} = mocks;

const fakeTx = { __tx: true };

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/absensi", () => ({
  catatAbsensi: mocks.catatAbsensi,
  ubahAbsensi: mocks.ubahAbsensi,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

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
 * helper in penilaian/actions.test.ts (no ptkId thread — absensi is not
 * ownership-gated).
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
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
      ptkId: null,
      nama: "Guru A",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    },
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
  catatAbsensi.mockReset();
  ubahAbsensi.mockReset();
  revalidatePath.mockReset();
  // restore default implementations cleared by mockReset
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(async (_db, _tenantId, fn) => fn(fakeTx));
  catatAbsensi.mockResolvedValue({ id: "absensi_new" });
  ubahAbsensi.mockResolvedValue({ id: "absensi_1" });
  catatAudit.mockResolvedValue(undefined);
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

    expect(catatAbsensi).toHaveBeenCalledWith(fakeTx, {
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

    expect(catatAbsensi).toHaveBeenCalledWith(fakeTx, {
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

    expect(ubahAbsensi).toHaveBeenCalledWith(fakeTx, "absensi_1", {
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
