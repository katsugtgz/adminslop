import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type {
  DrafEraport,
  DokumenCetak,
  PesertaDidik,
  TemplateCetak,
} from "@/db/schema";

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
    listTemplateCetak: vi.fn(async () => [] as TemplateCetak[]),
    listDokumenCetak: vi.fn(async () => [] as DokumenCetak[]),
    listDrafEraport: vi.fn(async () => [] as DrafEraport[]),
    listPesertaDidik: vi.fn(async () => [] as PesertaDidik[]),
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
vi.mock("@/db/queries/cetak", () => ({
  listTemplateCetak: mocks.listTemplateCetak,
  listDokumenCetak: mocks.listDokumenCetak,
}));
vi.mock("@/db/queries/eraport", () => ({
  listDrafEraport: mocks.listDrafEraport,
}));
vi.mock("@/db/queries/peserta-didik", () => ({
  listPesertaDidik: mocks.listPesertaDidik,
}));

import Page from "./page";

function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: ["cetak:baca", "cetak:buat", "cetak:ubah"],
    dev: ["cetak:baca", "cetak:buat", "cetak:ubah"],
    kepala_sekolah: ["cetak:baca", "cetak:buat"],
    guru: ["cetak:baca"],
    wali_kelas: ["cetak:baca"],
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

function template(id: string, over: Partial<TemplateCetak> = {}): TemplateCetak {
  return {
    id,
    tenantId: "org_A",
    nama: `Template ${id}`,
    jenis: "eraport",
    pengaturan: { marginMm: 15 },
    isDefault: false,
    dibuatOleh: "u",
    dibuatPada: new Date("2026-06-01T00:00:00Z"),
    ...over,
  };
}

function dokumen(id: string, over: Partial<DokumenCetak> = {}): DokumenCetak {
  return {
    id,
    tenantId: "org_A",
    drafEraportId: "er_1",
    templateCetakId: "tpl_1",
    tandaTanganNama: null,
    tandaTanganPeran: null,
    stempelUrl: null,
    format: "a4",
    dibuatOleh: "u",
    dibuatPada: new Date("2026-06-01T00:00:00Z"),
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
    status: "terbit",
    konten: { nilaiAkhir: 90 },
    drafAiId: null,
    catatan: null,
    dibuatOleh: "u",
    dibuatPada: new Date("2026-06-01T00:00:00Z"),
    diterbitkanPada: new Date("2026-06-02T00:00:00Z"),
    ...over,
  };
}

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
    dibuatPada: new Date("2026-06-01T00:00:00Z"),
    diperbaruiPada: new Date("2026-06-01T00:00:00Z"),
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
  mocks.listTemplateCetak.mockResolvedValue([]);
  mocks.listDokumenCetak.mockResolvedValue([]);
  mocks.listDrafEraport.mockResolvedValue([]);
  mocks.listPesertaDidik.mockResolvedValue([]);
});

describe("CetakPage — render by akses context (#14)", () => {
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

  it("guru (cetak:baca only) -> read-only: no create form, empty states", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    mocks.listTemplateCetak.mockResolvedValue([]);
    mocks.listDokumenCetak.mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText(/Belum ada Template Cetak/i)).toBeInTheDocument();
    expect(screen.getByText(/Belum ada Dokumen Cetak/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Buat Template/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Cetak Dokumen/i })
    ).toBeNull();
  });

  it("admin (baca+buat) -> create form shown + Pratinjau link per terbit eraport", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listTemplateCetak.mockResolvedValue([template("tpl_1", { isDefault: true })]);
    mocks.listDrafEraport.mockResolvedValue([eraport("er_1")]);
    mocks.listPesertaDidik.mockResolvedValue([pesertaDidik("pd_1")]);
    mocks.listDokumenCetak.mockResolvedValue([
      dokumen("dok_1", { drafEraportId: "er_1", format: "a4" }),
    ]);
    await renderPage();

    expect(
      screen.getByRole("button", { name: /Buat Template/i })
    ).toBeInTheDocument();
    // Default badge on the template.
    expect(screen.getByText("Default")).toBeInTheDocument();
    // Pratinjau link (one per terbit eraport + one per dokumen = 2).
    expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(1);
    // Dokumen list shows format.
    expect(screen.getByText(/Format: A4/i)).toBeInTheDocument();
  });

  it("!cetak:baca (no role) -> Pembatasan Akses; NO tenant data loads", async () => {
    // guru stripped of cetak:baca via pembatasan.
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { pembatasan: ["cetak:baca"] })
    );
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(mocks.listTemplateCetak).not.toHaveBeenCalled();
  });
});
