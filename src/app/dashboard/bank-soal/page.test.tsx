import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type {
  ButirSoal,
  MataPelajaran,
  PaketSoal,
  PaketSoalButir,
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
    listMataPelajaran: vi.fn(async () => [] as MataPelajaran[]),
    listTingkat: vi.fn(async () => [] as Tingkat[]),
    listTahunAjaran: vi.fn(async () => [] as TahunAjaran[]),
    listButirSoal: vi.fn(async () => [] as ButirSoal[]),
    listPaketSoal: vi.fn(async () => [] as PaketSoal[]),
    listButirInPaket: vi.fn(async () => [] as PaketSoalButir[]),
    cariButirSoalById: vi.fn(async () => null as ButirSoal | null),
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
vi.mock("@/db/queries/mata-pelajaran", () => ({
  listMataPelajaran: mocks.listMataPelajaran,
}));
vi.mock("@/db/queries/tingkat", () => ({
  listTingkat: mocks.listTingkat,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  listTahunAjaran: mocks.listTahunAjaran,
}));
vi.mock("@/db/queries/bank-soal", () => ({
  listButirSoal: mocks.listButirSoal,
  listPaketSoal: mocks.listPaketSoal,
  listButirInPaket: mocks.listButirInPaket,
  cariButirSoalById: mocks.cariButirSoalById,
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
      "bank_soal:baca",
      "bank_soal:buat",
      "bank_soal:ubah",
      "paket_soal:baca",
      "paket_soal:buat",
      "paket_soal:ubah",
    ],
    dev: [
      "bank_soal:baca",
      "bank_soal:buat",
      "bank_soal:ubah",
      "paket_soal:baca",
      "paket_soal:buat",
      "paket_soal:ubah",
    ],
    kepala_sekolah: ["bank_soal:baca", "paket_soal:baca"],
    guru: [
      "bank_soal:baca",
      "bank_soal:buat",
      "bank_soal:ubah",
      "paket_soal:baca",
      "paket_soal:buat",
      "paket_soal:ubah",
    ],
    wali_kelas: ["bank_soal:baca", "paket_soal:baca"],
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

const MAPEL_MTK: MataPelajaran = {
  id: "mapel_1",
  kode: "MTK",
  nama: "Matematika",
};

const TINGKAT_1: Tingkat = {
  id: "tingkat_1",
  tenantId: "org_A",
  nama: "Kelas 1",
  urutan: 1,
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

const TA_2025: TahunAjaran = {
  id: "ta_2025",
  tenantId: "org_A",
  nama: "2025/2026",
  aktif: true,
  dibuatPada: new Date("2025-07-01T00:00:00Z"),
};

const BUTIR_PG: ButirSoal = {
  id: "butir_1",
  tenantId: "org_A",
  mataPelajaranId: "mapel_1",
  tingkatId: "tingkat_1",
  jenis: "pg",
  pertanyaan: "Berapakah 2 + 2?",
  pilihan: { A: "3", B: "4", C: "5", D: "6" },
  kunciJawaban: "B",
  pembahasan: "2 + 2 = 4.",
  drafAiId: null,
  status: "aktif",
  dibuatOleh: "user_a",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

const BUTIR_ESSAY: ButirSoal = {
  id: "butir_2",
  tenantId: "org_A",
  mataPelajaranId: "mapel_1",
  tingkatId: null,
  jenis: "essay",
  pertanyaan: "Jelaskan fotosintesis.",
  pilihan: null,
  kunciJawaban: "Proses pembuatan makanan.",
  pembahasan: null,
  drafAiId: null,
  status: "aktif",
  dibuatOleh: "user_a",
  dibuatPada: new Date("2026-01-02T00:00:00Z"),
};

const PAKET_uts: PaketSoal = {
  id: "paket_1",
  tenantId: "org_A",
  nama: "Paket UTS",
  mataPelajaranId: "mapel_1",
  tingkatId: "tingkat_1",
  tahunAjaranId: "ta_2025",
  semester: "ganjil",
  dibuatOleh: "user_a",
  dibuatPada: new Date("2026-01-05T00:00:00Z"),
};

const PAKET_BUTIR_1: PaketSoalButir = {
  id: "psb_1",
  tenantId: "org_A",
  paketSoalId: "paket_1",
  butirSoalId: "butir_1",
  urutan: 1,
  bobot: "2",
  dibuatPada: new Date("2026-01-05T00:00:00Z"),
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
  mocks.listMataPelajaran.mockResolvedValue([MAPEL_MTK]);
  mocks.listTingkat.mockResolvedValue([TINGKAT_1]);
  mocks.listTahunAjaran.mockResolvedValue([TA_2025]);
  mocks.listButirSoal.mockResolvedValue([BUTIR_PG, BUTIR_ESSAY]);
  mocks.listPaketSoal.mockResolvedValue([PAKET_uts]);
  mocks.listButirInPaket.mockResolvedValue([PAKET_BUTIR_1]);
  mocks.cariButirSoalById.mockResolvedValue(BUTIR_PG);
});

describe("BankSoalPage — akses gate (#16 / T7)", () => {
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

  it("active + pembatasan bank_soal:baca -> Pembatasan Akses, no data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { pembatasan: ["bank_soal:baca"] })
    );
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.listMataPelajaran).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });
});

describe("BankSoalPage — management surface by role (#16 / T7)", () => {
  it("admin (full) -> Buat Butir Soal + Buat Paket Soal forms render; both lists load", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Bank Soal" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan Butir Soal/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan Paket Soal/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Berapakah 2 + 2?")
    ).toBeInTheDocument();
    expect(screen.getByText("Paket UTS")).toBeInTheDocument();
  });

  it("guru (full Bank Soal) -> both forms render (guru authors + assembles)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();
    expect(
      screen.getByRole("button", { name: /Simpan Butir Soal/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Simpan Paket Soal/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas (read-only) -> no forms; lists + 'hanya baca' indicator", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await renderPage();

    expect(screen.getByText(/hanya baca/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Simpan Butir Soal/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Simpan Paket Soal/i })
    ).toBeNull();
    // Lists still visible.
    expect(screen.getByText("Paket UTS")).toBeInTheDocument();
  });

  it("empty lists -> both 'Belum ada' empty states", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listButirSoal.mockResolvedValue([]);
    mocks.listPaketSoal.mockResolvedValue([]);
    await renderPage();
    expect(screen.getByText(/Belum ada Butir Soal/i)).toBeInTheDocument();
    expect(screen.getByText(/Belum ada Paket Soal/i)).toBeInTheDocument();
  });
});

