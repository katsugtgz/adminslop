import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Render tests for the Onboarding route (identity doc §14). The page is a thin
 * server component whose branches are:
 *   - no session / has memberships -> redirect("/dashboard") (defended by
 *     AuthKit middleware in production),
 *   - authenticated + zero memberships -> the onboarding form surface.
 *
 * `redirect()` throws NEXT_REDIRECT; the mock throws a sentinel so the redirect
 * branches can be detected without aborting the test runner.
 */

const REDIRECT_SENTINEL = Symbol("redirect");

const mocks = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  listMembershipsForUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw { __redirect: path, sentinel: REDIRECT_SENTINEL };
  }),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
  getWorkOS: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/server", () => ({
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));
vi.mock("@/lib/auth/membership", () => ({
  listMembershipsForUser: mocks.listMembershipsForUser,
}));

import Page from "./page";

beforeEach(() => {
  mocks.getAuthenticatedUserId.mockReset();
  mocks.listMembershipsForUser.mockReset();
  mocks.redirect.mockReset();
  mocks.redirect.mockImplementation((path: string) => {
    throw { __redirect: path, sentinel: REDIRECT_SENTINEL };
  });
});

describe("OnboardingPage — render states (§14)", () => {
  it("no session -> redirect('/dashboard')", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue(null);

    await expect(Page()).rejects.toMatchObject({
      __redirect: "/dashboard",
      sentinel: REDIRECT_SENTINEL,
    });
  });

  it("has existing membership -> redirect('/dashboard')", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue("workos_u_1");
    mocks.listMembershipsForUser.mockResolvedValue([
      { orgId: "org_A", orgName: "Sekolah A", roleSlug: "guru" },
    ]);

    await expect(Page()).rejects.toMatchObject({
      __redirect: "/dashboard",
      sentinel: REDIRECT_SENTINEL,
    });
  });

  it("authenticated + zero memberships -> renders onboarding form", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue("workos_u_1");
    mocks.listMembershipsForUser.mockResolvedValue([]);

    const tree = await Page();
    render(tree);

    expect(
      screen.getByRole("heading", { name: "Buat Satuan Pendidikan" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Nama Satuan Pendidikan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Jenjang/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Buat Satuan Pendidikan/i }),
    ).toBeInTheDocument();
  });

  it("renders all seven jenjang options (incl. Madrasah)", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue("workos_u_1");
    mocks.listMembershipsForUser.mockResolvedValue([]);

    render(await Page());

    for (const jenjang of ["SD", "MI", "SMP", "MTs", "SMA", "SMK", "MA"]) {
      const option = screen.queryByRole("option", { name: new RegExp(`^${jenjang}($|\\s)`) });
      expect(option).not.toBeNull();
    }
  });
});
