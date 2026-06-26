import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { PermintaanAi, DrafAi, TahunAjaran } from "@/db/schema";
import type { InfoKuotaAi } from "@/db/queries/kuota-ai";

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
    listPermintaanAi: vi.fn(async () => [] as PermintaanAi[]),
    cariDrafAiByPermintaan: vi.fn(
      async (_tx: unknown, _id: string): Promise<DrafAi | null> => null
    ),
    getAtauBuatKuotaAi: vi.fn(
      async (): Promise<InfoKuotaAi> => ({
        terpakai: 0,
        batas: 100,
        tersisa: 100,
      })
    ),
    getTahunAjaranAktif: vi.fn(async () => null as TahunAjaran | null),
    getSemesterAktif: vi.fn(async () => "ganjil" as "ganjil" | "genap" | null),
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
  catatAudit: vi.fn(),
}));
vi.mock("@/db/queries/permintaan-ai", () => ({
  listPermintaanAi: mocks.listPermintaanAi,
  cariDrafAiByPermintaan: vi.fn(),
}));
vi.mock("@/db/queries/draf-ai", () => ({
  cariDrafAiByPermintaan: mocks.cariDrafAiByPermintaan,
}));
vi.mock("@/db/queries/kuota-ai", () => ({
  getAtauBuatKuotaAi: mocks.getAtauBuatKuotaAi,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  getSemesterAktif: mocks.getSemesterAktif,
}));

import Page from "./page";

