import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type {
  BebanMengajar,
  KomponenNilai,
  MataPelajaran,
  NilaiPesertaDidik,
  Penilaian,
  PesertaDidik,
  Ptk,
  RombonganBelajar,
  TahunAjaran,
  Tingkat,
} from "@/db/schema";
import type { Semester } from "@/db/queries/beban-mengajar";
import type { NilaiAkhirPesertaDidik } from "@/db/queries/nilai-peserta-didik";

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
    getBebanMengajarSaya: vi.fn(async () => [] as BebanMengajar[]),
    listBebanMengajar: vi.fn(async () => [] as BebanMengajar[]),
    listKomponenNilai: vi.fn(async () => [] as KomponenNilai[]),
    listPenilaian: vi.fn(async () => [] as Penilaian[]),
    listNilaiByPenilaian: vi.fn(async () => [] as NilaiPesertaDidik[]),
    getNilaiAkhir: vi.fn(async () => [] as NilaiAkhirPesertaDidik[]),
    getTahunAjaranAktif: vi.fn(async () => null as TahunAjaran | null),
    getSemesterAktif: vi.fn(async () => null as Semester | null),
    listPtk: vi.fn(async () => [] as Ptk[]),
    listPesertaDidik: vi.fn(async () => [] as PesertaDidik[]),
    listMataPelajaran: vi.fn(async () => [] as MataPelajaran[]),
    listRombonganBelajar: vi.fn(async () => [] as RombonganBelajar[]),
    listTingkat: vi.fn(async () => [] as Tingkat[]),
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
vi.mock("@/db/queries/beban-mengajar", () => ({
  getBebanMengajarSaya: mocks.getBebanMengajarSaya,
  listBebanMengajar: mocks.listBebanMengajar,
}));
vi.mock("@/db/queries/komponen-nilai", () => ({
  listKomponenNilai: mocks.listKomponenNilai,
}));
vi.mock("@/db/queries/penilaian", () => ({
  listPenilaian: mocks.listPenilaian,
}));
vi.mock("@/db/queries/nilai-peserta-didik", () => ({
  listNilaiByPenilaian: mocks.listNilaiByPenilaian,
  getNilaiAkhir: mocks.getNilaiAkhir,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  getSemesterAktif: mocks.getSemesterAktif,
}));
vi.mock("@/db/queries/akses", () => ({
  listPtk: mocks.listPtk,
}));
vi.mock("@/db/queries/peserta-didik", () => ({
  listPesertaDidik: mocks.listPesertaDidik,
}));
vi.mock("@/db/queries/mata-pelajaran", () => ({
  listMataPelajaran: mocks.listMataPelajaran,
}));
vi.mock("@/db/queries/rombongan-belajar", () => ({
  listRombonganBelajar: mocks.listRombonganBelajar,
}));
vi.mock("@/db/queries/tingkat", () => ({
  listTingkat: mocks.listTingkat,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

function aksesAktif(
  roleSlug: RoleSlug,
  opts?: {
    izin?: IzinSlug[];
    pembatasan?: IzinSlug[];
    ptkId?: string;
  }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "akses:kelola",
      "penilaian:baca",
      "penilaian:buat",
      "penilaian:ubah",
    ],
    dev: [
      "akses:kelola",
      "penilaian:baca",
      "penilaian:buat",
      "penilaian:ubah",
    ],
    kepala_sekolah: ["penilaian:baca"],
    guru: ["penilaian:baca", "penilaian:buat", "penilaian:ubah"],
    wali_kelas: ["penilaian:baca"],
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

const PTK_BUDI: Ptk = {
  id: "ptk_1",
  tenantId: "org_A",
  nama: "Budi",
  nip: null,
  jenis: "pendidik",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
  arsipPada: null,
  arsipOleh: null,
};

const MAPEL_MTK: MataPelajaran = {
  id: "mapel_1",
  kode: "MTK",
  nama: "Matematika",
};
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

const BEBAN_1: BebanMengajar = {
  id: "beban_1",
  tenantId: "org_A",
  ptkId: "ptk_1",
  mataPelajaranId: "mapel_1",
  rombonganBelajarId: "rombel_1",
  tingkatId: null,
  tahunAjaranId: "ta_2025",
  semester: "ganjil",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
  arsipPada: null,
  arsipOleh: null,
};

const KOMPONEN_UTS: KomponenNilai = {
  id: "kn_1",
  tenantId: "org_A",
  bebanMengajarId: "beban_1",
  nama: "UTS",
  bobot: "30",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

const PENILAIAN_TUGAS1: Penilaian = {
  id: "pen_1",
  tenantId: "org_A",
  komponenNilaiId: "kn_1",
  nama: "Tugas 1",
  tanggal: "2026-01-10",
  dibuatOleh: null,
  dibuatPada: new Date("2026-01-10T00:00:00Z"),
  arsipPada: null,
  arsipOleh: null,
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

const NILAI_AKHIR_ANDI: NilaiAkhirPesertaDidik = {
  pesertaDidikId: "pd_1",
  nilaiAkhir: 87,
  rincian: [
    {
      komponenNilaiId: "kn_1",
      nama: "UTS",
      bobot: 30,
      rataRata: 80,
      jumlahPenilaian: 1,
    },
  ],
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
  mocks.listBebanMengajar.mockResolvedValue([BEBAN_1]);
  mocks.getBebanMengajarSaya.mockResolvedValue([BEBAN_1]);
  mocks.listPtk.mockResolvedValue([PTK_BUDI]);
  mocks.listMataPelajaran.mockResolvedValue([MAPEL_MTK]);
  mocks.listRombonganBelajar.mockResolvedValue([ROMBEL_1A]);
  mocks.listTingkat.mockResolvedValue([TINGKAT_1]);
  mocks.listPesertaDidik.mockResolvedValue([PD_ANDI]);
  mocks.listKomponenNilai.mockResolvedValue([KOMPONEN_UTS]);
  mocks.listPenilaian.mockResolvedValue([PENILAIAN_TUGAS1]);
  mocks.listNilaiByPenilaian.mockResolvedValue([]);
  mocks.getNilaiAkhir.mockResolvedValue([NILAI_AKHIR_ANDI]);
});

describe("PenilaianPage — akses gate (#11 / T7 / T6)", () => {
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

  it("active + pembatasan penilaian:baca -> Pembatasan Akses, no data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { pembatasan: ["penilaian:baca"] })
    );
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.listBebanMengajar).not.toHaveBeenCalled();
    expect(mocks.getBebanMengajarSaya).not.toHaveBeenCalled();
  });
});

describe("PenilaianPage — AC#4 beban scope + management (#11 / T7 / T6)", () => {
  it("admin + taAktif -> school-wide beban (listBebanMengajar) + full management forms on drill-down", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage({
      bebanId: "beban_1",
      komponenId: "kn_1",
      penilaianId: "pen_1",
    });

    expect(
      screen.getByRole("heading", { level: 1, name: "Penilaian" })
    ).toBeInTheDocument();
    expect(screen.getByText(/2025\/2026/i)).toBeInTheDocument();
    // admin sees the school-wide beban list.
    expect(mocks.listBebanMengajar).toHaveBeenCalledTimes(1);
    expect(mocks.getBebanMengajarSaya).not.toHaveBeenCalled();
    // full management: all three forms render.
    expect(
      screen.getByRole("button", { name: /Tambah Komponen Nilai/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tambah Penilaian/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan Nilai/i })
    ).toBeInTheDocument();
  });

  it("guru with ptkId (AC#4) -> ONLY their own beban via getBebanMengajarSaya(ptkId); 'Beban Mengajar Saya' heading", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { ptkId: "ptk_1" })
    );
    await renderPage({ bebanId: "beban_1" });

    expect(
      screen.getByRole("heading", { name: "Beban Mengajar Saya" })
    ).toBeInTheDocument();
    // AC#4: guru's own beban resolved via getSaya with their ptkId.
    expect(mocks.getBebanMengajarSaya).toHaveBeenCalledWith(
      mocks.fakeTx,
      "ptk_1",
      "ta_2025",
      "ganjil"
    );
    expect(mocks.listBebanMengajar).not.toHaveBeenCalled();
    // guru can still manage their own (role-level penilaian:buat).
    expect(
      screen.getByRole("button", { name: /Tambah Komponen Nilai/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas (baca only) -> read-only; no management forms even on full drill-down", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await renderPage({
      bebanId: "beban_1",
      komponenId: "kn_1",
      penilaianId: "pen_1",
    });

    // school-wide list (wali_kelas has no ptkId here -> not guru context).
    expect(mocks.listBebanMengajar).toHaveBeenCalledTimes(1);
    expect(mocks.getBebanMengajarSaya).not.toHaveBeenCalled();
    // read-only: no management forms.
    expect(
      screen.queryByRole("button", { name: /Tambah Komponen Nilai/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Tambah Penilaian/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Simpan Nilai/i })
    ).toBeNull();
    // read-only notice replaces the Input Nilai form.
    expect(
      screen.getByText(/hanya dapat membaca Penilaian/i)
    ).toBeInTheDocument();
  });
});

