import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { CatatanAudit, RetensiData } from "@/db/schema";
import type { BarisArsip } from "@/db/queries/arsip";

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
    listArsip: vi.fn(async () => [] as BarisArsip[]),
    getRetensi: vi.fn(async () => [] as RetensiData[]),
    listRiwayatPerubahan: vi.fn(async () => [] as CatatanAudit[]),
    arsipkanAction: vi.fn(async () => undefined),
    pulihkanAction: vi.fn(async () => undefined),
    aturRetensiAction: vi.fn(async () => undefined),
    fakeTx,
  };
});

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
vi.mock("@/db/queries/arsip", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/db/queries/arsip")>();
  return {
    ...actual,
    listArsip: mocks.listArsip,
    getRetensi: mocks.getRetensi,
    listRiwayatPerubahan: mocks.listRiwayatPerubahan,
  };
});
vi.mock("./actions", () => ({
  arsipkanAction: mocks.arsipkanAction,
  pulihkanAction: mocks.pulihkanAction,
  aturRetensiAction: mocks.aturRetensiAction,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

function aksesAktif(
  roleSlug: RoleSlug,
  opts?: {
    izin?: IzinSlug[];
    pembatasan?: IzinSlug[];
  }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: ["arsip:baca", "arsip:kelola", "akses:kelola"],
    dev: ["arsip:baca", "arsip:kelola", "akses:kelola"],
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

const ARSIP_PTK: BarisArsip = {
  id: "ptk_1",
  tabel: "ptk",
  arsipPada: new Date("2026-06-01T00:00:00Z"),
  arsipOleh: "workos_u_1",
  label: "Budi",
};

const RETENSI_PTK: RetensiData = {
  id: "ret_1",
  tenantId: "org_A",
  tabel: "ptk",
  periodeBulan: 84,
  keterangan: "7 tahun",
};

const RIWAYAT_1: CatatanAudit = {
  id: 1,
  tenantId: "org_A",
  aktor: "workos_u_1",
  aksi: "arsipkan_record",
  target: "ptk:ptk_1",
  beban: null,
  dibuatPada: new Date("2026-06-01T00:00:00Z"),
};

async function renderPage() {
  const tree = await Page();
  return render(tree);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(async (_db, _tenantId, fn) =>
    fn(mocks.fakeTx)
  );
  mocks.listArsip.mockResolvedValue([]);
  mocks.getRetensi.mockResolvedValue([]);
  mocks.listRiwayatPerubahan.mockResolvedValue([]);
});

describe("ArsipPage — akses gate (#19)", () => {
  it("denied -> Pembatasan Akses; no tenant data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("choose -> Pilih Satuan Pendidikan; no tenant data loaded", async () => {
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
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("guru (no arsip:baca) -> Pembatasan Akses; no tenant data loaded (no leak)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.listArsip).not.toHaveBeenCalled();
    expect(mocks.getRetensi).not.toHaveBeenCalled();
    expect(mocks.listRiwayatPerubahan).not.toHaveBeenCalled();
  });

  it("admin (arsip:kelola) -> 3 sections + management forms + data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan")
    );
    mocks.listArsip.mockResolvedValue([ARSIP_PTK]);
    mocks.getRetensi.mockResolvedValue([RETENSI_PTK]);
    mocks.listRiwayatPerubahan.mockResolvedValue([RIWAYAT_1]);

    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Arsip" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Data diarsipkan, tidak dihapus permanen/i)
    ).toBeInTheDocument();

    // Arsip Data: archived row + Pulihkan button (bolehKelola=true).
    expect(
      screen.getByRole("heading", { level: 2, name: "Arsip Data" })
    ).toBeInTheDocument();
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Pulihkan/i })
    ).toBeInTheDocument();

    // Retensi Data: management form with default periode for ptk.
    expect(
      screen.getByRole("heading", { level: 2, name: "Retensi Data" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Periode saat ini: 84 bulan/i)).toBeInTheDocument();

    // Riwayat Perubahan: audit entry with aksi + aktor.
    expect(
      screen.getByRole("heading", { level: 2, name: "Riwayat Perubahan" })
    ).toBeInTheDocument();
    expect(screen.getByText("arsipkan_record")).toBeInTheDocument();
    expect(screen.getByText(/Aktor: workos_u_1/i)).toBeInTheDocument();
  });

  it("kepala_sekolah (arsip:baca only) -> read-only: no Pulihkan button, no retention forms", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    mocks.listArsip.mockResolvedValue([ARSIP_PTK]);
    mocks.getRetensi.mockResolvedValue([RETENSI_PTK]);
    mocks.listRiwayatPerubahan.mockResolvedValue([RIWAYAT_1]);

    await renderPage();

    // read-only notice (hanya baca).
    expect(screen.getByText(/hanya baca/i)).toBeInTheDocument();
    // No management forms: no Pulihkan button, no retention input.
    expect(
      screen.queryByRole("button", { name: /Pulihkan/i })
    ).toBeNull();
    expect(
      screen.queryByRole("form", { name: /Retensi ptk/i })
    ).toBeNull();
    // Archived row + retention display still shown (read-only).
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByText(/Periode \(Bulan\): 84/i)).toBeInTheDocument();
  });

  it("empty state: no archives, no retention (admin) -> 'Belum ada arsip.' + 4 retention forms", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan")
    );
    mocks.listArsip.mockResolvedValue([]);
    mocks.getRetensi.mockResolvedValue([]);
    mocks.listRiwayatPerubahan.mockResolvedValue([]);

    await renderPage();

    expect(screen.getByText(/Belum ada arsip/i)).toBeInTheDocument();
    // 4 retention forms (one per supported table), each with default periode 84.
    expect(
      screen.getAllByRole("form", { name: /Retensi /i })
    ).toHaveLength(4);
  });
});
