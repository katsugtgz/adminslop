import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type {
  AbsensiHarian,
  PesertaDidik,
  RombonganBelajar,
  TahunAjaran,
} from "@/db/schema";
import type {
  PenempatanRombonganBelajar,
} from "@/db/schema";
import type { RekapAbsensi } from "@/db/queries/absensi";
import type { Semester as TaSemester } from "@/db/queries/tahun-ajaran";

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
    listRombonganBelajar: vi.fn(async () => [] as RombonganBelajar[]),
    listAnggotaRombonganBelajar: vi.fn(
      async () => [] as PenempatanRombonganBelajar[]
    ),
    listPesertaDidikByIds: vi.fn(async () => [] as PesertaDidik[]),
    getTahunAjaranAktif: vi.fn(async () => null as TahunAjaran | null),
    getSemesterAktif: vi.fn(async () => null as TaSemester | null),
    getAbsensiByTanggal: vi.fn(async () => [] as AbsensiHarian[]),
    getRekapByRombonganBelajar: vi.fn(
      async () => new Map<string, RekapAbsensi>()
    ),
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
vi.mock("@/db/queries/rombongan-belajar", () => ({
  listRombonganBelajar: mocks.listRombonganBelajar,
}));
vi.mock("@/db/queries/penempatan-rombongan-belajar", () => ({
  listAnggotaRombonganBelajar: mocks.listAnggotaRombonganBelajar,
}));
vi.mock("@/db/queries/peserta-didik", () => ({
  listPesertaDidikByIds: mocks.listPesertaDidikByIds,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  getSemesterAktif: mocks.getSemesterAktif,
}));
vi.mock("@/db/queries/absensi", () => ({
  getAbsensiByTanggal: mocks.getAbsensiByTanggal,
  getRekapByRombonganBelajar: mocks.getRekapByRombonganBelajar,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "akses:kelola",
      "absensi:baca",
      "absensi:buat",
      "absensi:ubah",
    ],
    dev: [
      "akses:kelola",
      "absensi:baca",
      "absensi:buat",
      "absensi:ubah",
    ],
    kepala_sekolah: ["absensi:baca"],
    guru: ["absensi:baca", "absensi:buat", "absensi:ubah"],
    wali_kelas: ["absensi:baca"],
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
    pengguna: {
      id: "pengguna_1",
      tenantId: "org_A",
      userId: "workos_u_1",
      peranAkses: roleSlug,
      ptkId: null,
      nama: null,
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    },
    izin,
    pembatasan,
    boleh,
  };
}

const TA_2025: TahunAjaran = {
  id: "ta_2025",
  tenantId: "org_A",
  nama: "2025/2026",
  aktif: true,
  dibuatPada: new Date("2025-07-01T00:00:00Z"),
};

const ROMBEL_1A: RombonganBelajar = {
  id: "rombel_1",
  tenantId: "org_A",
  nama: "Kelas 1A",
  tingkatId: "tingkat_1",
  tahunAjaranId: "ta_2025",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

const PD_ANDI: PesertaDidik = {
  id: "pd_1",
  tenantId: "org_A",
  nama: "Andi",
  nisn: null,
  nis: null,
  tanggalLahir: "2015-01-01",
  jenisKelamin: "L",
  status: "aktif",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
  diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
};

const PENEMPATAN_ANDI: PenempatanRombonganBelajar = {
  id: "pen_1",
  tenantId: "org_A",
  pesertaDidikId: "pd_1",
  rombonganBelajarId: "rombel_1",
  tahunAjaranId: "ta_2025",
  semester: "ganjil",
  status: "aktif",
  catatan: null,
  dibuatOleh: null,
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

const REKAP_ANDI: RekapAbsensi = {
  hadir: 5,
  izin: 1,
  sakit: 0,
  alpa: 0,
  total: 6,
};

async function renderPage(sp: Record<string, string | undefined> = {}) {
  const tree = await Page({ searchParams: Promise.resolve(sp) });
  return render(tree);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(async (_db, _tenantId, fn) =>
    fn(mocks.fakeTx)
  );
  mocks.getTahunAjaranAktif.mockResolvedValue(TA_2025);
  mocks.getSemesterAktif.mockResolvedValue("ganjil");
  mocks.listRombonganBelajar.mockResolvedValue([ROMBEL_1A]);
  mocks.listAnggotaRombonganBelajar.mockResolvedValue([PENEMPATAN_ANDI]);
  mocks.listPesertaDidikByIds.mockResolvedValue([PD_ANDI]);
  mocks.getAbsensiByTanggal.mockResolvedValue([]);
  mocks.getRekapByRombonganBelajar.mockResolvedValue(
    new Map([["pd_1", REKAP_ANDI]])
  );
});

describe("AbsensiPage — akses gate (#15 / T7 / T6)", () => {
  it("denied -> Pembatasan Akses; no tenant data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.listRombonganBelajar).not.toHaveBeenCalled();
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
    expect(mocks.listRombonganBelajar).not.toHaveBeenCalled();
  });

  it("active + pembatasan absensi:baca -> Pembatasan Akses; no tenant data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { pembatasan: ["absensi:baca"] })
    );
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.listRombonganBelajar).not.toHaveBeenCalled();
    expect(mocks.getTahunAjaranAktif).not.toHaveBeenCalled();
  });
});

