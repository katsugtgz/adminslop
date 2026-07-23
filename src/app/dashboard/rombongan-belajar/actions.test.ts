import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors the idiom in src/app/dashboard/akses/actions.test.ts: hoist all
// mocks, mock the modules to wire them in, then import the actions under test.

const mocks = vi.hoisted(() => {
  const fakeTxLocal = { __tx: true };
  // Stable fixture rows reused across "success" paths. Each test can override
  // via mockImplementation/mockResolvedValueOnce as needed.
  const TA_AKTIF = {
    id: "ta_1",
    tenantId: "org_A",
    nama: "2025/2026",
    aktif: true,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  };
  const TA_BARU = {
    id: "ta_2",
    tenantId: "org_A",
    nama: "2026/2027",
    aktif: false,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  };
  const SEMESTER_AKTIF = "ganjil" as const;
  const PENEMPATAN = {
    id: "pen_1",
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    rombonganBelajarId: "rombel_1",
    tahunAjaranId: "ta_1",
    semester: "ganjil" as const,
    status: "aktif" as const,
    catatan: null,
    dibuatOleh: "workos_u_1",
    dibuatPada: new Date("2026-01-05T00:00:00Z"),
  };
  const ROMBEL = {
    id: "rombel_1",
    tenantId: "org_A",
    nama: "Kelas 1A",
    tingkatId: "tingkat_1",
    tahunAjaranId: "ta_1",
    dibuatPada: new Date("2026-01-02T00:00:00Z"),
  };
  const TINGKAT = {
    id: "tingkat_1",
    tenantId: "org_A",
    nama: "Kelas 1",
    urutan: 1,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  };
  const NEXT_TINGKAT = {
    id: "tingkat_2",
    tenantId: "org_A",
    nama: "Kelas 2",
    urutan: 2,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  };
  const NEXT_ROMBEL = {
    id: "rombel_2",
    tenantId: "org_A",
    nama: "Kelas 1A",
    tingkatId: "tingkat_2",
    tahunAjaranId: "ta_2",
    dibuatPada: new Date("2026-01-02T00:00:00Z"),
  };
  return {
    getAksesSaya: vi.fn(),
    requireAksesAktif: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    // withTenant runs the callback with fakeTx so repo fns receive it.
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTxLocal)
    ),
    catatAudit: vi.fn(async () => undefined),
    // repos
    buatTingkat: vi.fn(async (_tx: unknown, input: { nama: string; urutan: number }) => ({
      id: "tingkat_new",
      tenantId: "org_A",
      nama: input.nama,
      urutan: input.urutan,
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    })),
    cariTingkatById: vi.fn(async () => TINGKAT),
    // The four "find-or-null" repos are explicitly typed `T | null` so that
    // `mockResolvedValue(null)` is accepted in the guard-path tests below.
    cariTingkatBerikutnya: vi.fn(
      async (): Promise<typeof NEXT_TINGKAT | null> => NEXT_TINGKAT
    ),
    buatRombonganBelajar: vi.fn(async () => NEXT_ROMBEL),
    cariRombonganBelajarById: vi.fn(
      async (): Promise<typeof ROMBEL | null> => ROMBEL
    ),
    cariAtauBuatRombonganBelajar: vi.fn(async () => NEXT_ROMBEL),
    tambahPenempatan: vi.fn(async () => ({})),
    getPenempatanByKonteks: vi.fn(
      async (): Promise<typeof PENEMPATAN | null> => PENEMPATAN
    ),
    getTahunAjaranAktif: vi.fn(
      async (): Promise<typeof TA_AKTIF | null> => TA_AKTIF
    ),
    cariTahunAjaranById: vi.fn(
      async (): Promise<typeof TA_BARU | null> => TA_BARU
    ),
    getSemesterAktif: vi.fn(
      async (): Promise<typeof SEMESTER_AKTIF | null> => SEMESTER_AKTIF
    ),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  requireAksesAktif,
  getDb,
  withTenant,
  catatAudit,
  buatTingkat,
  cariTingkatById,
  cariTingkatBerikutnya,
  buatRombonganBelajar,
  cariRombonganBelajarById,
  cariAtauBuatRombonganBelajar,
  tambahPenempatan,
  getPenempatanByKonteks,
  getTahunAjaranAktif,
  cariTahunAjaranById,
  getSemesterAktif,
  revalidatePath,
  fakeTx: fakeTxRef,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
  requireAksesAktif: mocks.requireAksesAktif,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/tingkat", () => ({
  buatTingkat: mocks.buatTingkat,
  cariTingkatById: mocks.cariTingkatById,
  cariTingkatBerikutnya: mocks.cariTingkatBerikutnya,
}));
vi.mock("@/db/queries/rombongan-belajar", () => ({
  buatRombonganBelajar: mocks.buatRombonganBelajar,
  cariRombonganBelajarById: mocks.cariRombonganBelajarById,
  cariAtauBuatRombonganBelajar: mocks.cariAtauBuatRombonganBelajar,
}));
vi.mock("@/db/queries/penempatan-rombongan-belajar", () => ({
  tambahPenempatan: mocks.tambahPenempatan,
  getPenempatanByKonteks: mocks.getPenempatanByKonteks,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  cariTahunAjaranById: mocks.cariTahunAjaranById,
  getSemesterAktif: mocks.getSemesterAktif,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  kenaikanTingkatAction,
  simpanRombonganBelajarBaruAction,
  simpanTingkatBaruAction,
  tempatkanPesertaDidikAction,
  tinggalTingkatAction,
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
 * realistic. guru has NO default rombongan_belajar izin — only :baca in this
 * test's model, mirroring the seeded akses for the Wave 3 pages.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  // guru gets the read-only default for this module; everything else is denied.
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "rombongan_belajar:baca",
      "rombongan_belajar:buat",
      "rombongan_belajar:ubah",
      "rombongan_belajar:kelola_penempatan",
    ],
    dev: [
      "rombongan_belajar:baca",
      "rombongan_belajar:buat",
      "rombongan_belajar:ubah",
      "rombongan_belajar:kelola_penempatan",
    ],
    kepala_sekolah: ["rombongan_belajar:baca"],
    guru: ["rombongan_belajar:baca"],
    wali_kelas: ["rombongan_belajar:baca"],
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
  requireAksesAktif.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  buatTingkat.mockReset();
  cariTingkatById.mockReset();
  cariTingkatBerikutnya.mockReset();
  buatRombonganBelajar.mockReset();
  cariRombonganBelajarById.mockReset();
  cariAtauBuatRombonganBelajar.mockReset();
  tambahPenempatan.mockReset();
  getPenempatanByKonteks.mockReset();
  getTahunAjaranAktif.mockReset();
  cariTahunAjaranById.mockReset();
  getSemesterAktif.mockReset();
  revalidatePath.mockReset();
  // restore default implementations cleared by mockReset
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  requireAksesAktif.mockImplementation(
    async (izin: string, pesanTolak?: string) => {
      const akses = await getAksesSaya();
      if (!akses || akses.status !== "active") {
        throw new Error("Satuan Pendidikan Aktif belum dipilih.");
      }
      if (!akses.boleh(izin).diizinkan) {
        throw new Error(
          pesanTolak ?? "Anda tidak memiliki izin untuk aksi ini."
        );
      }
      return akses;
    }
  );
  withTenant.mockImplementation(
    async (
      _db: unknown,
      _tenantId: unknown,
      fn: (tx: unknown) => Promise<unknown>
    ) => fn(fakeTxRef)
  );
  catatAudit.mockResolvedValue(undefined);
  buatTingkat.mockImplementation(
    async (_tx: unknown, input: { nama: string; urutan: number }) => ({
      id: "tingkat_new",
      tenantId: "org_A",
      nama: input.nama,
      urutan: input.urutan,
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    })
  );
  cariTingkatById.mockResolvedValue({
    id: "tingkat_1",
    tenantId: "org_A",
    nama: "Kelas 1",
    urutan: 1,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  });
  cariTingkatBerikutnya.mockResolvedValue({
    id: "tingkat_2",
    tenantId: "org_A",
    nama: "Kelas 2",
    urutan: 2,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  });
  buatRombonganBelajar.mockResolvedValue({
    id: "rombel_new",
    tenantId: "org_A",
    nama: "Kelas 1A",
    tingkatId: "tingkat_1",
    tahunAjaranId: "ta_1",
    dibuatPada: new Date("2026-01-02T00:00:00Z"),
  });
  cariRombonganBelajarById.mockResolvedValue({
    id: "rombel_1",
    tenantId: "org_A",
    nama: "Kelas 1A",
    tingkatId: "tingkat_1",
    tahunAjaranId: "ta_1",
    dibuatPada: new Date("2026-01-02T00:00:00Z"),
  });
  cariAtauBuatRombonganBelajar.mockResolvedValue({
    id: "rombel_2",
    tenantId: "org_A",
    nama: "Kelas 1A",
    tingkatId: "tingkat_2",
    tahunAjaranId: "ta_2",
    dibuatPada: new Date("2026-01-02T00:00:00Z"),
  });
  tambahPenempatan.mockResolvedValue({});
  getPenempatanByKonteks.mockResolvedValue({
    id: "pen_1",
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    rombonganBelajarId: "rombel_1",
    tahunAjaranId: "ta_1",
    semester: "ganjil",
    status: "aktif",
    catatan: null,
    dibuatOleh: "workos_u_1",
    dibuatPada: new Date("2026-01-05T00:00:00Z"),
  });
  getTahunAjaranAktif.mockResolvedValue({
    id: "ta_1",
    tenantId: "org_A",
    nama: "2025/2026",
    aktif: true,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  });
  cariTahunAjaranById.mockResolvedValue({
    id: "ta_2",
    tenantId: "org_A",
    nama: "2026/2027",
    aktif: false,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  });
  getSemesterAktif.mockResolvedValue("ganjil");
});

