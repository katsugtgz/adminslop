import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type {
  PesertaDidik,
  RombonganBelajar,
  TahunAjaran,
  Tingkat,
} from "@/db/schema";

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
    listTingkat: vi.fn(async () => [] as Tingkat[]),
    listRombonganBelajar: vi.fn(async () => [] as RombonganBelajar[]),
    getTahunAjaranAktif: vi.fn(async () => null as TahunAjaran | null),
    listPesertaDidik: vi.fn(async () => [] as PesertaDidik[]),
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
vi.mock("@/db/queries/tingkat", () => ({
  listTingkat: mocks.listTingkat,
}));
vi.mock("@/db/queries/rombongan-belajar", () => ({
  listRombonganBelajar: mocks.listRombonganBelajar,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
}));
vi.mock("@/db/queries/peserta-didik", () => ({
  listPesertaDidik: mocks.listPesertaDidik,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

/**
 * Build an "active" AksesSaya whose `boleh()` mirrors the REAL evaluasiAkses
 * precedence (pembatasan > izin > peran default), scoped to the
 * rombongan_belajar:* izin vocabulary.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  // Mirrors PERAN_KE_IZIN_DEFAULT for the rombongan_belajar:* slugs.
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

const TK_1: Tingkat = {
  id: "tk_1",
  tenantId: "org_A",
  nama: "Kelas 1",
  urutan: 1,
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};
const RB_1A: RombonganBelajar = {
  id: "rb_1",
  tenantId: "org_A",
  nama: "1A",
  tingkatId: "tk_1",
  tahunAjaranId: "ta_1",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};
const TA_AKTIF: TahunAjaran = {
  id: "ta_1",
  tenantId: "org_A",
  nama: "2026/2027",
  aktif: true,
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};
const PD_BUDI: PesertaDidik = {
  id: "pd_1",
  tenantId: "org_A",
  nama: "Budi Santoso",
  nisn: "0001",
  nis: "N-1",
  tanggalLahir: "2012-01-01",
  jenisKelamin: "L",
  status: "aktif",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
  diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
};

async function renderPage() {
  const tree = await Page();
  return render(tree);
}

beforeEach(() => {
  mocks.getAksesSaya.mockReset();
  mocks.getDb.mockReset();
  mocks.withTenant.mockReset();
  mocks.listTingkat.mockReset();
  mocks.listRombonganBelajar.mockReset();
  mocks.getTahunAjaranAktif.mockReset();
  mocks.listPesertaDidik.mockReset();
  // restore default implementations
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(
    async (_db, _tenantId, fn) => fn(mocks.fakeTx)
  );
  mocks.listTingkat.mockResolvedValue([TK_1]);
  mocks.listRombonganBelajar.mockResolvedValue([RB_1A]);
  mocks.getTahunAjaranAktif.mockResolvedValue(TA_AKTIF);
  mocks.listPesertaDidik.mockResolvedValue([PD_BUDI]);
});

describe("RombonganBelajarPage — render by akses context (#8 / T11)", () => {
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

  it("active + guru (baca only) -> read-only lists, NO forms", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();

    // lists shown
    expect(
      screen.getByRole("heading", { name: "Rombongan Belajar" })
    ).toBeInTheDocument();
    expect(screen.getByText("Kelas 1")).toBeInTheDocument();
    expect(screen.getByText("1A")).toBeInTheDocument();

    // read-only: no create forms
    expect(
      screen.queryByRole("button", { name: /Tambah Tingkat/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Tambah Rombongan Belajar/i })
    ).toBeNull();
    // no placement / progression controls
    expect(
      screen.queryByRole("button", { name: /Tempatkan Peserta Didik/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Kenaikan Tingkat/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Tinggal Tingkat/i })
    ).toBeNull();
  });

  it("active + admin + taAktif -> ALL forms (tingkat, rombel, tempatkan, progresi)", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan")
    );
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Rombongan Belajar" })
    ).toBeInTheDocument();
    // create forms
    expect(
      screen.getByRole("button", { name: /Tambah Tingkat/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tambah Rombongan Belajar/i })
    ).toBeInTheDocument();
    // placement + progression
    expect(
      screen.getByRole("button", { name: /Tempatkan Peserta Didik/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Kenaikan Tingkat/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tinggal Tingkat/i })
    ).toBeInTheDocument();

    // data loaders each called once inside the tenant tx
    expect(mocks.listTingkat).toHaveBeenCalledTimes(1);
    expect(mocks.listRombonganBelajar).toHaveBeenCalledTimes(1);
    expect(mocks.getTahunAjaranAktif).toHaveBeenCalledTimes(1);
    expect(mocks.listPesertaDidik).toHaveBeenCalledTimes(1);
  });

  it("active + admin + no taAktif -> 'Aktifkan Tahun Ajaran' notice + link, NO placement/progression forms", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan")
    );
    mocks.getTahunAjaranAktif.mockResolvedValue(null);
    await renderPage();

    expect(
      screen.getByText(/Aktifkan Tahun Ajaran terlebih dahulu/i)
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Tahun Ajaran/i });
    expect(link).toHaveAttribute("href", "/dashboard/tahun-ajaran");

    // placement + progression controls hidden (need active TA)
    expect(
      screen.queryByRole("button", { name: /Tempatkan Peserta Didik/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Kenaikan Tingkat/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Tinggal Tingkat/i })
    ).toBeNull();
  });

  it("active + admin + empty lists -> empty states", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan")
    );
    mocks.listTingkat.mockResolvedValue([]);
    mocks.listRombonganBelajar.mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText(/Belum ada Tingkat/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Belum ada Rombongan Belajar/i)
    ).toBeInTheDocument();
  });
});
