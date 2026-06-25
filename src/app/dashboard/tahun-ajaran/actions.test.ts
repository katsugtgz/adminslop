import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors the idiom in src/app/dashboard/akses/actions.test.ts: hoist all
// mocks, mock the modules to wire them in, then import the actions under test.

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
    buatTahunAjaran: vi.fn(
      async (_tx: unknown, input: { nama: string }) => ({
        id: "ta_new",
        tenantId: "org_A",
        nama: input.nama,
        aktif: false,
        dibuatPada: new Date("2026-01-01T00:00:00Z"),
      })
    ),
    aktifkanTahunAjaran: vi.fn(async (_tx: unknown, id: string) => ({
      id,
      tenantId: "org_A",
      nama: "2026/2027",
      aktif: true,
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    })),
    ubahSemesterAktif: vi.fn(async () => undefined),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  buatTahunAjaran,
  aktifkanTahunAjaran,
  ubahSemesterAktif,
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
vi.mock("@/db/queries/tahun-ajaran", () => ({
  buatTahunAjaran: mocks.buatTahunAjaran,
  aktifkanTahunAjaran: mocks.aktifkanTahunAjaran,
  ubahSemesterAktif: mocks.ubahSemesterAktif,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  aktifkanTahunAjaranAction,
  simpanTahunAjaranBaruAction,
  ubahSemesterAktifAction,
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

const REVALIDATE_TARGET = "/dashboard/tahun-ajaran";

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default) so the tests are
 * realistic. Tahun Ajaran kelola is granted to admin/dev only; kepala_sekolah
 * gets `tahun_ajaran:baca` (read-only).
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: ["tahun_ajaran:baca", "tahun_ajaran:kelola"],
    dev: ["tahun_ajaran:baca", "tahun_ajaran:kelola"],
    kepala_sekolah: ["tahun_ajaran:baca"],
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
  buatTahunAjaran.mockReset();
  aktifkanTahunAjaran.mockReset();
  ubahSemesterAktif.mockReset();
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
  buatTahunAjaran.mockImplementation(
    async (_tx: unknown, input: { nama: string }) => ({
      id: "ta_new",
      tenantId: "org_A",
      nama: input.nama,
      aktif: false,
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    })
  );
  aktifkanTahunAjaran.mockImplementation(async (_tx: unknown, id: string) => ({
    id,
    tenantId: "org_A",
    nama: "2026/2027",
    aktif: true,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  }));
  ubahSemesterAktif.mockResolvedValue(undefined);
  catatAudit.mockResolvedValue(undefined);
});

// ===========================================================================
// A. Authorization denial (kepala_sekolah — has tahun_ajaran:baca only).
// Core security: action throws BEFORE any DB write.
// ===========================================================================

