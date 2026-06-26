import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { PesertaDidik } from "@/db/schema";

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
    listPesertaDidik: vi.fn(async () => [] as PesertaDidik[]),
    imporPesertaDidikAction: vi.fn(async () => undefined),
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
vi.mock("@/db/queries/peserta-didik", () => ({
  listPesertaDidik: mocks.listPesertaDidik,
}));
vi.mock("./actions", () => ({
  imporPesertaDidikAction: mocks.imporPesertaDidikAction,
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
      "impor_peserta_didik:baca",
      "impor_peserta_didik:kelola",
      "ekspor_peserta_didik:baca",
    ],
    dev: [
      "impor_peserta_didik:baca",
      "impor_peserta_didik:kelola",
      "ekspor_peserta_didik:baca",
    ],
    kepala_sekolah: ["impor_peserta_didik:baca", "ekspor_peserta_didik:baca"],
    guru: [],
    wali_kelas: [],
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

const PD_BUDI: PesertaDidik = {
  id: "pd_1",
  tenantId: "org_A",
  nama: "Budi Santoso",
  nisn: "12345678",
  nis: "NIS-001",
  tanggalLahir: "2010-05-15",
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
  mocks.listPesertaDidik.mockReset();
  mocks.imporPesertaDidikAction.mockReset();
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(async (_db, _t, fn) => fn(mocks.fakeTx));
  mocks.listPesertaDidik.mockResolvedValue([PD_BUDI]);
  mocks.imporPesertaDidikAction.mockResolvedValue(undefined);
});

describe("ImporPesertaDidikPage — render by akses context (#18)", () => {
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

  it("guru (no impor_peserta_didik:baca) -> Pembatasan Akses (no tool surface)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    // no tenant data loaded
    expect(mocks.listPesertaDidik).not.toHaveBeenCalled();
  });

  it("admin -> Template + Impor form + Ekspor link all present", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /Impor\/Ekspor Peserta Didik/i })
    ).toBeInTheDocument();

    // Template download (gated by kelola)
    const tmpl = screen.getByRole("link", { name: /Unduh Template/i });
    expect(tmpl).toBeInTheDocument();
    expect(tmpl.getAttribute("href") ?? "").toMatch(/^data:text\/csv/i);
    expect(tmpl).toHaveAttribute("download", "template-peserta-didik.csv");

    // Impor form (gated by kelola)
    expect(
      screen.getByRole("form", { name: /Impor Data/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Berkas CSV/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Impor/i })
    ).toBeInTheDocument();

    // Ekspor link (gated by ekspor:baca)
    const exp = screen.getByRole("link", { name: /Unduh Ekspor/i });
    expect(exp).toBeInTheDocument();
    expect(exp.getAttribute("href") ?? "").toMatch(/^data:text\/csv/i);
    expect(exp).toHaveAttribute("download", "peserta-didik.csv");

    // export loaded tenant data once
    expect(mocks.listPesertaDidik).toHaveBeenCalledTimes(1);
  });

  it("kepala_sekolah (impor:baca + ekspor:baca, NOT kelola) -> Ekspor only; no upload, no template", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    await renderPage();

    // export link visible
    expect(
      screen.getByRole("link", { name: /Unduh Ekspor/i })
    ).toBeInTheDocument();

    // NO template, NO upload form (kelola-gated)
    expect(
      screen.queryByRole("link", { name: /Unduh Template/i })
    ).toBeNull();
    expect(
      screen.queryByRole("form", { name: /Impor Data/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /^Impor$/i })
    ).toBeNull();

    expect(mocks.listPesertaDidik).toHaveBeenCalledTimes(1);
  });

  it("admin export CSV contains the tenant peserta name", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    const exp = screen.getByRole("link", { name: /Unduh Ekspor/i });
    const href = exp.getAttribute("href") ?? "";
    const decoded = decodeURIComponent(href.replace(/^data:text\/csv;charset=utf-8,/, ""));
    // The exported CSV body includes the tenant's student.
    expect(decoded).toContain("Budi Santoso");
  });
});
