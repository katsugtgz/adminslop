import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => ({ db: {} })),
  withTenant: vi.fn(async (_db, _id, fn) => fn({})),
}));

import { DashboardAktif } from "./dashboard-aktif";
import type { Membership } from "@/lib/auth/server";

const adminMembership: Membership = {
  orgId: "org_A",
  orgName: "SMP Negeri 1",
  roleSlug: "admin_satuan_pendidikan",
};
const guruMembership: Membership = {
  orgId: "org_A",
  orgName: "SMP Negeri 1",
  roleSlug: "guru",
};
const devMembership: Membership = {
  orgId: "org_A",
  orgName: "SMP Negeri 1",
  roleSlug: "dev",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardAktif — Pengaturan nav link (#5)", () => {
  it("admin_satuan_pendidikan -> shows Pengaturan Sekolah link", async () => {
    const tree = await DashboardAktif({ membership: adminMembership });
    render(tree);
    expect(
      screen.getByRole("link", { name: /Pengaturan Sekolah/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pengaturan Sekolah/i })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan"
    );
  });

  it("dev (admin-equivalent) -> shows Pengaturan Sekolah link", async () => {
    const tree = await DashboardAktif({ membership: devMembership });
    render(tree);
    expect(
      screen.getByRole("link", { name: /Pengaturan Sekolah/i })
    ).toBeInTheDocument();
  });

  it("guru -> does NOT show Pengaturan Sekolah link (read-only via direct URL)", async () => {
    const tree = await DashboardAktif({ membership: guruMembership });
    render(tree);
    expect(
      screen.queryByRole("link", { name: /Pengaturan Sekolah/i })
    ).not.toBeInTheDocument();
  });

  it("still shows active Satuan Pendidikan name regardless of role", async () => {
    const tree = await DashboardAktif({ membership: guruMembership });
    render(tree);
    expect(
      screen.getByRole("heading", { name: /SMP Negeri 1/i })
    ).toBeInTheDocument();
  });
});
