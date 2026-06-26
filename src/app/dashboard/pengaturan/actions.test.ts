import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the Pengaturan Satuan Pendidikan server actions (#5).
 *
 * The actions are the core authorization choke-point: they must
 *   - re-validate the active membership server-side (never trust the client),
 *   - enforce `canAdminSatuanPendidikan` (reject guru / kepala_sekolah),
 *   - validate the payload with zod BEFORE any DB write,
 *   - ignore any tenant id forged in formData (use membership.orgId),
 *   - audit every successful write inside `withTenant`.
 *
 * T4 (`@/db/queries/satuan-pendidikan`) may not be on disk yet — it is fully
 * mocked here, so the test does not depend on the real module.
 */

const mocks = vi.hoisted(() => {
  return {
    getActiveTenantContext: vi.fn(),
    getAuthenticatedUserId: vi.fn(),
    getDb: vi.fn(),
    withTenant: vi.fn(),
    catatAudit: vi.fn(),
    updateProfil: vi.fn(),
    updatePengaturan: vi.fn(),
    getProfilDanPengaturan: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  getActiveTenantContext: mocks.getActiveTenantContext,
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/satuan-pendidikan", () => ({
  getProfilDanPengaturan: mocks.getProfilDanPengaturan,
  updateProfilSatuanPendidikan: mocks.updateProfil,
  updatePengaturanSatuanPendidikan: mocks.updatePengaturan,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  simpanProfilSatuanPendidikanAction,
  simpanPengaturanSatuanPendidikanAction,
} from "./actions";

/** Sentinels so we can assert the exact tx/db identity flows through. */
const FAKE_TX = { kind: "tx" } as unknown;
const FAKE_DB = { kind: "db" };

function formData(obj: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

const adminCtx = (orgId = "org_A") => ({
  status: "active" as const,
  membership: {
    orgId,
    orgName: "SMP 1",
    roleSlug: "admin_satuan_pendidikan",
  },
});

const profilPayload = (over: Record<string, string> = {}) => ({
  nama: "SMP Negeri 1",
  npsn: "12345678",
  jenjang: "SMP",
  alamat: "Jl. Merdeka 1",
  namaKepala: "Budi",
  logoUrl: "",
  ...over,
});

const pengaturanPayload = (over: Record<string, string> = {}) => ({
  tahunAjaran: "2024/2025",
  semester: "ganjil",
  zonaWaktu: "Asia/Jakarta",
  cetakPaperSize: "A4",
  ...over,
});

beforeEach(() => {
  mocks.getActiveTenantContext.mockReset();
  mocks.getAuthenticatedUserId.mockReset();
  mocks.getDb.mockReset();
  mocks.withTenant.mockReset();
  mocks.catatAudit.mockReset();
  mocks.updateProfil.mockReset();
  mocks.updatePengaturan.mockReset();
  mocks.getProfilDanPengaturan.mockReset();
  mocks.revalidatePath.mockReset();

  mocks.getDb.mockReturnValue({ db: FAKE_DB });
  mocks.withTenant.mockImplementation(
    async (_db: unknown, _id: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn(FAKE_TX),
  );
  mocks.catatAudit.mockResolvedValue(undefined);
});

describe("simpanProfilSatuanPendidikanAction (#5)", () => {
  it("guru role -> throws Bahasa 'izin' + no write + no audit", async () => {
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership: { orgId: "org_A", orgName: "A", roleSlug: "guru" },
    });

    await expect(
      simpanProfilSatuanPendidikanAction(formData(profilPayload())),
    ).rejects.toThrow(/izin/i);

    expect(mocks.updateProfil).not.toHaveBeenCalled();
    expect(mocks.catatAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("admin -> update + audit + revalidate", async () => {
    mocks.getActiveTenantContext.mockResolvedValue(adminCtx());
    mocks.getAuthenticatedUserId.mockResolvedValue("user_A");

    await simpanProfilSatuanPendidikanAction(formData(profilPayload()));

    expect(mocks.updateProfil).toHaveBeenCalledTimes(1);
    expect(mocks.updateProfil).toHaveBeenCalledWith(
      FAKE_TX,
      "org_A",
      expect.objectContaining({
        nama: "SMP Negeri 1",
        jenjang: "SMP",
        npsn: "12345678",
      }),
    );
    expect(mocks.catatAudit).toHaveBeenCalledWith(
      FAKE_TX,
      expect.objectContaining({
        aktor: "user_A",
        aksi: "perbarui_profil_satuan",
        target: "satuan_pendidikan:org_A",
        beban: expect.objectContaining({ nama: "SMP Negeri 1" }),
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/pengaturan",
    );
  });

  it("tampered tenant id in formData is ignored — uses membership.orgId", async () => {
    mocks.getActiveTenantContext.mockResolvedValue(adminCtx("org_A"));
    mocks.getAuthenticatedUserId.mockResolvedValue("user_A");

    const fd = formData({
      ...profilPayload(),
      orgId: "org_X",
      tenantId: "org_X",
    });
    await simpanProfilSatuanPendidikanAction(fd);

    expect(mocks.updateProfil).toHaveBeenCalledWith(
      FAKE_TX,
      "org_A",
      expect.any(Object),
    );
    expect(mocks.updateProfil).not.toHaveBeenCalledWith(
      FAKE_TX,
      "org_X",
      expect.any(Object),
    );
    expect(mocks.catatAudit).toHaveBeenCalledWith(
      FAKE_TX,
      expect.objectContaining({ target: "satuan_pendidikan:org_A" }),
    );
  });

  it("dev role -> admin-equivalent (write proceeds)", async () => {
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership: { orgId: "org_A", orgName: "A", roleSlug: "dev" },
    });
    mocks.getAuthenticatedUserId.mockResolvedValue("user_A");

    await simpanProfilSatuanPendidikanAction(formData(profilPayload()));

    expect(mocks.updateProfil).toHaveBeenCalledTimes(1);
    expect(mocks.catatAudit).toHaveBeenCalledTimes(1);
  });

  it("invalid jenjang (TK) -> throws 'tidak valid' before any DB call", async () => {
    mocks.getActiveTenantContext.mockResolvedValue(adminCtx());

    await expect(
      simpanProfilSatuanPendidikanAction(
        formData(profilPayload({ jenjang: "TK" })),
      ),
    ).rejects.toThrow(/tidak valid/i);

    expect(mocks.updateProfil).not.toHaveBeenCalled();
    expect(mocks.catatAudit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("denied context -> throws 'belum dipilih'", async () => {
    mocks.getActiveTenantContext.mockResolvedValue({ status: "denied" });

    await expect(
      simpanProfilSatuanPendidikanAction(formData(profilPayload())),
    ).rejects.toThrow(/Satuan Pendidikan Aktif belum dipilih/i);

    expect(mocks.updateProfil).not.toHaveBeenCalled();
  });

  it("choose context -> throws 'belum dipilih'", async () => {
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "choose",
      memberships: [
        { orgId: "org_A", orgName: "A", roleSlug: "admin_satuan_pendidikan" },
        { orgId: "org_B", orgName: "B", roleSlug: "guru" },
      ],
    });

    await expect(
      simpanProfilSatuanPendidikanAction(formData(profilPayload())),
    ).rejects.toThrow(/belum dipilih/i);

    expect(mocks.updateProfil).not.toHaveBeenCalled();
  });
});

describe("simpanPengaturanSatuanPendidikanAction (#5)", () => {
  it("kepala_sekolah role -> throws 'izin' + no write", async () => {
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership: { orgId: "org_A", orgName: "A", roleSlug: "kepala_sekolah" },
    });

    await expect(
      simpanPengaturanSatuanPendidikanAction(formData(pengaturanPayload())),
    ).rejects.toThrow(/izin/i);

    expect(mocks.updatePengaturan).not.toHaveBeenCalled();
    expect(mocks.catatAudit).not.toHaveBeenCalled();
  });

  it("admin -> update + audit + revalidate", async () => {
    mocks.getActiveTenantContext.mockResolvedValue(adminCtx());
    mocks.getAuthenticatedUserId.mockResolvedValue("user_A");

    await simpanPengaturanSatuanPendidikanAction(
      formData({
        ...pengaturanPayload(),
        cetakTampilkanLogo: "on",
        cetakTampilkanHeader: "on",
      }),
    );

    expect(mocks.updatePengaturan).toHaveBeenCalledTimes(1);
    expect(mocks.updatePengaturan).toHaveBeenCalledWith(
      FAKE_TX,
      "org_A",
      expect.objectContaining({
        tahunAjaran: "2024/2025",
        semester: "ganjil",
        cetakTampilkanLogo: true,
        cetakTampilkanHeader: true,
      }),
    );
    expect(mocks.catatAudit).toHaveBeenCalledWith(
      FAKE_TX,
      expect.objectContaining({
        aktor: "user_A",
        aksi: "perbarui_pengaturan_satuan",
        target: "satuan_pendidikan:org_A",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/pengaturan",
    );
  });

  it("checkboxes: 'on' -> true, absent -> false", async () => {
    mocks.getActiveTenantContext.mockResolvedValue(adminCtx());
    mocks.getAuthenticatedUserId.mockResolvedValue("user_A");

    // checkboxes absent (no "on"), paper size overridden to F4
    await simpanPengaturanSatuanPendidikanAction(
      formData(pengaturanPayload({ cetakPaperSize: "F4" })),
    );

    expect(mocks.updatePengaturan).toHaveBeenCalledWith(
      FAKE_TX,
      "org_A",
      expect.objectContaining({
        cetakTampilkanLogo: false,
        cetakTampilkanHeader: false,
        cetakPaperSize: "F4",
        zonaWaktu: "Asia/Jakarta",
      }),
    );
  });
});
