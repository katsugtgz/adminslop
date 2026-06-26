import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type {
  BebanMengajar,
  MataPelajaran,
  Ptk,
  RombonganBelajar,
  TahunAjaran,
  Tingkat,
  WaliKelas,
} from "@/db/schema";
import type { Semester } from "@/db/queries/beban-mengajar";

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
    listBebanMengajar: vi.fn(async () => [] as BebanMengajar[]),
    getBebanMengajarSaya: vi.fn(async () => [] as BebanMengajar[]),
    listWaliKelas: vi.fn(async () => [] as WaliKelas[]),
    getWaliKelasSaya: vi.fn(async () => [] as WaliKelas[]),
    getTahunAjaranAktif: vi.fn(async () => null as TahunAjaran | null),
    getSemesterAktif: vi.fn(async () => null as Semester | null),
    listPtk: vi.fn(async () => [] as Ptk[]),
    listRombonganBelajar: vi.fn(async () => [] as RombonganBelajar[]),
    listTingkat: vi.fn(async () => [] as Tingkat[]),
    listMataPelajaran: vi.fn(async () => [] as MataPelajaran[]),
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
  catatAudit: vi.fn(),
}));
vi.mock("@/db/queries/beban-mengajar", () => ({
  listBebanMengajar: mocks.listBebanMengajar,
  getBebanMengajarSaya: mocks.getBebanMengajarSaya,
}));
vi.mock("@/db/queries/wali-kelas", () => ({
  listWaliKelas: mocks.listWaliKelas,
  getWaliKelasSaya: mocks.getWaliKelasSaya,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  getSemesterAktif: mocks.getSemesterAktif,
}));
vi.mock("@/db/queries/akses", () => ({
  listPtk: mocks.listPtk,
}));
vi.mock("@/db/queries/rombongan-belajar", () => ({
  listRombonganBelajar: mocks.listRombonganBelajar,
}));
vi.mock("@/db/queries/tingkat", () => ({
  listTingkat: mocks.listTingkat,
}));
vi.mock("@/db/queries/mata-pelajaran", () => ({
  listMataPelajaran: mocks.listMataPelajaran,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

/**
 * Build an "active" AksesSaya whose `boleh()` mirrors the REAL evaluasiAkses
 * precedence (pembatasan > izin > peran default) for the beban_mengajar +
 * wali_kelas surface. `ptkId` optionally links the pengguna to a PTK (AC#4).
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: {
    izin?: IzinSlug[];
    pembatasan?: IzinSlug[];
    ptkId?: string;
    nama?: string;
  }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "beban_mengajar:baca",
      "beban_mengajar:buat",
      "beban_mengajar:ubah",
      "wali_kelas:baca",
      "wali_kelas:buat",
      "wali_kelas:ubah",
    ],
    dev: [
      "beban_mengajar:baca",
      "beban_mengajar:buat",
      "beban_mengajar:ubah",
      "wali_kelas:baca",
      "wali_kelas:buat",
      "wali_kelas:ubah",
    ],
    kepala_sekolah: ["beban_mengajar:baca", "wali_kelas:baca"],
    guru: ["beban_mengajar:baca", "wali_kelas:baca"],
    wali_kelas: ["beban_mengajar:baca", "wali_kelas:baca"],
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
      ptkId: opts?.ptkId ?? null,
      nama: opts?.nama ?? null,
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

const PTK_BUDI: Ptk = {
  id: "ptk_1",
  tenantId: "org_A",
  nama: "Budi",
  nip: null,
  jenis: "pendidik",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

const MAPEL_MTK: MataPelajaran = { id: "mapel_1", kode: "MTK", nama: "Matematika" };
const ROMBEL_1A: RombonganBelajar = {
  id: "rombel_1",
  tenantId: "org_A",
  nama: "Kelas 1A",
  tingkatId: "tingkat_1",
  tahunAjaranId: "ta_2025",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};
const TINGKAT_1: Tingkat = {
  id: "tingkat_1",
  tenantId: "org_A",
  nama: "Kelas 1",
  urutan: 1,
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

async function renderPage() {
  const tree = await Page();
  return render(tree);
}

beforeEach(() => {
  mocks.getAksesSaya.mockReset();
  mocks.getDb.mockReset();
  mocks.withTenant.mockReset();
  mocks.listBebanMengajar.mockReset();
  mocks.getBebanMengajarSaya.mockReset();
  mocks.listWaliKelas.mockReset();
  mocks.getWaliKelasSaya.mockReset();
  mocks.getTahunAjaranAktif.mockReset();
  mocks.getSemesterAktif.mockReset();
  mocks.listPtk.mockReset();
  mocks.listRombonganBelajar.mockReset();
  mocks.listTingkat.mockReset();
  mocks.listMataPelajaran.mockReset();
  // restore default implementations
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(async (_db, _tenantId, fn) =>
    fn(mocks.fakeTx)
  );
  mocks.listBebanMengajar.mockResolvedValue([]);
  mocks.getBebanMengajarSaya.mockResolvedValue([]);
  mocks.listWaliKelas.mockResolvedValue([]);
  mocks.getWaliKelasSaya.mockResolvedValue([]);
  mocks.getTahunAjaranAktif.mockResolvedValue(TA_2025);
  mocks.getSemesterAktif.mockResolvedValue("ganjil");
  mocks.listPtk.mockResolvedValue([PTK_BUDI]);
  mocks.listRombonganBelajar.mockResolvedValue([ROMBEL_1A]);
  mocks.listTingkat.mockResolvedValue([TINGKAT_1]);
  mocks.listMataPelajaran.mockResolvedValue([MAPEL_MTK]);
});

describe("BebanMengajarPage — render by akses context (#10 / T6)", () => {
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

  it("admin + taAktif -> full management (Form + Daftar Beban + Form + Daftar Wali); calls list* queries", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Beban Mengajar" })
    ).toBeInTheDocument();
    // active period display
    expect(screen.getByText(/2025\/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Ganjil/i)).toBeInTheDocument();
    // management surface
    expect(
      screen.getByRole("button", { name: /Tambah Beban Mengajar/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tetapkan Wali Kelas/i })
    ).toBeInTheDocument();
    // admin sees the full lists (school-wide)
    expect(mocks.listBebanMengajar).toHaveBeenCalledTimes(1);
    expect(mocks.listWaliKelas).toHaveBeenCalledTimes(1);
    expect(mocks.getBebanMengajarSaya).not.toHaveBeenCalled();
    expect(mocks.getWaliKelasSaya).not.toHaveBeenCalled();
  });

  it("guru with ptkId (AC#4) -> read-only KonteksGuru ('Beban Mengajar Saya' + 'Wali Kelas Saya'); getSaya called with guru ptkId; NO management forms", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { ptkId: "ptk_1", nama: "Anda" })
    );
    await renderPage();

    // guru context headings
    expect(
      screen.getByRole("heading", { name: "Beban Mengajar Saya" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Wali Kelas Saya" })
    ).toBeInTheDocument();
    // NO management forms
    expect(
      screen.queryByRole("button", { name: /Tambah Beban Mengajar/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Tetapkan Wali Kelas/i })
    ).toBeNull();
    // AC#4: guru's own beban/wali resolved via getSaya with their ptkId
    expect(mocks.getBebanMengajarSaya).toHaveBeenCalledWith(
      mocks.fakeTx,
      "ptk_1",
      "ta_2025",
      "ganjil"
    );
    expect(mocks.getWaliKelasSaya).toHaveBeenCalledWith(
      mocks.fakeTx,
      "ptk_1",
      "ta_2025",
      "ganjil"
    );
    expect(mocks.listBebanMengajar).not.toHaveBeenCalled();
    expect(mocks.listWaliKelas).not.toHaveBeenCalled();
  });

  it("admin + no taAktif -> notice 'Aktifkan Tahun Ajaran terlebih dahulu'", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.getTahunAjaranAktif.mockResolvedValue(null);
    await renderPage();

    expect(
      screen.getByText(/Aktifkan Tahun Ajaran terlebih dahulu/i)
    ).toBeInTheDocument();
    // no management forms when there is no active period
    expect(
      screen.queryByRole("button", { name: /Tambah Beban Mengajar/i })
    ).toBeNull();
  });

  it("admin + empty lists -> empty states 'Belum ada Beban Mengajar.' + 'Belum ada Wali Kelas.'", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listBebanMengajar.mockResolvedValue([]);
    mocks.listWaliKelas.mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText(/Belum ada Beban Mengajar/i)).toBeInTheDocument();
    expect(screen.getByText(/Belum ada Wali Kelas/i)).toBeInTheDocument();
    // management surface still renders
    expect(
      screen.getByRole("button", { name: /Tambah Beban Mengajar/i })
    ).toBeInTheDocument();
  });

  it("guru without ptkId -> read-only school-wide list + 'Hubungi admin' warning", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();

    expect(
      screen.getByText(/Hubungi admin untuk menghubungkan akun PTK Anda/i)
    ).toBeInTheDocument();
    // falls back to the school-wide list (read-only — no management forms)
    expect(mocks.listBebanMengajar).toHaveBeenCalledTimes(1);
    expect(mocks.listWaliKelas).toHaveBeenCalledTimes(1);
    expect(mocks.getBebanMengajarSaya).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Tambah Beban Mengajar/i })
    ).toBeNull();
  });
});