describe("AbsensiPage — active period + drill-down (#15 / T7 / T6)", () => {
  it("no taAktif -> notice 'Aktifkan Tahun Ajaran terlebih dahulu'", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan")
    );
    mocks.getTahunAjaranAktif.mockResolvedValue(null);
    await renderPage();

    expect(
      screen.getByText(/Aktifkan Tahun Ajaran terlebih dahulu/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /Pilih Rombongan Belajar/i })
    ).toBeNull();
  });

  it("active + no searchParams -> only the rombel list (Pilih Rombongan Belajar); no form, no recap", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan")
    );
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Absensi Harian" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Pilih Rombongan Belajar" })
    ).toBeInTheDocument();
    expect(screen.getByText("Kelas 1A")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /Rekap Absensi/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Catat Absensi/i })
    ).toBeNull();
  });

  it("drill-down (rombel+tanggal) guru -> per-student 'Catat Absensi' form + recap; Absensi repo called", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage({
      rombonganBelajarId: "rombel_1",
      tanggal: "2026-04-15",
    });

    // Section title carries the rombel name + tanggal.
    expect(
      screen.getByRole("heading", { level: 2, name: /Kelas 1A · Tanggal 2026-04-15/i })
    ).toBeInTheDocument();

    // Roster + existing + rekap queries ran under the tenant GUC.
    expect(mocks.listAnggotaRombonganBelajar).toHaveBeenCalledWith(
      mocks.fakeTx,
      "rombel_1",
      "ta_2025",
      "ganjil"
    );
    expect(mocks.getAbsensiByTanggal).toHaveBeenCalledWith(
      mocks.fakeTx,
      "rombel_1",
      "2026-04-15"
    );
    expect(mocks.getRekapByRombonganBelajar).toHaveBeenCalledWith(
      mocks.fakeTx,
      "rombel_1"
    );

    // guru can input (absensi:buat): submit button renders.
    expect(
      screen.getByRole("button", { name: /Catat Absensi/i })
    ).toBeInTheDocument();
    // Recap appears + per-student counts render. "Andi" appears in BOTH the
    // per-student form and the recap table — assert via getAllByText.
    expect(screen.getAllByText("Andi").length).toBeGreaterThanOrEqual(1);
    // REKAP_ANDI.hadir = 5 renders in the recap row (single match in <td>).
    expect(
      within(screen.getByRole("table")).getByText("5")
    ).toBeInTheDocument();
  });

  it("admin drill-down -> full management; form present", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan")
    );
    await renderPage({
      rombonganBelajarId: "rombel_1",
      tanggal: "2026-04-15",
    });

    expect(
      screen.getByRole("button", { name: /Catat Absensi/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas (baca only) -> read-only; no submit button; 'hanya dapat membaca Absensi' notice", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await renderPage({
      rombonganBelajarId: "rombel_1",
      tanggal: "2026-04-15",
    });

    expect(
      screen.queryByRole("button", { name: /Catat Absensi/i })
    ).toBeNull();
    expect(
      screen.getByText(/hanya dapat membaca Absensi/i)
    ).toBeInTheDocument();
    // Recap still visible (oversight read).
    expect(
      screen.getByRole("heading", { level: 2, name: /Rekap Absensi/i })
    ).toBeInTheDocument();
  });

  it("drill-down with existing row -> submit reads 'Ubah Absensi' (AC#3 correctable)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.getAbsensiByTanggal.mockResolvedValue([
      {
        id: "absensi_1",
        tenantId: "org_A",
        pesertaDidikId: "pd_1",
        rombonganBelajarId: "rombel_1",
        tanggal: "2026-04-15",
        statusKehadiran: "hadir",
        metodeInput: "qr",
        catatan: null,
        sumberQr: "qr-token-xyz",
        dibuatOleh: "user_1",
        dibuatPada: new Date("2026-04-15T00:00:00Z"),
        diperbaruiPada: new Date("2026-04-15T00:00:00Z"),
        versi: 1,
      },
    ]);
    await renderPage({
      rombonganBelajarId: "rombel_1",
      tanggal: "2026-04-15",
    });

    // AC#3: existing QR row is correctable — button switches to "Ubah
    // Absensi"; provenance ("QR") shown next to the name.
    expect(
      screen.getByRole("button", { name: /Ubah Absensi/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Metode Input:/)).toBeInTheDocument();
    expect(screen.getByText(/QR/)).toBeInTheDocument();
  });
});