describe("PenilaianPage — active period + Nilai Akhir (#11 / T7 / T6)", () => {
  it("no taAktif -> notice 'Aktifkan Tahun Ajaran terlebih dahulu'", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.getTahunAjaranAktif.mockResolvedValue(null);
    await renderPage();

    expect(
      screen.getByText(/Aktifkan Tahun Ajaran terlebih dahulu/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Tambah Komponen Nilai/i })
    ).toBeNull();
  });

  it("AC#3 Nilai Akhir display: getNilaiAkhir called per expanded beban; derived value + rincian shown", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage({ bebanId: "beban_1" });

    // getNilaiAkhir resolved for the expanded beban (server-side, tenant-scoped).
    expect(mocks.getNilaiAkhir).toHaveBeenCalledWith(
      mocks.fakeTx,
      "beban_1"
    );
    // derived Nilai Akhir + auditable rincian render (AC#3).
    expect(screen.getByText("Andi")).toBeInTheDocument();
    expect(screen.getByText("87")).toBeInTheDocument();
    expect(
      screen.getByText("UTS · Bobot: 30 · Rata-rata: 80")
    ).toBeInTheDocument();
  });

  it("active + no searchParams -> beban list only; no deeper sections", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 2, name: "Beban Mengajar" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Matematika/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Komponen Nilai" })
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Penilaian" })
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Input Nilai" })
    ).toBeNull();
  });
});