// ===========================================================================
// A. Authorization denial (guru) — core security: action throws BEFORE any DB.
// guru has ONLY rombongan_belajar:baca — every write below MUST throw.
// ===========================================================================

describe("A. authorization denial — guru role (rombongan_belajar:baca only)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("1. simpanTingkatBaruAction -> throws /izin/i; buatTingkat + audit + withTenant NOT called", async () => {
    await expect(
      simpanTingkatBaruAction(formData({ nama: "Kelas 1", urutan: "1" }))
    ).rejects.toThrow(/izin/i);
    expect(buatTingkat).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. simpanRombonganBelajarBaruAction -> throws /izin/i; buatRombonganBelajar NOT called", async () => {
    await expect(
      simpanRombonganBelajarBaruAction(
        formData({ nama: "Kelas 1A", tingkatId: "tingkat_1" })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatRombonganBelajar).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("3. tempatkanPesertaDidikAction -> throws /izin/i; tambahPenempatan NOT called", async () => {
    await expect(
      tempatkanPesertaDidikAction(
        formData({ pesertaDidikId: "pd_1", rombonganBelajarId: "rombel_1" })
      )
    ).rejects.toThrow(/izin/i);
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("4. kenaikanTingkatAction -> throws /izin/i; repo chain NOT called", async () => {
    await expect(
      kenaikanTingkatAction(
        formData({ pesertaDidikId: "pd_1", tahunAjaranBaruId: "ta_2" })
      )
    ).rejects.toThrow(/izin/i);
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(getPenempatanByKonteks).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("5. tinggalTingkatAction -> throws /izin/i; tambahPenempatan NOT called", async () => {
    await expect(
      tinggalTingkatAction(
        formData({ pesertaDidikId: "pd_1", tahunAjaranBaruId: "ta_2" })
      )
    ).rejects.toThrow(/izin/i);
    expect(tambahPenempatan).not.toHaveBeenCalled();
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

  it("6. simpanTingkatBaruAction -> buatTingkat + audit(buat_tingkat) + revalidatePath", async () => {
    await simpanTingkatBaruAction(
      formData({ nama: "Kelas 3", urutan: "3" })
    );
    expect(buatTingkat).toHaveBeenCalledWith(fakeTxRef, {
      nama: "Kelas 3",
      urutan: 3,
    });
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_tingkat",
        target: expect.stringMatching(/^tingkat:/),
        beban: { nama: "Kelas 3", urutan: 3 },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/dashboard/rombongan-belajar"
    );
  });

  it("7. simpanRombonganBelajarBaruAction -> resolves active TA server-side; buatRombonganBelajar + audit(buat_rombongan_belajar)", async () => {
    await simpanRombonganBelajarBaruAction(
      formData({ nama: "Kelas 1A", tingkatId: "tingkat_1" })
    );
    // AC#4: active TA resolved inside the tx, NOT from formData.
    expect(getTahunAjaranAktif).toHaveBeenCalledWith(fakeTxRef);
    expect(buatRombonganBelajar).toHaveBeenCalledWith(fakeTxRef, {
      nama: "Kelas 1A",
      tingkatId: "tingkat_1",
      tahunAjaranId: "ta_1",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "buat_rombongan_belajar",
        beban: {
          nama: "Kelas 1A",
          tingkatId: "tingkat_1",
          tahunAjaranId: "ta_1",
        },
      })
    );
  });

  it("8. simpanRombonganBelajarBaruAction + no active TA -> throws /Belum ada Tahun Ajaran aktif/i; buatRombonganBelajar NOT called", async () => {
    getTahunAjaranAktif.mockResolvedValue(null);
    await expect(
      simpanRombonganBelajarBaruAction(
        formData({ nama: "Kelas 1A", tingkatId: "tingkat_1" })
      )
    ).rejects.toThrow(/Belum ada Tahun Ajaran aktif/i);
    expect(buatRombonganBelajar).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("9. tempatkanPesertaDidikAction -> resolves active TA + semester server-side; tambahPenempatan(status='aktif') + audit", async () => {
    await tempatkanPesertaDidikAction(
      formData({ pesertaDidikId: "pd_1", rombonganBelajarId: "rombel_1" })
    );
    // AC#4: BOTH konteks fields resolved inside the tx, never from formData.
    expect(getTahunAjaranAktif).toHaveBeenCalledWith(fakeTxRef);
    expect(getSemesterAktif).toHaveBeenCalledWith(fakeTxRef);
    expect(tambahPenempatan).toHaveBeenCalledWith(fakeTxRef, {
      pesertaDidikId: "pd_1",
      rombonganBelajarId: "rombel_1",
      tahunAjaranId: "ta_1",
      semester: "ganjil",
      status: "aktif",
      dibuatOleh: "workos_u_1",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "tempatkan_peserta_didik",
        target: "peserta_didik:pd_1",
      })
    );
  });

  it("10. tempatkanPesertaDidikAction + no active semester -> throws /Belum ada semester aktif/i; tambahPenempatan NOT called", async () => {
    getSemesterAktif.mockResolvedValue(null);
    await expect(
      tempatkanPesertaDidikAction(
        formData({ pesertaDidikId: "pd_1", rombonganBelajarId: "rombel_1" })
      )
    ).rejects.toThrow(/Belum ada semester aktif/i);
    expect(tambahPenempatan).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary"
// A guru that bypasses the UI and POSTs raw FormData is STILL blocked
// server-side. This is acceptance criterion #5 of issue #8.
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("guru calling tempatkanPesertaDidikAction directly (no UI) -> denied; no DB write; no audit", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await expect(
      tempatkanPesertaDidikAction(
        formData({ pesertaDidikId: "pd_secret", rombonganBelajarId: "rombel_1" })
      )
    ).rejects.toThrow(/izin/i);
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("admin calling tempatkanPesertaDidikAction directly -> succeeds; DB write + audit happen", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await tempatkanPesertaDidikAction(
      formData({ pesertaDidikId: "pd_secret", rombonganBelajarId: "rombel_1" })
    );
    expect(tambahPenempatan).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({ pesertaDidikId: "pd_secret" })
    );
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("admin WITH pembatasan['rombongan_belajar:kelola_penempatan'] -> DENIED (pembatasan wins, no superuser)", async () => {
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", {
        pembatasan: ["rombongan_belajar:kelola_penempatan"],
      })
    );
    await expect(
      tempatkanPesertaDidikAction(
        formData({ pesertaDidikId: "pd_locked", rombonganBelajarId: "rombel_1" })
      )
    ).rejects.toThrow(/izin/i);
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. kenaikanTingkat composition — ATOMIC: all reads + the append run in ONE
// withTenant tx. Old penempatan untouched; new penempatan with status='naik'
// appended (AC#3 + AC#5).
// ===========================================================================

describe("D. kenaikanTingkat composition (admin)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("11. composes the full chain in ONE tx; appends status='naik' to next-grade rombel in the new TA", async () => {
    await kenaikanTingkatAction(
      formData({ pesertaDidikId: "pd_1", tahunAjaranBaruId: "ta_2" })
    );

    // AC#3 proof: the entire composition runs in a SINGLE withTenant call.
    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(withTenant).toHaveBeenCalledWith(DB, "org_A", expect.anything());

    // The repo chain was walked in the correct order, all under fakeTx.
    expect(getTahunAjaranAktif).toHaveBeenCalledWith(fakeTxRef);
    expect(getSemesterAktif).toHaveBeenCalledWith(fakeTxRef);
    expect(getPenempatanByKonteks).toHaveBeenCalledWith(
      fakeTxRef,
      "pd_1",
      "ta_1",
      "ganjil"
    );
    expect(cariRombonganBelajarById).toHaveBeenCalledWith(fakeTxRef, "rombel_1");
    expect(cariTingkatById).toHaveBeenCalledWith(fakeTxRef, "tingkat_1");
    expect(cariTingkatBerikutnya).toHaveBeenCalledWith(fakeTxRef, 1);
    expect(cariAtauBuatRombonganBelajar).toHaveBeenCalledWith(fakeTxRef, {
      nama: "Kelas 1A",
      tingkatId: "tingkat_2",
      tahunAjaranId: "ta_2",
    });

    // AC#3 + AC#5 proof: NEW placement appended with status='naik', pointing at
    // the next-grade rombel in the NEW TA. Old penempatan never updated.
    expect(tambahPenempatan).toHaveBeenCalledWith(fakeTxRef, {
      pesertaDidikId: "pd_1",
      rombonganBelajarId: "rombel_2",
      tahunAjaranId: "ta_2",
      semester: "ganjil",
      status: "naik",
      dibuatOleh: "workos_u_1",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "kenaikan_tingkat",
        target: "peserta_didik:pd_1",
        beban: expect.objectContaining({
          keTahunAjaranId: "ta_2",
          keTingkatId: "tingkat_2",
        }),
      })
    );
  });

  it("12. guru DIRECT call to kenaikanTingkatAction -> throws /izin/i; full chain NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await expect(
      kenaikanTingkatAction(
        formData({ pesertaDidikId: "pd_1", tahunAjaranBaruId: "ta_2" })
      )
    ).rejects.toThrow(/izin/i);
    expect(getPenempatanByKonteks).not.toHaveBeenCalled();
    expect(tambahPenempatan).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// E. tinggalTingkat composition — mirror of D but SAME tingkat (no
// progression) and status='tinggal'.
// ===========================================================================

describe("E. tinggalTingkat composition (admin)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    // For tinggal, cariAtauBuat returns a rombel in the SAME tingkat.
    cariAtauBuatRombonganBelajar.mockResolvedValue({
      id: "rombel_same",
      tenantId: "org_A",
      nama: "Kelas 1A",
      tingkatId: "tingkat_1", // SAME tingkat — no progression
      tahunAjaranId: "ta_2",
      dibuatPada: new Date("2026-01-02T00:00:00Z"),
    });
  });

  it("13. composes the chain in ONE tx; appends status='tinggal' to SAME-grade rombel; tingkatBerikutnya NOT called", async () => {
    await tinggalTingkatAction(
      formData({ pesertaDidikId: "pd_1", tahunAjaranBaruId: "ta_2" })
    );

    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(getPenempatanByKonteks).toHaveBeenCalledWith(
      fakeTxRef,
      "pd_1",
      "ta_1",
      "ganjil"
    );
    expect(cariRombonganBelajarById).toHaveBeenCalledWith(fakeTxRef, "rombel_1");
    // KEY DIFFERENCE from kenaikan: tingkat progression is NOT consulted.
    expect(cariTingkatBerikutnya).not.toHaveBeenCalled();
    // Same tingkat as the source rombel.
    expect(cariAtauBuatRombonganBelajar).toHaveBeenCalledWith(fakeTxRef, {
      nama: "Kelas 1A",
      tingkatId: "tingkat_1",
      tahunAjaranId: "ta_2",
    });
    expect(tambahPenempatan).toHaveBeenCalledWith(fakeTxRef, {
      pesertaDidikId: "pd_1",
      rombonganBelajarId: "rombel_same",
      tahunAjaranId: "ta_2",
      semester: "ganjil",
      status: "tinggal",
      dibuatOleh: "workos_u_1",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "tinggal_tingkat",
        beban: expect.objectContaining({ tingkatId: "tingkat_1" }),
      })
    );
  });
});

// ===========================================================================
// F. kenaikanTingkat top-grade — student already at the highest tingkat.
// ===========================================================================

describe("F. kenaikanTingkat top-grade guard", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    cariTingkatBerikutnya.mockResolvedValue(null); // no next grade
  });

  it("14. cariTingkatBerikutnya -> null => throws /tingkat tertinggi/i; tambahPenempatan + cariAtauBuat NOT called", async () => {
    await expect(
      kenaikanTingkatAction(
        formData({ pesertaDidikId: "pd_1", tahunAjaranBaruId: "ta_2" })
      )
    ).rejects.toThrow(/Peserta Didik sudah di tingkat tertinggi/i);
    expect(cariAtauBuatRombonganBelajar).not.toHaveBeenCalled();
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. kenaikanTingkat no-placement — student has no current placement in the
// active context, so there is nothing to progress FROM.
// ===========================================================================

describe("G. kenaikanTingkat no-placement guard", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    getPenempatanByKonteks.mockResolvedValue(null);
  });

  it("15. getPenempatanByKonteks -> null => throws /belum ditempatkan/i; tingkat chain NOT called", async () => {
    await expect(
      kenaikanTingkatAction(
        formData({ pesertaDidikId: "pd_1", tahunAjaranBaruId: "ta_2" })
      )
    ).rejects.toThrow(/belum ditempatkan/i);
    expect(cariRombonganBelajarById).not.toHaveBeenCalled();
    expect(cariTingkatById).not.toHaveBeenCalled();
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// H. Manual validation failures (no zod).
// ===========================================================================

describe("H. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("16. simpanTingkatBaruAction + empty nama -> /Nama Tingkat wajib diisi/i; buatTingkat NOT called", async () => {
    await expect(
      simpanTingkatBaruAction(formData({ nama: "   ", urutan: "1" }))
    ).rejects.toThrow(/Nama Tingkat wajib diisi/i);
    expect(buatTingkat).not.toHaveBeenCalled();
  });

  it("17. simpanTingkatBaruAction + missing urutan -> /Urutan wajib diisi/i; buatTingkat NOT called", async () => {
    await expect(
      simpanTingkatBaruAction(formData({ nama: "Kelas 1" }))
    ).rejects.toThrow(/Urutan wajib diisi/i);
    expect(buatTingkat).not.toHaveBeenCalled();
  });

  it("18. simpanTingkatBaruAction + non-numeric urutan -> /Urutan wajib diisi/i; buatTingkat NOT called", async () => {
    await expect(
      simpanTingkatBaruAction(formData({ nama: "Kelas 1", urutan: "abc" }))
    ).rejects.toThrow(/Urutan wajib diisi/i);
    expect(buatTingkat).not.toHaveBeenCalled();
  });

  it("19. simpanRombonganBelajarBaruAction + missing tingkatId -> /Tingkat wajib dipilih/i; buatRombonganBelajar NOT called", async () => {
    await expect(
      simpanRombonganBelajarBaruAction(formData({ nama: "Kelas 1A" }))
    ).rejects.toThrow(/Tingkat wajib dipilih/i);
    expect(buatRombonganBelajar).not.toHaveBeenCalled();
  });

  it("20. tempatkanPesertaDidikAction + missing pesertaDidikId -> /ID Peserta Didik wajib diisi/i; tambahPenempatan NOT called", async () => {
    await expect(
      tempatkanPesertaDidikAction(formData({ rombonganBelajarId: "rombel_1" }))
    ).rejects.toThrow(/ID Peserta Didik wajib diisi/i);
    expect(tambahPenempatan).not.toHaveBeenCalled();
  });

  it("21. kenaikanTingkatAction + missing tahunAjaranBaruId -> /Tahun Ajaran baru wajib dipilih/i; chain NOT called", async () => {
    await expect(
      kenaikanTingkatAction(formData({ pesertaDidikId: "pd_1" }))
    ).rejects.toThrow(/Tahun Ajaran baru wajib dipilih/i);
    expect(getPenempatanByKonteks).not.toHaveBeenCalled();
    expect(tambahPenempatan).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// I. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("I. tenant tamper-proofing", () => {
  it("22. bogus formData orgId is IGNORED; withTenant uses membership.orgId (tempatkanPesertaDidikAction)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await tempatkanPesertaDidikAction(
      formData({
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        orgId: "org_VICTIM", // hostile injection — must be ignored
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

  it("23. bogus formData tenantId on kenaikanTingkatAction is IGNORED too", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await kenaikanTingkatAction(
      formData({
        pesertaDidikId: "pd_1",
        tahunAjaranBaruId: "ta_2",
        tenantId: "org_VICTIM",
      })
    );

    expect(withTenant).toHaveBeenCalledWith(DB, "org_A", expect.anything());
    expect(withTenant).not.toHaveBeenCalledWith(
      DB,
      "org_VICTIM",
      expect.anything()
    );
  });
});

// ===========================================================================
// J. Non-active akses context — every action refuses until a Satuan Pendidikan
// is picked.
// ===========================================================================

describe("J. non-active akses context", () => {
  it("24. getAksesSaya denied -> simpanTingkatBaruAction throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(
      simpanTingkatBaruAction(formData({ nama: "Kelas 1", urutan: "1" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("25. getAksesSaya choose -> tempatkanPesertaDidikAction throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    await expect(
      tempatkanPesertaDidikAction(
        formData({ pesertaDidikId: "pd_1", rombonganBelajarId: "rombel_1" })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// K. cubic P1 — tenant-scoped existence checks. Client-supplied FK ids are
// validated against the active tenant / active context BEFORE any write.
// ===========================================================================

describe("K. cubic P1 tenant-scoped existence checks (admin)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  // --- P1-3: tempatkanPesertaDidikAction must verify the rombel belongs to
  // the active Tahun Ajaran ---------------------------------------------

  it("26. tempatkanPesertaDidikAction + cross-tenant rombel (cariRombonganBelajarById -> null) -> throws /tidak ditemukan/i; tambahPenempatan NOT called", async () => {
    // RLS makes a cross-tenant rombel id invisible -> null -> hard reject.
    cariRombonganBelajarById.mockResolvedValue(null);
    await expect(
      tempatkanPesertaDidikAction(
        formData({ pesertaDidikId: "pd_1", rombonganBelajarId: "rombel_X" })
      )
    ).rejects.toThrow(/Rombongan Belajar tidak ditemukan/i);
    expect(cariRombonganBelajarById).toHaveBeenCalledWith(fakeTxRef, "rombel_X");
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("27. tempatkanPesertaDidikAction + rombel from a DIFFERENT TA -> throws /bukan dari Tahun Ajaran aktif/i; tambahPenempatan NOT called", async () => {
    // Same-tenant rombel but belongs to a non-active TA — would otherwise
    // create a placement inconsistent with the active context.
    cariRombonganBelajarById.mockResolvedValue({
      id: "rombel_old",
      tenantId: "org_A",
      nama: "Kelas 1A",
      tingkatId: "tingkat_1",
      tahunAjaranId: "ta_999", // NOT the active TA (ta_1)
      dibuatPada: new Date("2026-01-02T00:00:00Z"),
    });
    await expect(
      tempatkanPesertaDidikAction(
        formData({ pesertaDidikId: "pd_1", rombonganBelajarId: "rombel_old" })
      )
    ).rejects.toThrow(/bukan dari Tahun Ajaran aktif/i);
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  // --- P1-4: kenaikanTingkat / tinggalTingkat must verify tahunAjaranBaruId
  // exists in the active tenant -----------------------------------------

  it("28. kenaikanTingkatAction + cross-tenant tahunAjaranBaruId (cariTahunAjaranById -> null) -> throws /tidak ditemukan/i; chain NOT called", async () => {
    cariTahunAjaranById.mockResolvedValue(null);
    await expect(
      kenaikanTingkatAction(
        formData({ pesertaDidikId: "pd_1", tahunAjaranBaruId: "ta_X" })
      )
    ).rejects.toThrow(/Tahun Ajaran baru tidak ditemukan/i);
    expect(cariTahunAjaranById).toHaveBeenCalledWith(fakeTxRef, "ta_X");
    expect(getPenempatanByKonteks).not.toHaveBeenCalled();
    expect(cariAtauBuatRombonganBelajar).not.toHaveBeenCalled();
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("29. tinggalTingkatAction + cross-tenant tahunAjaranBaruId (cariTahunAjaranById -> null) -> throws /tidak ditemukan/i; chain NOT called", async () => {
    cariTahunAjaranById.mockResolvedValue(null);
    await expect(
      tinggalTingkatAction(
        formData({ pesertaDidikId: "pd_1", tahunAjaranBaruId: "ta_X" })
      )
    ).rejects.toThrow(/Tahun Ajaran baru tidak ditemukan/i);
    expect(cariTahunAjaranById).toHaveBeenCalledWith(fakeTxRef, "ta_X");
    expect(getPenempatanByKonteks).not.toHaveBeenCalled();
    expect(cariAtauBuatRombonganBelajar).not.toHaveBeenCalled();
    expect(tambahPenempatan).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});
