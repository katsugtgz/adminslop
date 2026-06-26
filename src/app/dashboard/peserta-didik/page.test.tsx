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
vi.mock("@/db/queries/peserta-didik", () => ({
  listPesertaDidik: mocks.listPesertaDidik,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

/**
 * Build an "active" AksesSaya whose `boleh()` mirrors the REAL evaluasiAkses
 * precedence (pembatasan > izin > peran default), scoped to the peserta_didik
 * izin vocabulary.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  // Mirrors PERAN_KE_IZIN_DEFAULT for the peserta_didik:* slugs.
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
  // restore default implementations
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(
    async (_db, _tenantId, fn) => fn(mocks.fakeTx)
  );
  mocks.listPesertaDidik.mockResolvedValue([PD_BUDI]);
});

describe("PesertaDidikPage — render by akses context (#7 / T7)", () => {
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

  it("active + guru (baca only) -> read-only list (no Tambah / Ubah Status)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();

    // list shown
    expect(
      screen.getByRole("heading", { name: "Peserta Didik" })
    ).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    // read-only: no create form, no status form
    expect(
      screen.queryByRole("button", { name: /Tambah Peserta Didik/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Ubah Status/i })
    ).toBeNull();
  });

  it("active + admin -> list + 'Tambah Peserta Didik' form + status form fields", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Peserta Didik" })
    ).toBeInTheDocument();
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();

    // create form fields present
    expect(screen.getByLabelText("Nama")).toBeInTheDocument();
    expect(screen.getByLabelText("NISN")).toBeInTheDocument();
    expect(screen.getByLabelText("NIS")).toBeInTheDocument();
    expect(screen.getByLabelText("Tanggal Lahir")).toBeInTheDocument();
    expect(screen.getByLabelText("Jenis Kelamin")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tambah Peserta Didik/i })
    ).toBeInTheDocument();

    // status form present (per-row)
    expect(
      screen.getByRole("button", { name: /Ubah Status/i })
    ).toBeInTheDocument();
    expect(mocks.listPesertaDidik).toHaveBeenCalledTimes(1);
  });

  it("active + admin + empty list -> 'Belum ada Peserta Didik.' empty state", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listPesertaDidik.mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText(/Belum ada Peserta Didik/i)).toBeInTheDocument();
  });
});