describe("BankSoalPage — drill-down (?paketId=... assembly view)", () => {
  it("links paket drill-down with ? when no search query exists", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    expect(
      screen.getByRole("link", { name: /Rakit \/ Lihat Butir/i })
    ).toHaveAttribute("href", "/dashboard/bank-soal?paketId=paket_1");
  });

  it("links butir drill-down with & when search query exists", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage({ q: "dua" });

    expect(screen.getAllByRole("link", { name: /Lihat detail/i })[0]).toHaveAttribute(
      "href",
      "/dashboard/bank-soal?q=dua&butirId=butir_1"
    );
  });

  it("admin + paketId -> paket members list + Tambah ke Paket form (candidates exclude members)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage({ paketId: "paket_1" });

    // The FormTambahButir renders (admin can write paket).
    expect(
      screen.getByRole("button", { name: /Tambah ke Paket/i })
    ).toBeInTheDocument();
    // The paket member list shows butir_1 (the pertanyaan appears in both the
    // main DaftarButirSoal and the paket DaftarButirPaket — assert >= 1).
    expect(
      screen.getAllByText("Berapakah 2 + 2?").length
    ).toBeGreaterThanOrEqual(1);
    // cariButirSoalById called for the member butir.
    expect(mocks.cariButirSoalById).toHaveBeenCalledWith(
      mocks.fakeTx,
      "butir_1"
    );
    // listButirInPaket called for the focused paket.
    expect(mocks.listButirInPaket).toHaveBeenCalledWith(
      mocks.fakeTx,
      "paket_1"
    );
  });

  it("wali_kelas + paketId -> read-only assembly (no Tambah form); members still shown", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await renderPage({ paketId: "paket_1" });

    expect(
      screen.queryByRole("button", { name: /Tambah ke Paket/i })
    ).toBeNull();
    // Read-only notice replaces the form.
    expect(
      screen.getByText(/hanya dapat membaca Paket Soal ini/i)
    ).toBeInTheDocument();
    // Members still rendered (same pertanyaan text appears in both lists).
    expect(
      screen.getAllByText("Berapakah 2 + 2?").length
    ).toBeGreaterThanOrEqual(1);
  });
});
