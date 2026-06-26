import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { DrafEraport, PesertaDidik, RevisiEraport, TahunAjaran } from "@/db/schema";

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
    listDrafEraport: vi.fn(async () => [] as DrafEraport[]),
    listRevisiByEraport: vi.fn(async () => [] as RevisiEraport[]),
    listPesertaDidik: vi.fn(async () => [] as PesertaDidik[]),
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
vi.mock("@/db/queries/eraport", () => ({
  listDrafEraport: mocks.listDrafEraport,
  listRevisiByEraport: mocks.listRevisiByEraport,
}));
vi.mock("@/db/queries/peserta-didik", () => ({
  listPesertaDidik: mocks.listPesertaDidik,
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
      "eraport:baca",
      "eraport:buat",
      "eraport:terbit",
      "eraport:revisi",
    ],
    dev: ["eraport:baca", "eraport:buat", "eraport:terbit", "eraport:revisi"],
    kepala_sekolah: ["eraport:baca", "eraport:terbit"],
    guru: ["eraport:baca", "eraport:buat"],
    wali_kelas: ["eraport:baca"],
  };
  const boleh = (diminta: IzinSlug): KeputusanAkses => {
    if (pembatasan.includes(diminta))
      return { diizinkan: false, sumber: "pembatasan" };
    if (izin.includes(diminta)) return { diizinkan: true, sumber: "izin" };
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

function pesertaDidik(id: string, over: Partial<PesertaDidik> = {}): PesertaDidik {
  return {
    id,
    tenantId: "org_A",
    nama: `PD-${id}`,
    nisn: null,
    nis: null,
    tanggalLahir: "2010-01-01",
    jenisKelamin: "L",
    status: "aktif",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
    diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

function eraport(id: string, over: Partial<DrafEraport> = {}): DrafEraport {
  return {
    id,
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    tahunAjaranId: "ta_1",
    semester: "ganjil",
    status: "draf",
    konten: { sumber: "nilai_akhir", nilaiAkhir: 87.5 },
    drafAiId: null,
    catatan: null,
    dibuatOleh: "workos_u_1",
    dibuatPada: new Date("2026-06-01T00:00:00Z"),
    diterbitkanPada: null,
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
  mocks.listPesertaDidik.mockResolvedValue([pesertaDidik("pd_1")]);
  mocks.listDrafEraport.mockResolvedValue([]);
  mocks.listRevisiByEraport.mockResolvedValue([]);
});

describe("EraportPage — render by akses context (#13 / T7)", () => {
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

  it("wali_kelas (eraport:baca only) -> read-only: no form, no terbit button, empty-state list", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    mocks.listDrafEraport.mockResolvedValue([]);
    await renderPage();

    expect(
      screen.getByText(/Belum ada E-Raport/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Buat Draf/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Terbitkan/i })
    ).toBeNull();
  });

  it("guru (baca+buat, no terbit/revisi) -> FormDrafEraport shown, no Terbitkan button", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listDrafEraport.mockResolvedValue([eraport("er_1", { status: "draf" })]);
    await renderPage();

    expect(
      screen.getByRole("button", { name: /Buat Draf/i })
    ).toBeInTheDocument();
    // guru cannot terbit -> no Terbitkan on the draf row.
    expect(
      screen.queryByRole("button", { name: /^Terbitkan$/i })
    ).toBeNull();
  });

  it("kepala_sekolah (baca+terbit, no buat) -> no form, Terbitkan button on draf row", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    mocks.listDrafEraport.mockResolvedValue([eraport("er_1", { status: "draf" })]);
    await renderPage();

    expect(
      screen.queryByRole("button", { name: /Buat Draf/i })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Terbitkan$/i })
    ).toBeInTheDocument();
  });

  it("no active Tahun Ajaran -> 'Aktifkan Tahun Ajaran' notice, no data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.getTahunAjaranAktif.mockResolvedValue(null);
    await renderPage();

    expect(
      screen.getByText(/Aktifkan Tahun Ajaran terlebih dahulu/i)
    ).toBeInTheDocument();
    expect(mocks.listDrafEraport).not.toHaveBeenCalled();
    expect(mocks.listPesertaDidik).not.toHaveBeenCalled();
  });

  it("admin (all 4) -> form + terbit; already-terbit row hides Terbitkan button", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listDrafEraport.mockResolvedValue([
      eraport("er_draf", { status: "draf", pesertaDidikId: "pd_1" }),
      eraport("er_terbit", {
        status: "terbit",
        pesertaDidikId: "pd_1",
        semester: "genap",
        diterbitkanPada: new Date("2026-06-02T00:00:00Z"),
      }),
    ]);
    await renderPage();

    expect(
      screen.getByRole("button", { name: /Buat Draf/i })
    ).toBeInTheDocument();
    // exactly one Terbitkan (on the draf row); the terbit row hides it.
    expect(
      screen.getAllByRole("button", { name: /^Terbitkan$/i }).length
    ).toBe(1);
    // status badges present.
    expect(screen.getByText("Draf")).toBeInTheDocument();
    expect(screen.getByText("Terbit")).toBeInTheDocument();
  });
});
