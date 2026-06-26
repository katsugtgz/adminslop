import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { PenggunaDenganPtk } from "@/db/queries/akses";
import type { Ptk } from "@/db/schema";

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
    listPtk: vi.fn(async () => [] as Ptk[]),
    listPengguna: vi.fn(async () => [] as PenggunaDenganPtk[]),
    loadAksesPengguna: vi.fn(
      async (): Promise<{ izin: string[]; pembatasan: string[] }> => ({
        izin: [],
        pembatasan: [],
      })
    ),
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
vi.mock("@/db/queries/akses", () => ({
  listPtk: mocks.listPtk,
  listPengguna: mocks.listPengguna,
  loadAksesPengguna: mocks.loadAksesPengguna,
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

/**
 * Build an "active" AksesSaya whose `boleh()` mirrors the REAL evaluasiAkses
 * precedence (pembatasan > izin > peran default).
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "ptk:baca",
      "ptk:buat",
      "ptk:hapus",
      "akses:kelola",
      "akses:baca",
    ],
    dev: ["ptk:baca", "ptk:buat", "ptk:hapus", "akses:kelola", "akses:baca"],
    kepala_sekolah: ["akses:baca"],
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

const PTK_BUDI: Ptk = {
  id: "ptk_1",
  tenantId: "org_A",
  nama: "Budi",
  nip: "123",
  jenis: "pendidik",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

const PENGGUNA_SATU: PenggunaDenganPtk = {
  id: "pg_1",
  tenantId: "org_A",
  userId: "workos_u_1",
  peranAkses: "guru",
  ptkId: "ptk_1",
  nama: "Pengguna Satu",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
  ptk: PTK_BUDI,
};

async function renderPage() {
  const tree = await Page();
  return render(tree);
}

beforeEach(() => {
  mocks.getAksesSaya.mockReset();
  mocks.getDb.mockReset();
  mocks.withTenant.mockReset();
  mocks.listPtk.mockReset();
  mocks.listPengguna.mockReset();
  mocks.loadAksesPengguna.mockReset();
  // restore default implementations
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(
    async (_db, _tenantId, fn) => fn(mocks.fakeTx)
  );
  mocks.listPtk.mockResolvedValue([PTK_BUDI]);
  mocks.listPengguna.mockResolvedValue([PENGGUNA_SATU]);
  mocks.loadAksesPengguna.mockResolvedValue({
    izin: ["ptk:baca"],
    pembatasan: [],
  });
});

describe("AksesPage — render by akses context (#6 / T6)", () => {
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

  it("active + admin -> full management (Tambah PTK, Hapus, izin + pembatasan checkboxes)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Manajemen Akses" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tambah PTK/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Hapus/i })).toHaveLength(1);
    expect(screen.getAllByRole("checkbox")).toHaveLength(54);
    expect(mocks.listPtk).toHaveBeenCalledTimes(1);
    expect(mocks.loadAksesPengguna).toHaveBeenCalledTimes(1);
  });

  it("active + kepala_sekolah -> read-only lists (no forms, no checkboxes)", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    await renderPage();

    // lists ARE shown
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByText("Pengguna Satu")).toBeInTheDocument();
    // no management surface
    expect(
      screen.queryByRole("button", { name: /Tambah PTK/i })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Hapus/i })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    // read-only viewers never load the per-pengguna akses matrix
    expect(mocks.loadAksesPengguna).not.toHaveBeenCalled();
  });

  it("active + guru (no akses:baca) -> Pembatasan Akses, no PTK data leaks", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await renderPage();

    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    // listPtk is NEVER called (page bails before getDb)
    expect(mocks.listPtk).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(screen.queryByText("Budi")).toBeNull();
  });

  it("active + admin with empty lists -> empty states", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listPtk.mockResolvedValue([]);
    mocks.listPengguna.mockResolvedValue([]);
    await renderPage();

    expect(screen.getByText(/Belum ada PTK/i)).toBeInTheDocument();
    expect(screen.getByText(/Belum ada Pengguna/i)).toBeInTheDocument();
  });
});
