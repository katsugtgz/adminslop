import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type {
  AlurTujuanPembelajaran,
  CapaianPembelajaran,
  Fase,
  Kurikulum,
  MataPelajaran,
  TujuanPembelajaran,
} from "@/db/schema";

// --- hoisted mocks ---------------------------------------------------------

const mocks = vi.hoisted(() => {
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(),
    listKurikulum: vi.fn(async () => [] as Kurikulum[]),
    listMataPelajaranByKurikulum: vi.fn(async () => [] as MataPelajaran[]),
    listFaseByKurikulumDanMapel: vi.fn(async () => [] as Fase[]),
    listCapaianPembelajaran: vi.fn(async () => [] as CapaianPembelajaran[]),
    listTujuanPembelajaranByCP: vi.fn(async () => [] as TujuanPembelajaran[]),
    listAlurTujuanPembelajaranByTP: vi.fn(
      async () => [] as AlurTujuanPembelajaran[]
    ),
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
vi.mock("@/db/queries/kurikulum", () => ({
  listKurikulum: mocks.listKurikulum,
  listMataPelajaranByKurikulum: mocks.listMataPelajaranByKurikulum,
  listFaseByKurikulumDanMapel: mocks.listFaseByKurikulumDanMapel,
  listCapaianPembelajaran: mocks.listCapaianPembelajaran,
  listTujuanPembelajaranByCP: mocks.listTujuanPembelajaranByCP,
  listAlurTujuanPembelajaranByTP: mocks.listAlurTujuanPembelajaranByTP,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

/**
 * Build an "active" AksesSaya whose `boleh()` mirrors the REAL evaluasiAkses
 * precedence (pembatasan > izin > peran default) for the kurikulum surface.
 * Every member role receives `kurikulum:baca` by default.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: ["kurikulum:baca"],
    dev: ["kurikulum:baca"],
    kepala_sekolah: ["kurikulum:baca"],
    guru: ["kurikulum:baca"],
    wali_kelas: ["kurikulum:baca"],
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

const K_MERDEKA: Kurikulum = {
  id: "kur_1",
  nama: "Kurikulum Merdeka",
  versi: "2022",
  deskripsi: null,
  sumber: "Kemdikbudristek",
  sumberUrl: null,
  tanggalAmbil: "2024-01-01",
  disetujuiOleh: null,
  statusPersetujuan: "memerlukan_tinjauan",
  dibuatPada: new Date("2024-01-01T00:00:00Z"),
};

const K_2013: Kurikulum = {
  ...K_MERDEKA,
  id: "kur_2",
  nama: "Kurikulum 2013",
  versi: "2013",
  statusPersetujuan: "disetujui",
};

const MP_MAT: MataPelajaran = { id: "mp_1", kode: "MAT", nama: "Matematika" };
const MP_BIN: MataPelajaran = { id: "mp_2", kode: "BIN", nama: "Bahasa Indonesia" };

const FASE_A: Fase = {
  id: "fase_A",
  kode: "A",
  nama: "Fase A",
  rentangKelas: "Kelas 1-2",
  jenjang: "SD",
};

const CP_1: CapaianPembelajaran = {
  id: "cp_1",
  kurikulumId: "kur_1",
  mataPelajaranId: "mp_1",
  faseId: "fase_A",
  kode: "CP-1",
  elemen: "Bilangan",
  deskripsi: "Peserta didik memahami bilangan cacah.",
  sumber: "CP Kemdikbudristek",
  catatan: null,
};

const TP_1: TujuanPembelajaran = {
  id: "tp_1",
  capaianPembelajaranId: "cp_1",
  urutan: 1,
  deskripsi: "Menjumlahkan bilangan cacah.",
  sumber: "TP Kemdikbudristek",
  catatan: null,
};

const ATP_1: AlurTujuanPembelajaran = {
  id: "atp_1",
  tujuanPembelajaranId: "tp_1",
  urutan: 1,
  deskripsi: "Alur pengenalan bilangan.",
  sumber: "ATP GM",
  catatan: null,
};

async function renderPage(sp: Record<string, string | undefined> = {}) {
  const tree = await Page({ searchParams: Promise.resolve(sp) });
  return render(tree);
}

beforeEach(() => {
  vi.clearAllMocks();
  // restore default return values
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.listKurikulum.mockResolvedValue([K_MERDEKA, K_2013]);
  mocks.listMataPelajaranByKurikulum.mockResolvedValue([MP_MAT, MP_BIN]);
  mocks.listFaseByKurikulumDanMapel.mockResolvedValue([FASE_A]);
  mocks.listCapaianPembelajaran.mockResolvedValue([CP_1]);
  mocks.listTujuanPembelajaranByCP.mockResolvedValue([TP_1]);
  mocks.listAlurTujuanPembelajaranByTP.mockResolvedValue([ATP_1]);
});

describe("KurikulumPage — akses gate (#9 / T6)", () => {
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

  it("active + pembatasan kurikulum:baca -> Pembatasan Akses, no data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { pembatasan: ["kurikulum:baca"] })
    );
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.listKurikulum).not.toHaveBeenCalled();
  });
});

describe("KurikulumPage — progressive drill-down (#9 / T6)", () => {
  it("active + no searchParams -> kurikulum list only; no deeper sections", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();

    expect(screen.getByRole("heading", { name: "Kurikulum" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Pilih Kurikulum/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Kurikulum Merdeka")).toBeInTheDocument();
    expect(screen.getByText("Kurikulum 2013")).toBeInTheDocument();

    // No deeper sections.
    expect(screen.queryByRole("heading", { name: "Mata Pelajaran" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Fase" })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Capaian Pembelajaran" })
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Tujuan Pembelajaran" })
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Alur Tujuan Pembelajaran" })
    ).toBeNull();

    // Reads GLOBAL data directly — NO withTenant (ADR 0001).
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(mocks.listKurikulum).toHaveBeenCalledTimes(1);
  });

  it("active + kurikulumId -> kurikulum (selected) + mata pelajaran list", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage({ kurikulumId: "kur_1" });

    // Kurikulum level: Merdeka selected.
    expect(
      screen.getByRole("link", { name: /Kurikulum Merdeka/i })
    ).toHaveAttribute("aria-current", "true");
    // Mapel level appears with both subjects.
    expect(
      screen.getByRole("heading", { name: "Mata Pelajaran" })
    ).toBeInTheDocument();
    expect(screen.getByText("Matematika")).toBeInTheDocument();
    expect(screen.getByText("Bahasa Indonesia")).toBeInTheDocument();
    // No deeper yet.
    expect(screen.queryByRole("heading", { name: "Fase" })).toBeNull();
  });

  it("active + kurikulumId + mapelId -> fase + capaian pembelajaran list", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage({ kurikulumId: "kur_1", mapelId: "mp_1" });

    expect(screen.getByRole("heading", { name: "Fase" })).toBeInTheDocument();
    expect(screen.getByText("Fase A")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Capaian Pembelajaran" })
    ).toBeInTheDocument();
    expect(screen.getByText("Peserta didik memahami bilangan cacah.")).toBeInTheDocument();
  });

  it("active + kurikulumId + mapelId + cpId -> tujuan pembelajaran list", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage({
      kurikulumId: "kur_1",
      mapelId: "mp_1",
      cpId: "cp_1",
    });

    expect(
      screen.getByRole("heading", { name: "Tujuan Pembelajaran" })
    ).toBeInTheDocument();
    expect(screen.getByText("Menjumlahkan bilangan cacah.")).toBeInTheDocument();
  });

  it("active + full drill (kurikulumId+mapelId+cpId+tpId) -> alur tujuan pembelajaran list", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage({
      kurikulumId: "kur_1",
      mapelId: "mp_1",
      cpId: "cp_1",
      tpId: "tp_1",
    });

    expect(
      screen.getByRole("heading", { name: "Alur Tujuan Pembelajaran" })
    ).toBeInTheDocument();
    expect(screen.getByText("Alur pengenalan bilangan.")).toBeInTheDocument();
    expect(mocks.listAlurTujuanPembelajaranByTP).toHaveBeenCalledWith(
      expect.anything(),
      "tp_1"
    );
  });

  it("kurikulum status_persetujuan 'memerlukan_tinjauan' renders the badge", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listKurikulum.mockResolvedValue([K_MERDEKA]);
    await renderPage();

    expect(screen.getByText("Memerlukan Tinjauan")).toBeInTheDocument();
  });

  it("empty kurikulum -> 'Belum ada Kurikulum.' empty state", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listKurikulum.mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText(/Belum ada Kurikulum/i)).toBeInTheDocument();
  });
});