describe("A. authorization denial — kepala_sekolah (tahun_ajaran:baca only)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
  });

  it("1. simpanTahunAjaranBaruAction -> throws /izin/i; buatTahunAjaran + audit + withTenant NOT called", async () => {
    await expect(
      simpanTahunAjaranBaruAction(formData({ nama: "2026/2027" }))
    ).rejects.toThrow(/izin/i);
    expect(buatTahunAjaran).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. aktifkanTahunAjaranAction -> throws /izin/i; aktifkanTahunAjaran + audit NOT called", async () => {
    await expect(
      aktifkanTahunAjaranAction(formData({ id: "ta_1" }))
    ).rejects.toThrow(/izin/i);
    expect(aktifkanTahunAjaran).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("3. ubahSemesterAktifAction -> throws /izin/i; ubahSemesterAktif + audit NOT called", async () => {
    await expect(
      ubahSemesterAktifAction(formData({ semester: "ganjil" }))
    ).rejects.toThrow(/izin/i);
    expect(ubahSemesterAktif).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Authorization success (admin_satuan_pendidikan) — DB write + audit.
// ===========================================================================

describe("B. authorization success — admin_satuan_pendidikan", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("4. simpanTahunAjaranBaruAction -> buatTahunAjaran + audit(buat_tahun_ajaran) + revalidatePath", async () => {
    await simpanTahunAjaranBaruAction(formData({ nama: "2026/2027" }));
    expect(buatTahunAjaran).toHaveBeenCalledWith(fakeTxRef, {
      nama: "2026/2027",
    });
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_tahun_ajaran",
        target: expect.stringMatching(/^tahun_ajaran:/),
        beban: { nama: "2026/2027" },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith(REVALIDATE_TARGET);
  });

  it("5. aktifkanTahunAjaranAction -> aktifkanTahunAjaran(tx, id) + audit(aktifkan_tahun_ajaran)", async () => {
    await aktifkanTahunAjaranAction(formData({ id: "ta_42" }));
    expect(aktifkanTahunAjaran).toHaveBeenCalledWith(fakeTxRef, "ta_42");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "aktifkan_tahun_ajaran",
        target: "tahun_ajaran:ta_42",
        beban: { id: "ta_42" },
      })
    );
  });

  it("6. ubahSemesterAktifAction -> ubahSemesterAktif(tx, {semester}) + audit(ubah_semester_aktif)", async () => {
    await ubahSemesterAktifAction(formData({ semester: "genap" }));
    expect(ubahSemesterAktif).toHaveBeenCalledWith(fakeTxRef, {
      semester: "genap",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "ubah_semester_aktif",
        target: "satuan_pendidikan:org_A",
        beban: { semester: "genap" },
      })
    );
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary".
// A client that bypasses the UI and POSTs raw FormData is STILL blocked
// server-side. This is acceptance criterion #5 of issue #8.
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("kepala_sekolah calling aktifkanTahunAjaranAction directly (no UI) -> denied; no DB write; no audit", async () => {
    // The page would hide the activate button for kepala_sekolah, but a
    // hostile client can bypass the UI and POST the action fn directly. The
    // server MUST still refuse — UI hiding is defense-in-depth, NOT the
    // boundary.
    getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));

    await expect(
      aktifkanTahunAjaranAction(formData({ id: "ta_secret" }))
    ).rejects.toThrow(/izin/i);

    expect(aktifkanTahunAjaran).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. Manual validation failures (no zod) — throws BEFORE any repo call.
// ===========================================================================

describe("D. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("7. simpanTahunAjaranBaruAction + empty nama -> /Nama Tahun Ajaran wajib diisi/i; buatTahunAjaran NOT called", async () => {
    await expect(
      simpanTahunAjaranBaruAction(formData({ nama: "   " }))
    ).rejects.toThrow(/Nama Tahun Ajaran wajib diisi/i);
    expect(buatTahunAjaran).not.toHaveBeenCalled();
  });

  it("8. aktifkanTahunAjaranAction + missing id -> /ID Tahun Ajaran wajib diisi/i; aktifkanTahunAjaran NOT called", async () => {
    await expect(
      aktifkanTahunAjaranAction(formData({ id: "" }))
    ).rejects.toThrow(/ID Tahun Ajaran wajib diisi/i);
    expect(aktifkanTahunAjaran).not.toHaveBeenCalled();
  });

  it("9. ubahSemesterAktifAction + invalid semester -> /Semester tidak valid/i; ubahSemesterAktif NOT called", async () => {
    await expect(
      ubahSemesterAktifAction(formData({ semester: "hacker" }))
    ).rejects.toThrow(/Semester tidak valid/i);
    expect(ubahSemesterAktif).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// E. Non-active context (denied / choose).
// ===========================================================================

describe("E. non-active akses context", () => {
  it("10. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);

    await expect(
      simpanTahunAjaranBaruAction(formData({ nama: "2026/2027" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("11. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);

    await expect(
      aktifkanTahunAjaranAction(formData({ id: "ta_1" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("F. tenant tamper-proofing", () => {
  it("12. bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    // Hostile client injects a victim tenant id into the formData.
    await simpanTahunAjaranBaruAction(
      formData({ nama: "2026/2027", tenantId: "org_VICTIM" })
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
// G. dev role is admin-equivalent (scoped to seeded tenants — NOT superuser).
// ===========================================================================

describe("G. dev role behaves like admin", () => {
  it("13. simpanTahunAjaranBaruAction with dev role -> succeeds (buatTahunAjaran + audit)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("dev"));

    await simpanTahunAjaranBaruAction(formData({ nama: "2027/2028" }));

    expect(buatTahunAjaran).toHaveBeenCalledWith(fakeTxRef, {
      nama: "2027/2028",
    });
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith(REVALIDATE_TARGET);
  });
});
