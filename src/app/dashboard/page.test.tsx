import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getActiveTenantContext, getAuthenticatedUserId } = vi.hoisted(() => ({
  getActiveTenantContext: vi.fn(),
  getAuthenticatedUserId: vi.fn(),
}));

// Stop transitive authkit/next server-module loads (resolvable only inside Next).
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
  signOut: vi.fn(),
}));
// TombolMasuk is a client component that calls the AuthKit client hook; stub
// it so the server-component page renders without a provider.
vi.mock("@/components/akses/tombol-masuk", () => ({
  TombolMasuk: () => <button type="button">Masuk</button>,
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
  getAuthenticatedUserId,
  ACTIVE_TENANT_COOKIE: "eapp_active_org",
  ACTIVE_TENANT_MAX_AGE: 2592000,
}));

import DashboardPage from "./page";

// Async server component: resolve the element tree before rendering.
async function renderPage() {
  const tree = await DashboardPage();
  return render(tree);
}

beforeEach(() => {
  getActiveTenantContext.mockReset();
  getAuthenticatedUserId.mockReset();
});

describe("DashboardPage — render by tenant context (#4)", () => {
  it("denied (unauthenticated) -> Pembatasan Akses with a Masuk affordance", async () => {
    getActiveTenantContext.mockResolvedValue({ status: "denied" });
    // No session server-side -> the page must surface a login action.
    getAuthenticatedUserId.mockResolvedValue(null);
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /masuk/i })).toBeInTheDocument();
  });

  it("denied (authenticated, no membership) -> Pembatasan Akses with Keluar", async () => {
    getActiveTenantContext.mockResolvedValue({ status: "denied" });
    getAuthenticatedUserId.mockResolvedValue("user_123");
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^keluar$/i })).toBeInTheDocument();
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
