import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { PesertaDidik } from "@/db/schema";
import { formatEksporCsv } from "@/lib/impor/validasi-peserta-didik";

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

// ===========================================================================
// H. Ekspor tenant tamper-proofing — Task 12 verification (issue #18 / PR #43).
//
// The export is rendered as a server-generated `data:text/csv` URI on a React
// Server Component — there is NO parameterized HTTP export endpoint, hence no
// client-visible attack surface for cross-tenant access via query/form bodies.
// The tenant id used to scope the export read comes ONLY from
// `akses.membership.orgId` (the live WorkOS Keanggotaan via getAksesSaya), and
// the read itself runs inside `withTenant(db, orgId, ...)` so RLS re-checks at
// the DB layer. AC#4 (export tenant scope) is enforced by 3 independent layers:
//   (i)   page-source: no formData/searchParams/cookie-supplied tenant read;
//   (ii)  runtime: withTenant called with membership.orgId only (this block);
//   (iii) DB/RLS:  listPesertaDidik is tenant-isolated
//                  (src/db/queries/peserta-didik.test.ts test #8).
//
// These tests mirror the action-level "E. tenant tamper-proofing" block
// (actions.test.ts §E — bogus formData tenantId ignored on import) but cover
// the export path. Together they close the loop on identity doc §13
// ("tenant id never client-supplied") for the whole /dashboard/impor-peserta-didik
// surface.
// ===========================================================================

describe("H. ekspor tenant tamper-proofing (#18 AC#4, Task 12)", () => {
  it("withTenant is called exactly once with membership.orgId — never any other tenant", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    await renderPage();

    // export read runs inside withTenant exactly once (no other tenant reads).
    expect(mocks.withTenant).toHaveBeenCalledTimes(1);
    const tenantIdsCalled = mocks.withTenant.mock.calls.map((c) => c[1]);
    expect(tenantIdsCalled).toEqual(["org_A"]);
    // The page has no path to other tenants — assert the negation explicitly.
    expect(tenantIdsCalled).not.toContain("org_B");
    expect(tenantIdsCalled).not.toContain("org_VICTIM");
  });

  it("export CSV body equals formatEksporCsv(listPesertaDidik) — page is a pure conduit", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    // Tenant A returns exactly these two rows (the RLS-isolated view).
    const tenantA: PesertaDidik[] = [
      PD_BUDI,
      {
        ...PD_BUDI,
        id: "pd_2",
        nama: "Siti Aminah",
        nisn: "87654321",
        nis: null,
        tanggalLahir: "2011-03-20",
        jenisKelamin: "P",
      },
    ];
    mocks.listPesertaDidik.mockResolvedValue(tenantA);
    const expectedBody = formatEksporCsv(tenantA);

    await renderPage();

    const exp = screen.getByRole("link", { name: /Unduh Ekspor/i });
    const href = exp.getAttribute("href") ?? "";
    const decoded = decodeURIComponent(
      href.replace(/^data:text\/csv;charset=utf-8,/, "")
    );
    // The page is a pure conduit between the tenant-scoped query and the CSV
    // body — no extra rows, no omissions, no transformation beyond encodeURIComponent.
    expect(decoded).toBe(expectedBody);
  });

  it("NEGATIVE: victim tenant's name cannot appear in export when listPesertaDidik omits it", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    // listPesertaDidik returns ONLY tenant A's Budi — this mirrors what RLS
    // would return for org_A even if tenant B's rows exist in the table
    // (proven by src/db/queries/peserta-didik.test.ts test #8 at the DB layer).
    mocks.listPesertaDidik.mockResolvedValue([PD_BUDI]);

    await renderPage();

    const exp = screen.getByRole("link", { name: /Unduh Ekspor/i });
    const href = exp.getAttribute("href") ?? "";
    const decoded = decodeURIComponent(
      href.replace(/^data:text\/csv;charset=utf-8,/, "")
    );
    // Active tenant row is present.
    expect(decoded).toContain("Budi Santoso");
    // Victim tenant rows are absent — the page has no path to them (no formData,
    // no searchParams, no client-supplied tenant id; CSV body is a pure function
    // of the RLS-scoped listPesertaDidik result).
    expect(decoded).not.toContain("Victim From OrgB");
    expect(decoded).not.toContain("org_B");
    expect(decoded).not.toContain("org_VICTIM");
  });

  it("happy-path evidence capture: decoded CSV body is a valid tenant-scoped export", async () => {
    mocks.getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    mocks.listPesertaDidik.mockResolvedValue([PD_BUDI]);
    await renderPage();

    const exp = screen.getByRole("link", { name: /Unduh Ekspor/i });
    const href = exp.getAttribute("href") ?? "";
    const decoded = decodeURIComponent(
      href.replace(/^data:text\/csv;charset=utf-8,/, "")
    );

    // Structural assertions: canonical header + exactly the rows listPesertaDidik
    // returned — no extras, no tenant id column leaked into the body.
    expect(decoded.startsWith("nama,nisn,nis,tanggalLahir,jenisKelamin\n")).toBe(true);
    const dataLines = decoded.split("\n").filter((l) => l.trim() !== "");
    expect(dataLines).toHaveLength(2); // header + 1 tenant row
    expect(decoded).toContain("Budi Santoso");
    // No tenant_id column in the export schema — confirms formatEksporCsv does
    // not leak the internal tenant identifier.
    expect(decoded.toLowerCase()).not.toContain("tenant");
    // No column beyond the 5 canonical KOLOM_CSV fields.
    expect(dataLines[0].split(",")).toHaveLength(5);
  });
});
