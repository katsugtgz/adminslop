import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { PerangkatAjar, MataPelajaran, Tingkat } from "@/db/schema";

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
    listPerangkatAjar: vi.fn(async () => [] as PerangkatAjar[]),
    listByJenis: vi.fn(async () => [] as PerangkatAjar[]),
    listMataPelajaran: vi.fn(async () => [] as MataPelajaran[]),
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
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: vi.fn(),
}));
vi.mock("@/db/queries/perangkat-ajar", () => ({
  listPerangkatAjar: mocks.listPerangkatAjar,
  listByJenis: mocks.listByJenis,
}));
vi.mock("@/db/queries/mata-pelajaran", () => ({
  listMataPelajaran: mocks.listMataPelajaran,
}));
vi.mock("@/db/queries/tingkat", () => ({
  listTingkat: mocks.listTingkat,
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
      "perangkat_ajar:baca",
      "perangkat_ajar:buat",
      "perangkat_ajar:ubah",
    ],
    dev: [
      "perangkat_ajar:baca",
      "perangkat_ajar:buat",
      "perangkat_ajar:ubah",
    ],
    kepala_sekolah: ["perangkat_ajar:baca"],
    guru: ["perangkat_ajar:baca", "perangkat_ajar:buat", "perangkat_ajar:ubah"],
    wali_kelas: ["perangkat_ajar:baca"],
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

const MAPEL: MataPelajaran = {
  id: "11111111-1111-1111-1111-111111111111",
  kode: "MTK",
  nama: "Matematika",
};
const TINGKAT: Tingkat = {
  id: "22222222-2222-2222-2222-222222222222",
  tenantId: "org_A",
  nama: "Kelas 1",
  urutan: 1,
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

function perangkat(
  id: string,
  over: Partial<PerangkatAjar> = {}
): PerangkatAjar {
  return {
    id,
    tenantId: "org_A",
    jenis: "rpp",
    mataPelajaranId: MAPEL.id,
    tingkatId: null,
    tahunAjaranId: "ta_1",
    semester: "ganjil",
    judul: `Perangkat ${id}`,
    konten: {},
    drafAiId: null,
    statusDokumenAi: null,
    dibuatOleh: "workos_u_1",
    dibuatPada: new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  const tree = await Page({ searchParams: Promise.resolve(searchParams) });
  return render(tree);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(async (_db, _t, fn) => fn(mocks.fakeTx));
  mocks.listPerangkatAjar.mockResolvedValue([]);
  mocks.listByJenis.mockResolvedValue([]);
  mocks.listMataPelajaran.mockResolvedValue([MAPEL]);
  mocks.listTingkat.mockResolvedValue([TINGKAT]);
});

describe("PerangkatAjarPage — render by akses context (#17 / T6)", () => {
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

  it("wali_kelas (baca only) -> read-only: no create form, no data loads leak", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    mocks.listPerangkatAjar.mockResolvedValue([perangkat("p_1")]);
    await renderPage();

    expect(
      screen.queryByRole("button", { name: /Simpan Perangkat Ajar/i })
    ).toBeNull();
    // list still renders the read-only row
    expect(screen.getByText(/Perangkat p_1/)).toBeInTheDocument();
  });

  it("guru (baca+buat+ubah) -> create form shown + list shown", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listPerangkatAjar.mockResolvedValue([perangkat("p_1")]);
    await renderPage();

    expect(
      screen.getByRole("button", { name: /Simpan Perangkat Ajar/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/Perangkat p_1/)).toBeInTheDocument();
  });

  it("?jenis=rpp -> listByJenis called; header shows 'RPP'", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listByJenis.mockResolvedValue([perangkat("p_rpp")]);
    await renderPage({ jenis: "rpp" });

    expect(mocks.listByJenis).toHaveBeenCalledWith(
      mocks.fakeTx,
      "rpp"
    );
    expect(mocks.listPerangkatAjar).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: /^RPP$/ })
    ).toBeInTheDocument();
  });

  it("invalid ?jenis -> falls back to listPerangkatAjar (all)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listPerangkatAjar.mockResolvedValue([perangkat("p_1")]);
    await renderPage({ jenis: "tidak_ada" });

    expect(mocks.listByJenis).not.toHaveBeenCalled();
    expect(mocks.listPerangkatAjar).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: /Daftar Perangkat Ajar/i })
    ).toBeInTheDocument();
  });

  it("menunggu AI doc + bolehUbah -> verifikasi buttons (AC#3); disetujui -> none", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listPerangkatAjar.mockResolvedValue([
      perangkat("p_menunggu", { statusDokumenAi: "menunggu" }),
      perangkat("p_disetujui", { statusDokumenAi: "disetujui" }),
    ]);
    await renderPage();

    // menunggu doc -> Setujui/Tolak present + the resmi warning.
    expect(screen.getAllByRole("button", { name: /Disetujui/i }).length).toBe(1);
    expect(screen.getAllByRole("button", { name: /Ditolak/i }).length).toBe(1);
    expect(
      screen.getByText(/tidak dapat digunakan sebagai dokumen resmi/i)
    ).toBeInTheDocument();
    // disetujui doc -> badge only, no buttons.
    expect(screen.getAllByText(/Disetujui/i).length).toBeGreaterThan(0);
  });

  it("menunggu AI doc + read-only (wali_kelas) -> warning shown, NO verifikasi buttons", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    mocks.listPerangkatAjar.mockResolvedValue([
      perangkat("p_menunggu", { statusDokumenAi: "menunggu" }),
    ]);
    await renderPage();

    expect(
      screen.getByText(/tidak dapat digunakan sebagai dokumen resmi/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Disetujui$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Ditolak$/i })).toBeNull();
  });

  it("empty list -> 'Belum ada Perangkat Ajar.' empty state", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listPerangkatAjar.mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText(/Belum ada Perangkat Ajar/i)).toBeInTheDocument();
  });
});
