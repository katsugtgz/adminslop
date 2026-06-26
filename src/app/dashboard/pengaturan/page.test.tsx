import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { JSX } from "react";

const { getActiveTenantContext } = vi.hoisted(() => ({
  getActiveTenantContext: vi.fn(),
}));
const { canAdminSatuanPendidikan } = vi.hoisted(() => ({
  canAdminSatuanPendidikan: vi.fn(),
}));
const { canViewPengaturanSatuanPendidikan } = vi.hoisted(() => ({
  canViewPengaturanSatuanPendidikan: vi.fn(),
}));
const { getProfilDanPengaturan } = vi.hoisted(() => ({
  getProfilDanPengaturan: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

vi.mock("@/lib/auth/server", () => ({ getActiveTenantContext }));
vi.mock("@/lib/auth/otorisasi", () => ({
  canAdminSatuanPendidikan,
  canViewPengaturanSatuanPendidikan,
}));

vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => ({ db: {}, pool: {} })),
  withTenant: vi.fn(
    async (_db: unknown, _tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({}),
  ),
}));

vi.mock("@/db/queries/satuan-pendidikan", () => ({
  getProfilDanPengaturan,
}));

vi.mock("@/components/pembatasan-akses", () => ({
  PembatasanAkses: () => (
    <section>
      <h1>Pembatasan Akses</h1>
    </section>
  ),
}));

const formProfilCalls: Array<{ readOnly: boolean; nama: string }> = [];
const formPengaturanCalls: Array<{ readOnly: boolean; nama: string }> = [];

vi.mock("@/components/pengaturan-satuan/form-profil", () => ({
  FormProfil: ({
    values,
    readOnly,
  }: {
    values: { nama: string };
    readOnly?: boolean;
  }) => {
    formProfilCalls.push({ readOnly: readOnly === true, nama: values.nama });
    return (
      <div data-testid="form-profil" data-readonly={readOnly ? "true" : "false"}>
        {values.nama}
      </div>
    );
  },
}));

vi.mock("@/components/pengaturan-satuan/form-pengaturan", () => ({
  FormPengaturan: ({
    values,
    readOnly,
  }: {
    values: { nama: string };
    readOnly?: boolean;
  }) => {
    formPengaturanCalls.push({ readOnly: readOnly === true, nama: values.nama });
    return (
      <div data-testid="form-pengaturan" data-readonly={readOnly ? "true" : "false"}>
        {values.nama}
      </div>
    );
  },
}));

import PengaturanPage from "./page";
import type { ProfilDanPengaturanRow } from "@/db/queries/satuan-pendidikan";

function fakeRow(
  overrides: Partial<ProfilDanPengaturanRow> = {},
): ProfilDanPengaturanRow {
  return {
    id: "org_A",
    nama: "SMP Negeri 1 Contoh",
    npsn: "12345678",
    jenjang: "SMP",
    alamat: "Jl. Contoh No. 1",
    namaKepala: "Drs. Budi",
    logoUrl: null,
    tahunAjaranAktif: "2026/2027",
    semesterAktif: "ganjil",
    zonaWaktu: "Asia/Jakarta",
    cetakPaperSize: "A4",
    cetakTampilkanLogo: true,
    cetakTampilkanHeader: true,
    ...overrides,
  };
}

async function renderPage() {
  const tree = (await PengaturanPage()) as JSX.Element;
  return render(tree);
}

beforeEach(() => {
  getActiveTenantContext.mockReset();
  canAdminSatuanPendidikan.mockReset();
  canViewPengaturanSatuanPendidikan.mockReset();
  getProfilDanPengaturan.mockReset();
  formProfilCalls.length = 0;
  formPengaturanCalls.length = 0;
});

describe("PengaturanPage (#5)", () => {
  it("denied -> renders Pembatasan Akses", async () => {
    getActiveTenantContext.mockResolvedValue({ status: "denied" });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i }),
    ).toBeInTheDocument();
  });

  it("choose -> renders Pilih Satuan Pendidikan with link to /dashboard", async () => {
    getActiveTenantContext.mockResolvedValue({
      status: "choose",
      memberships: [
        { orgId: "org_A", orgName: "Sekolah A", roleSlug: "guru" },
      ],
    });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pilih Satuan Pendidikan/i }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /Kembali ke Dashboard/i,
    }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/dashboard");
  });

  it("active + admin + row -> renders Pengaturan Sekolah with both forms and org name", async () => {
    getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership: {
        orgId: "org_A",
        orgName: "SMP Negeri 1 Contoh",
        roleSlug: "admin_satuan_pendidikan",
      },
    });
    canAdminSatuanPendidikan.mockReturnValue(true);
    canViewPengaturanSatuanPendidikan.mockReturnValue(true);
    getProfilDanPengaturan.mockResolvedValue(fakeRow());
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /Pengaturan Sekolah/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/SMP Negeri 1 Contoh — peran:/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("form-profil")).toBeInTheDocument();
    expect(screen.getByTestId("form-pengaturan")).toBeInTheDocument();
    expect(formProfilCalls[0].readOnly).toBe(false);
    expect(formPengaturanCalls[0].readOnly).toBe(false);
  });

  it("active + guru + row -> forms receive readOnly=true", async () => {
    getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership: {
        orgId: "org_A",
        orgName: "SMP Negeri 1 Contoh",
        roleSlug: "guru",
      },
    });
    canAdminSatuanPendidikan.mockReturnValue(false);
    canViewPengaturanSatuanPendidikan.mockReturnValue(true);
    getProfilDanPengaturan.mockResolvedValue(fakeRow());
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /Pengaturan Sekolah/i }),
    ).toBeInTheDocument();
    expect(formProfilCalls[0].readOnly).toBe(true);
    expect(formPengaturanCalls[0].readOnly).toBe(true);
    expect(screen.getByTestId("form-profil").dataset.readonly).toBe("true");
    expect(screen.getByTestId("form-pengaturan").dataset.readonly).toBe("true");
  });

  it("active + admin + null row -> renders empty state message", async () => {
    getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership: {
        orgId: "org_A",
        orgName: "SMP Negeri 1 Contoh",
        roleSlug: "admin_satuan_pendidikan",
      },
    });
    canAdminSatuanPendidikan.mockReturnValue(true);
    canViewPengaturanSatuanPendidikan.mockReturnValue(true);
    getProfilDanPengaturan.mockResolvedValue(null);
    await renderPage();

    expect(
      screen.getByText(/Data Satuan Pendidikan belum tersedia/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("form-profil")).not.toBeInTheDocument();
  });

  it("active + unknown role -> renders Pembatasan Akses (deny)", async () => {
    getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership: {
        orgId: "org_A",
        orgName: "SMP Negeri 1 Contoh",
        roleSlug: "unknown_role",
      },
    });
    canAdminSatuanPendidikan.mockReturnValue(false);
    canViewPengaturanSatuanPendidikan.mockReturnValue(false);
    getProfilDanPengaturan.mockResolvedValue(fakeRow());
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("form-profil")).not.toBeInTheDocument();
    expect(screen.queryByTestId("form-pengaturan")).not.toBeInTheDocument();
  });
});
