import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type {
  KontakDarurat,
  MutasiPesertaDidik,
  PesertaDidik,
  RiwayatStatusPesertaDidik,
  WaliPesertaDidik,
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
    cariPesertaDidikById: vi.fn(async () => null as PesertaDidik | null),
    listRiwayatStatus: vi.fn(async () => [] as RiwayatStatusPesertaDidik[]),
    listWali: vi.fn(async () => [] as WaliPesertaDidik[]),
    listKontakDarurat: vi.fn(async () => [] as KontakDarurat[]),
    listMutasi: vi.fn(async () => [] as MutasiPesertaDidik[]),
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
vi.mock("@/db/queries/peserta-didik", () => ({
  cariPesertaDidikById: mocks.cariPesertaDidikById,
  listRiwayatStatus: mocks.listRiwayatStatus,
}));
vi.mock("@/db/queries/kontak-peserta-didik", () => ({
  listWali: mocks.listWali,
  listKontakDarurat: mocks.listKontakDarurat,
}));
vi.mock("@/db/queries/mutasi-peserta-didik", () => ({
  listMutasi: mocks.listMutasi,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

/**
 * Build an "active" AksesSaya whose `boleh()` mirrors the REAL evaluasiAkses
 * precedence (pembatasan > izin > peran default) for the peserta_didik:* slugs.
 */
function aksesAktif(
  roleSlug: RoleSlug
): Extract<AksesSaya, { status: "active" }> {
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "peserta_didik:baca",
      "peserta_didik:buat",
      "peserta_didik:ubah",
    ],
    dev: ["peserta_didik:baca", "peserta_didik:buat", "peserta_didik:ubah"],
    kepala_sekolah: ["peserta_didik:baca"],
    guru: ["peserta_didik:baca"],
    wali_kelas: ["peserta_didik:baca"],
  };
  const boleh = (diminta: IzinSlug): KeputusanAkses =>
    defaults[roleSlug].includes(diminta)
      ? { diizinkan: true, sumber: "peran" as const }
      : { diizinkan: false, sumber: "tidak_ada_izin" as const };
  return {
    status: "active",
    membership: { orgId: "org_A", orgName: "Sekolah A", roleSlug },
    userId: "workos_u_1",
    pengguna: null,
    izin: defaults[roleSlug],
    pembatasan: [],
    boleh,
  };
}

const PESERTA: PesertaDidik = {
  id: "pd_1",
  tenantId: "org_A",
  nama: "Siti Aminah",
  nisn: "12345678",
  nis: "NIS-9",
  tanggalLahir: "2012-04-10",
  jenisKelamin: "P",
  status: "aktif",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
  diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
};

const RIWAYAT: RiwayatStatusPesertaDidik[] = [
  {
    id: "rw_1",
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    status: "aktif",
    catatan: null,
    dibuatOleh: null,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
];

const WALI: WaliPesertaDidik[] = [
  {
    id: "wali_1",
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    nama: "Ayah Siti",
    hubungan: "Ayah",
    telepon: "0812",
    email: null,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
];

async function renderPage(id = "pd_1") {
  const tree = await Page({ params: Promise.resolve({ id }) });
  return render(tree);
}

beforeEach(() => {
  mocks.getAksesSaya.mockReset();
  mocks.getDb.mockReset();
  mocks.withTenant.mockReset();
  mocks.cariPesertaDidikById.mockReset();
  mocks.listRiwayatStatus.mockReset();
  mocks.listWali.mockReset();
  mocks.listKontakDarurat.mockReset();
  mocks.listMutasi.mockReset();
  // restore default implementations
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(async (_db, _tenantId, fn) =>
    fn(mocks.fakeTx)
  );
  mocks.cariPesertaDidikById.mockResolvedValue(PESERTA);
  mocks.listRiwayatStatus.mockResolvedValue(RIWAYAT);
  mocks.listWali.mockResolvedValue(WALI);
  mocks.listKontakDarurat.mockResolvedValue([]);
  mocks.listMutasi.mockResolvedValue([]);
});

describe("PesertaDidikDetailPage — render by akses context (#7 / T8)", () => {
  it("denied -> Pembatasan Akses", async () => {
    mocks.getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    // no tenant data loaded
    expect(mocks.cariPesertaDidikById).not.toHaveBeenCalled();
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

  it("active + admin + found -> biodata edit form + all lists + all tambah forms", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Detail Peserta Didik" })
    ).toBeInTheDocument();
    // biodata edit form
    expect(
      screen.getByRole("button", { name: /Simpan Perubahan/i })
    ).toBeInTheDocument();
    // all tambah forms present
    expect(
      screen.getByRole("button", { name: /Tambah Wali/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tambah Kontak Darurat/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Catat Mutasi/i })
    ).toBeInTheDocument();
    // section headings (lists visible)
    expect(screen.getByText("Riwayat Status")).toBeInTheDocument();
    expect(screen.getByText("Wali")).toBeInTheDocument();
    expect(screen.getByText("Kontak Darurat")).toBeInTheDocument();
    expect(screen.getByText("Mutasi")).toBeInTheDocument();
    // loaded the row + all four lists
    expect(mocks.cariPesertaDidikById).toHaveBeenCalledWith(
      mocks.fakeTx,
      "pd_1"
    );
    expect(mocks.listRiwayatStatus).toHaveBeenCalledTimes(1);
    expect(mocks.listWali).toHaveBeenCalledTimes(1);
    expect(mocks.listKontakDarurat).toHaveBeenCalledTimes(1);
    expect(mocks.listMutasi).toHaveBeenCalledTimes(1);
  });

  it("active + guru + found -> read-only biodata, lists visible, NO tambah forms", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();

    // read-only biodata shows the nama, NO edit form
    expect(screen.getByText("Siti Aminah")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Simpan Perubahan/i })
    ).toBeNull();
    // no tambah forms for read-only viewers
    expect(
      screen.queryByRole("button", { name: /Tambah Wali/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Tambah Kontak Darurat/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Catat Mutasi/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Hapus/i })
    ).toBeNull();
    // lists / sections still visible (audit data)
    expect(screen.getByText("Riwayat Status")).toBeInTheDocument();
    expect(screen.getByText("Wali")).toBeInTheDocument();
    expect(screen.getByText("Mutasi")).toBeInTheDocument();
  });

  it("active + admin + not found -> 'tidak ditemukan' message", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.cariPesertaDidikById.mockResolvedValue(null);
    await renderPage();

    expect(
      screen.getByText(/Peserta Didik tidak ditemukan/i)
    ).toBeInTheDocument();
    // no lists loaded for a missing row
    expect(mocks.listRiwayatStatus).not.toHaveBeenCalled();
    expect(mocks.listWali).not.toHaveBeenCalled();
  });
});
