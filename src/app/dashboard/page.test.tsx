import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getActiveTenantContext } = vi.hoisted(() => ({
  getActiveTenantContext: vi.fn(),
}));

// Stop transitive authkit/next server-module loads (resolvable only inside Next).
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
// Active branch hits an async DB-reading component; stub it sync so the page's
// branch selection (the behavior under test) is observable.
vi.mock("@/components/dashboard-aktif", () => ({
  DashboardAktif: ({ membership }: { membership: { orgName: string } }) => (
    <h1>{membership.orgName}</h1>
  ),
}));

vi.mock("@/lib/auth/server", () => ({
  getActiveTenantContext,
  ACTIVE_TENANT_COOKIE: "eapp_active_org",
  ACTIVE_TENANT_MAX_AGE: 2592000,
}));

import DashboardPage from "./page";

// Async server component: resolve the element tree before rendering.
async function renderPage() {
  const tree = await DashboardPage();
  return render(tree);
}

beforeEach(() => getActiveTenantContext.mockReset());

describe("DashboardPage — render by tenant context (#4)", () => {
  it("denied -> Pembatasan Akses message", async () => {
    getActiveTenantContext.mockResolvedValue({ status: "denied" });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
  });

  it("choose -> lists each membership as a selectable Satuan Pendidikan", async () => {
    getActiveTenantContext.mockResolvedValue({
      status: "choose",
      memberships: [
        { orgId: "org_A", orgName: "Sekolah A", roleSlug: "guru" },
        { orgId: "org_B", orgName: "Sekolah B", roleSlug: "kepala_sekolah" },
      ],
    });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pilih Satuan Pendidikan/i })
    ).toBeInTheDocument();
    // each org posts its id to the server action (cannot be client-injected)
    expect(screen.getByDisplayValue("org_A")).toBeInTheDocument();
    expect(screen.getByDisplayValue("org_B")).toBeInTheDocument();
  });

  it("active -> shows the active Satuan Pendidikan name", async () => {
    getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership: { orgId: "org_A", orgName: "SMP Negeri 1", roleSlug: "guru" },
    });
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /SMP Negeri 1/i })
    ).toBeInTheDocument();
  });
});
