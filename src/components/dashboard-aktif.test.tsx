import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub the DB layer so the component's optional DB read falls into its catch
// branch (jumlahCatatan = null). The link visibility under test does not depend
// on DB state.
vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => {
    throw new Error("no db in test");
  }),
  withTenant: vi.fn(),
}));
vi.mock("@/db/schema", () => ({ contohCatatan: {} }));

import { DashboardAktif } from "./dashboard-aktif";
import type { Membership } from "@/lib/auth/server";

function membershipFor(roleSlug: Membership["roleSlug"]): Membership {
  return { orgId: "org_A", orgName: "SMP Negeri 1", roleSlug };
}

async function renderAktif(roleSlug: Membership["roleSlug"]) {
  const tree = await DashboardAktif({ membership: membershipFor(roleSlug) });
  return render(tree);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardAktif — Pengaturan nav link (#5)", () => {
  it("admin_satuan_pendidikan -> shows Pengaturan Sekolah link", async () => {
    await renderAktif("admin_satuan_pendidikan");
    expect(
      screen.getByRole("link", { name: /Pengaturan Sekolah/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pengaturan Sekolah/i })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan"
    );
  });

  it("dev (admin-equivalent) -> shows Pengaturan Sekolah link", async () => {
    await renderAktif("dev");
    expect(
      screen.getByRole("link", { name: /Pengaturan Sekolah/i })
    ).toBeInTheDocument();
  });

  it("guru -> does NOT show Pengaturan Sekolah link (read-only via direct URL)", async () => {
    await renderAktif("guru");
    expect(
      screen.queryByRole("link", { name: /Pengaturan Sekolah/i })
    ).not.toBeInTheDocument();
  });

  it("still shows active Satuan Pendidikan name regardless of role", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("heading", { name: /SMP Negeri 1/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Akses reachability link (#6 / T6)", () => {
  it("admin sees the 'Manajemen Akses' link pointing at /dashboard/akses", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Manajemen Akses/i });
    expect(link.getAttribute("href")).toBe("/dashboard/akses");
  });

  it("kepala_sekolah sees the link (read-only viewer)", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Manajemen Akses/i })
    ).toBeInTheDocument();
  });

  it("guru does NOT see the link", async () => {
    await renderAktif("guru");
    expect(
      screen.queryByRole("link", { name: /Manajemen Akses/i })
    ).toBeNull();
  });

  it("wali_kelas does NOT see the link", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.queryByRole("link", { name: /Manajemen Akses/i })
    ).toBeNull();
  });
});

describe("DashboardAktif — Rombongan Belajar reachability link (#8)", () => {
  it("admin sees the 'Rombongan Belajar' link pointing at /dashboard/rombongan-belajar", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Rombongan Belajar/i });
    expect(link.getAttribute("href")).toBe("/dashboard/rombongan-belajar");
  });

  it("guru sees the link (core teaching data)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Rombongan Belajar/i })
    ).toBeInTheDocument();
  });

  it("kepala_sekolah sees the link", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Rombongan Belajar/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Tahun Ajaran reachability link (#8)", () => {
  it("admin sees the 'Tahun Ajaran' link pointing at /dashboard/tahun-ajaran", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Tahun Ajaran/i });
    expect(link.getAttribute("href")).toBe("/dashboard/tahun-ajaran");
  });

  it("kepala_sekolah sees the link", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Tahun Ajaran/i })
    ).toBeInTheDocument();
  });

  it("guru does NOT see the link", async () => {
    await renderAktif("guru");
    expect(
      screen.queryByRole("link", { name: /Tahun Ajaran/i })
    ).toBeNull();
  });
});

describe("DashboardAktif — Kurikulum reachability link (#9)", () => {
  // Every member role receives `kurikulum:baca` by default (curriculum is
  // universal read-only reference data), so ALL member roles see the link.
  it("admin sees the 'Kurikulum' link pointing at /dashboard/kurikulum", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Kurikulum/i });
    expect(link.getAttribute("href")).toBe("/dashboard/kurikulum");
  });

  it("guru sees the link (core teaching reference)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Kurikulum/i })
    ).toBeInTheDocument();
  });

  it("kepala_sekolah sees the link", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Kurikulum/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas sees the link", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.getByRole("link", { name: /Kurikulum/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Permintaan AI reachability link (#12)", () => {
  // All member roles receive `permintaan_ai:baca` by default, so ALL member
  // roles see the link. The page re-checks server-side (§12) and applies
  // AC#3 DUAL authz (verification gate) for draf_ai writes.
  it("admin sees the 'Permintaan AI' link pointing at /dashboard/permintaan-ai", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Permintaan AI/i });
    expect(link.getAttribute("href")).toBe("/dashboard/permintaan-ai");
  });

  it("guru sees the link (can create AI requests)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Permintaan AI/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas sees the link (read-only access)", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.getByRole("link", { name: /Permintaan AI/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Absensi reachability link (#15)", () => {
  // Every member role receives `absensi:baca` (daily attendance is core
  // teaching data; kepala_sekolah reads for oversight), so ALL member roles
  // see the link.
  it("admin sees the 'Absensi Harian' link pointing at /dashboard/absensi", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Absensi Harian/i });
    expect(link.getAttribute("href")).toBe("/dashboard/absensi");
  });

  it("guru sees the link (marks daily attendance for their classes)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Absensi Harian/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas sees the link (homeroom oversight)", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.getByRole("link", { name: /Absensi Harian/i })
    ).toBeInTheDocument();
  });

  it("kepala_sekolah sees the link (school-wide oversight)", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Absensi Harian/i })
    ).toBeInTheDocument();
  });
});
