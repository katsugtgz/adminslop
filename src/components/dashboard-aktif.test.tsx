import { describe, expect, it, vi } from "vitest";
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
