import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { TahunAjaran } from "@/db/schema";
import type { Semester } from "@/db/queries/tahun-ajaran";

// --- hoisted mocks ---------------------------------------------------------

const mocks = vi.hoisted(() => {
  const fakeTx = { __tx: true };
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTx)
    ),
    listTahunAjaran: vi.fn(async () => [] as TahunAjaran[]),
    getTahunAjaranAktif: vi.fn(async () => null as TahunAjaran | null),
    getSemesterAktif: vi.fn(async () => null as Semester | null),
    fakeTx,
  };
});

// Stop transitive authkit/next server-module loads (resolvable only inside Next).
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  listTahunAjaran: mocks.listTahunAjaran,
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  getSemesterAktif: mocks.getSemesterAktif,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

/**
 * Build an "active" AksesSaya whose `boleh()` mirrors the REAL evaluasiAkses
 * precedence (pembatasan > izin > peran default) for the tahun_ajaran surface.
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

const TA_2024: TahunAjaran = {
  id: "ta_2024",
  tenantId: "org_A",
  nama: "2024/2025",
  aktif: false,
  dibuatPada: new Date("2024-07-01T00:00:00Z"),
};

const TA_2025: TahunAjaran = {
  id: "ta_2025",
  tenantId: "org_A",
  nama: "2025/2026",
  aktif: true,
  dibuatPada: new Date("2025-07-01T00:00:00Z"),
};

async function renderPage() {
  const tree = await Page();
  return render(tree);
}

beforeEach(() => {
  mocks.getAksesSaya.mockReset();
  mocks.getDb.mockReset();
  mocks.withTenant.mockReset();
  mocks.listTahunAjaran.mockReset();
  mocks.getTahunAjaranAktif.mockReset();
  mocks.getSemesterAktif.mockReset();
  // restore default implementations
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(
    async (_db, _tenantId, fn) => fn(mocks.fakeTx)
  );
  mocks.listTahunAjaran.mockResolvedValue([TA_2024, TA_2025]);
  mocks.getTahunAjaranAktif.mockResolvedValue(TA_2025);
  mocks.getSemesterAktif.mockResolvedValue("ganjil");
});

describe("TahunAjaranPage — render by akses context (#8 / T10)", () => {
  it("denied -> Pembatasan Akses", async () => {
    mocks.getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
  });

  it("choose -> Pilih Satuan Pendidikan", async () => {
    mocks.getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [
        { orgId: "org_A", orgName: "Sekolah A", roleSlug: "guru" },
      ],
    } as AksesSaya);
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pilih Satuan Pendidikan/i })
    ).toBeInTheDocument();
  });

  it("active + guru (no tahun_ajaran:baca) -> Pembatasan Akses, no tenant data leaks", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    // listTahunAjaran is NEVER called (page bails before getDb).
    expect(mocks.listTahunAjaran).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(screen.queryByText("2024/2025")).toBeNull();
  });

  it("active + kepala_sekolah (baca only) -> read-only: list shown, no Tambah form, no Aktifkan buttons, no semester control", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    await renderPage();

    // list IS shown
    expect(
      screen.getByRole("heading", { name: "Tahun Ajaran" })
    ).toBeInTheDocument();
    expect(screen.getByText("2024/2025")).toBeInTheDocument();
    expect(screen.getByText("2025/2026")).toBeInTheDocument();
    // (hanya baca) marker on the peran line
    expect(screen.getByText(/hanya baca/i)).toBeInTheDocument();
    // no management surface
    expect(
      screen.queryByRole("button", { name: /Tambah Tahun Ajaran/i })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Aktifkan/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Ubah Semester Aktif/i })
    ).toBeNull();
    expect(screen.queryByLabelText("Semester Aktif")).toBeNull();
  });

  it("active + admin -> full: Tambah form + semester control + Aktifkan buttons; active TA shows 'Sedang Aktif'", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Tahun Ajaran" })
    ).toBeInTheDocument();
    // Tambah form
    expect(
      screen.getByRole("button", { name: /Tambah Tahun Ajaran/i })
    ).toBeInTheDocument();
    // Semester control
    expect(screen.getByLabelText("Semester Aktif")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Ubah Semester Aktif/i })
    ).toBeInTheDocument();
    // Prefilled from getSemesterAktif=ganjil
    expect(screen.getByLabelText("Semester Aktif")).toHaveValue("ganjil");
    // Only the inactive row gets an Aktifkan button.
    expect(
      screen.getAllByRole("button", { name: /Aktifkan/i })
    ).toHaveLength(1);
    // Active row label.
    expect(screen.getByText("Sedang Aktif")).toBeInTheDocument();
    // queries were called inside withTenant
    expect(mocks.listTahunAjaran).toHaveBeenCalledTimes(1);
    expect(mocks.getSemesterAktif).toHaveBeenCalledTimes(1);
    expect(mocks.withTenant).toHaveBeenCalledTimes(1);
  });

  it("active + admin + empty list -> 'Belum ada Tahun Ajaran.' empty state", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listTahunAjaran.mockResolvedValue([]);
    mocks.getTahunAjaranAktif.mockResolvedValue(null);
    await renderPage();

    expect(screen.getByText(/Belum ada Tahun Ajaran/i)).toBeInTheDocument();
    // Management surface still renders (admin can still add).
    expect(
      screen.getByRole("button", { name: /Tambah Tahun Ajaran/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aktifkan/i })).toBeNull();
  });
});