function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "permintaan_ai:baca",
      "permintaan_ai:buat",
      "draf_ai:baca",
      "draf_ai:verifikasi",
    ],
    dev: [
      "permintaan_ai:baca",
      "permintaan_ai:buat",
      "draf_ai:baca",
      "draf_ai:verifikasi",
    ],
    kepala_sekolah: ["permintaan_ai:baca", "draf_ai:baca", "draf_ai:verifikasi"],
    guru: ["permintaan_ai:baca", "permintaan_ai:buat", "draf_ai:baca"],
    wali_kelas: ["permintaan_ai:baca", "draf_ai:baca"],
  };
  const boleh = (diminta: IzinSlug): KeputusanAkses => {
    if (pembatasan.includes(diminta))
      return { diizinkan: false, sumber: "pembatasan" };
    if (izin.includes(diminta))
      return { diizinkan: true, sumber: "izin" };
    if (defaults[roleSlug].includes(diminta))
      return { diizinkan: true, sumber: "peran" };
    return { diizinkan: false, sumber: "tidak_ada_izin" };
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

const TA: TahunAjaran = {
  id: "ta_1",
  tenantId: "org_A",
  nama: "2025/2026",
  aktif: true,
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

function permintaan(
  id: string,
  over: Partial<PermintaanAi> = {}
): PermintaanAi {
  return {
    id,
    tenantId: "org_A",
    jenis: "deskripsi_cp",
    konteks: {},
    status: "selesai",
    pesanError: null,
    permintaanTerkaitId: null,
    dibuatOleh: "workos_u_1",
    dibuatPada: new Date("2026-06-01T00:00:00Z"),
    diprosesPada: new Date("2026-06-01T00:00:01Z"),
    selesaiPada: new Date("2026-06-01T00:00:02Z"),
    ...over,
  };
}

function draf(permintaanAiId: string, over: Partial<DrafAi> = {}): DrafAi {
  return {
    id: `draf_${permintaanAiId}`,
    tenantId: "org_A",
    permintaanAiId,
    konten: "Konten AI contoh.",
    provenance: "mock-model-v1@2026-06-01T00:00:00.000Z",
    statusVerifikasi: "menunggu",
    diverifikasiOleh: null,
    diverifikasiPada: null,
    dibuatPada: new Date("2026-06-01T00:00:02Z"),
    ...over,
  };
}

async function renderPage() {
  const tree = await Page();
  return render(tree);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(async (_db, _t, fn) => fn(mocks.fakeTx));
  mocks.getTahunAjaranAktif.mockResolvedValue(TA);
  mocks.getSemesterAktif.mockResolvedValue("ganjil");
  mocks.listPermintaanAi.mockResolvedValue([]);
  mocks.cariDrafAiByPermintaan.mockResolvedValue(null);
  mocks.getAtauBuatKuotaAi.mockResolvedValue({
    terpakai: 3,
    batas: 10,
    tersisa: 7,
  });
});

describe("PermintaanAiPage — render by akses context (#12 / T7)", () => {
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
      memberships: [{ orgId: "org_A", orgName: "Sekolah A", roleSlug: "guru" }],
    } as AksesSaya);
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pilih Satuan Pendidikan/i })
    ).toBeInTheDocument();
  });

  it("guru (baca+buat, no verifikasi) -> FormPermintaan shown, no verifikasi buttons", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listPermintaanAi.mockResolvedValue([
      permintaan("p_1", { status: "selesai" }),
    ]);
    mocks.cariDrafAiByPermintaan.mockResolvedValue(
      draf("p_1", { statusVerifikasi: "menunggu" })
    );
    await renderPage();

    expect(
      screen.getByRole("button", { name: /Kirim Permintaan AI/i })
    ).toBeInTheDocument();
    // guru cannot verify -> no Setujui/Tolak even though the draft is menunggu.
    expect(screen.queryByRole("button", { name: /Setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tolak/i })).toBeNull();
  });

  it("kepala_sekolah (baca, no buat, has verifikasi) -> no FormPermintaan, verifikasi buttons on menunggu draf", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    mocks.listPermintaanAi.mockResolvedValue([
      permintaan("p_1", { status: "selesai" }),
    ]);
    mocks.cariDrafAiByPermintaan.mockResolvedValue(
      draf("p_1", { statusVerifikasi: "menunggu" })
    );
    await renderPage();

    expect(
      screen.queryByRole("button", { name: /Kirim Permintaan AI/i })
    ).toBeNull();
    expect(screen.getByRole("button", { name: /Setujui/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tolak/i })).toBeInTheDocument();
  });

  it("wali_kelas (baca only) -> read-only: no form, no verifikasi buttons", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    mocks.listPermintaanAi.mockResolvedValue([
      permintaan("p_1", { status: "selesai" }),
    ]);
    mocks.cariDrafAiByPermintaan.mockResolvedValue(
      draf("p_1", { statusVerifikasi: "menunggu" })
    );
    await renderPage();

    expect(
      screen.queryByRole("button", { name: /Kirim Permintaan AI/i })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tolak/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Batalkan/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Coba Lagi/i })).toBeNull();
  });

  it("no active Tahun Ajaran -> 'Aktifkan Tahun Ajaran' notice, no data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.getTahunAjaranAktif.mockResolvedValue(null);
    await renderPage();

    expect(
      screen.getByText(/Aktifkan Tahun Ajaran terlebih dahulu/i)
    ).toBeInTheDocument();
    expect(mocks.listPermintaanAi).not.toHaveBeenCalled();
    expect(mocks.getAtauBuatKuotaAi).not.toHaveBeenCalled();
  });

  it("renders the kuota display (terpakai/batas/tersisa) (AC#5)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();

    expect(screen.getByText(/3 dari 10/i)).toBeInTheDocument();
    expect(screen.getByText(/tersisa 7/i)).toBeInTheDocument();
  });

  it("renders all five status badges (AC#1)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listPermintaanAi.mockResolvedValue([
      permintaan("p_1", { status: "dibuat" }),
      permintaan("p_2", { status: "diproses" }),
      permintaan("p_3", { status: "selesai" }),
      permintaan("p_4", { status: "gagal", pesanError: "err" }),
      permintaan("p_5", { status: "dibatalkan" }),
    ]);
    await renderPage();

    expect(screen.getByText("Dibuat")).toBeInTheDocument();
    expect(screen.getByText("Diproses")).toBeInTheDocument();
    expect(screen.getAllByText("Selesai").length).toBeGreaterThan(0);
    expect(screen.getByText("Gagal")).toBeInTheDocument();
    expect(screen.getByText("Dibatalkan")).toBeInTheDocument();
  });

  it("shows 'Batalkan' for dibuat/diproses when bolehBuat (AC#4)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listPermintaanAi.mockResolvedValue([
      permintaan("p_1", { status: "dibuat" }),
      permintaan("p_2", { status: "diproses" }),
      permintaan("p_3", { status: "selesai" }),
    ]);
    await renderPage();

    expect(screen.getAllByRole("button", { name: /Batalkan/i }).length).toBe(2);
  });

  it("shows 'Coba Lagi' for gagal when bolehBuat (AC#4)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listPermintaanAi.mockResolvedValue([
      permintaan("p_1", { status: "gagal", pesanError: "timeout" }),
    ]);
    await renderPage();

    expect(screen.getByRole("button", { name: /Coba Lagi/i })).toBeInTheDocument();
  });

  it("KartuDraf: menunggu + bolehVerifikasi -> Setujui/Tolak; disetujui -> no buttons (AC#3)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    mocks.listPermintaanAi.mockResolvedValue([
      permintaan("p_menunggu", { status: "selesai" }),
      permintaan("p_disetujui", { status: "selesai" }),
    ]);
    mocks.cariDrafAiByPermintaan.mockImplementation(
      async (_tx: unknown, id: string) =>
        draf(id, {
          statusVerifikasi: id === "p_disetujui" ? "disetujui" : "menunggu",
        })
    );
    await renderPage();

    expect(screen.getAllByRole("button", { name: /Setujui/i }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: /Tolak/i }).length).toBe(1);
    expect(screen.getAllByText(/Disetujui/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Draf AI Terverifikasi/i)
    ).toBeInTheDocument();
  });
});
