import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- hoisted mocks ---------------------------------------------------------
// Mock at the SDK boundary: withAuth (WorkOS SDK) and cookies (next/headers).
// getWorkOS is mocked so listMembershipsForUser (called by getActiveTenantContext)
// can return controlled membership lists without hitting WorkOS or the DB.

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(),
  getWorkOS: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: mocks.withAuth,
  getWorkOS: mocks.getWorkOS,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

// Infrastructure mocks — prevent loading pg driver and seed module in jsdom.
vi.mock("@/db/client", () => ({
  getDb: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock("@/db/seed/tenant", () => ({
  DEMO_TENANTS: [],
}));

import {
  ACTIVE_TENANT_COOKIE,
  getActiveTenantContext,
  getAuthenticatedUserId,
  requireAuth,
} from "./server";

// --- helpers ---------------------------------------------------------------

/** Minimal fake WorkOS OrganizationMembership. */
interface FakeOrgMembership {
  status: "active" | "inactive" | "pending";
  organizationId: string;
  organizationName: string;
  role?: { slug?: string | null } | null;
}

/** Wire getWorkOS to return a fake client yielding the given memberships. */
function workosReturns(memberships: FakeOrgMembership[]): void {
  mocks.getWorkOS.mockReturnValue({
    userManagement: {
      listOrganizationMemberships: vi
        .fn()
        .mockResolvedValue({ data: memberships }),
    },
  });
}

/** Wire cookies() to return a cookie store with the given active-tenant value. */
function cookieStore(orgId: string | null): void {
  mocks.cookies.mockResolvedValue({
    get: (name: string) =>
      name === ACTIVE_TENANT_COOKIE && orgId
        ? { value: orgId }
        : undefined,
  });
}

/** Wire cookies() to return an empty cookie store (no active-tenant cookie). */
function noCookie(): void {
  mocks.cookies.mockResolvedValue({
    get: () => undefined,
  });
}

// Env stubs — vi.stubEnv bypasses the readonly modifier on NODE_ENV in @types/node.
beforeEach(() => {
  mocks.withAuth.mockReset();
  mocks.getWorkOS.mockReset();
  mocks.cookies.mockReset();
  vi.stubEnv("DEV_MEMBERSHIP_ALL", "");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ===========================================================================
// getActiveTenantContext — cookie + membership re-validation
//
// The stored cookie is re-validated against live WorkOS memberships on every
// call. A cookie pointing to a revoked/expired membership (no longer in the
// membership list) must NOT silently grant tenant access.
// ===========================================================================

describe("getActiveTenantContext — no session", () => {
  it("returns denied/authenticated=false when withAuth has no user", async () => {
    mocks.withAuth.mockResolvedValue({ user: null });
    noCookie();
    const ctx = await getActiveTenantContext();
    expect(ctx).toEqual({ status: "denied", authenticated: false });
  });

  it("does not call getWorkOS or cookies when unauthenticated", async () => {
    mocks.withAuth.mockResolvedValue({ user: null });
    noCookie();
    await getActiveTenantContext();
    expect(mocks.getWorkOS).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
});

describe("getActiveTenantContext — single membership (auto-select)", () => {
  it("auto-selects the single active membership without needing a cookie", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah AUT A",
        role: { slug: "guru" },
      },
    ]);
    noCookie();

    const ctx = await getActiveTenantContext();
    expect(ctx.status).toBe("active");
    if (ctx.status !== "active") return;
    expect(ctx.membership.orgId).toBe("org_AUT_a");
    expect(ctx.membership.roleSlug).toBe("guru");
  });
});

describe("getActiveTenantContext — multiple memberships + cookie re-validation", () => {
  const twoMemberships: FakeOrgMembership[] = [
    {
      status: "active",
      organizationId: "org_AUT_a",
      organizationName: "Sekolah AUT A",
      role: { slug: "guru" },
    },
    {
      status: "active",
      organizationId: "org_AUT_b",
      organizationName: "Sekolah AUT B",
      role: { slug: "admin_satuan_pendidikan" },
    },
  ];

  it("valid cookie -> active (selects the matching membership)", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    workosReturns(twoMemberships);
    cookieStore("org_AUT_b");

    const ctx = await getActiveTenantContext();
    expect(ctx.status).toBe("active");
    if (ctx.status !== "active") return;
    expect(ctx.membership.orgId).toBe("org_AUT_b");
    expect(ctx.membership.roleSlug).toBe("admin_satuan_pendidikan");
  });

  it("cookie pointing to a REVOKED membership (no longer in list) -> choose", async () => {
    // The cookie says org_AUT_c, but the user's memberships are only A and B.
    // This simulates a revoked/expired membership — the stored choice is
    // re-validated and must NOT silently grant access to a stale tenant.
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    workosReturns(twoMemberships);
    cookieStore("org_AUT_c_revoked");

    const ctx = await getActiveTenantContext();
    expect(ctx.status).toBe("choose");
    if (ctx.status !== "choose") return;
    expect(ctx.memberships).toHaveLength(2);
  });

  it("no cookie with multiple memberships -> choose", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    workosReturns(twoMemberships);
    noCookie();

    const ctx = await getActiveTenantContext();
    expect(ctx.status).toBe("choose");
    if (ctx.status !== "choose") return;
    expect(ctx.memberships).toHaveLength(2);
  });

  it("cookie pointing to org_AUT_a -> active with org_AUT_a", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    workosReturns(twoMemberships);
    cookieStore("org_AUT_a");

    const ctx = await getActiveTenantContext();
    expect(ctx.status).toBe("active");
    if (ctx.status !== "active") return;
    expect(ctx.membership.orgId).toBe("org_AUT_a");
  });
});

describe("getActiveTenantContext — no memberships", () => {
  it("authenticated but zero memberships -> denied/authenticated=true", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    workosReturns([]);
    noCookie();

    const ctx = await getActiveTenantContext();
    expect(ctx).toEqual({ status: "denied", authenticated: true });
  });

  it("authenticated, zero memberships, stale cookie -> still denied (cookie is ignored)", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    workosReturns([]);
    cookieStore("org_AUT_a");

    const ctx = await getActiveTenantContext();
    expect(ctx).toEqual({ status: "denied", authenticated: true });
  });
});

describe("getActiveTenantContext — inactive memberships are filtered", () => {
  it("only active memberships count; all-inactive -> denied/authenticated=true", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    workosReturns([
      {
        status: "inactive",
        organizationId: "org_AUT_a",
        organizationName: "A",
        role: { slug: "guru" },
      },
    ]);
    noCookie();

    const ctx = await getActiveTenantContext();
    expect(ctx).toEqual({ status: "denied", authenticated: true });
  });
});

// ===========================================================================
// requireAuth — authentication gate
// ===========================================================================

describe("requireAuth", () => {
  it("throws 'Belum terautentikasi.' when unauthenticated", async () => {
    mocks.withAuth.mockResolvedValue({ user: null });
    await expect(requireAuth()).rejects.toThrow(/Belum terautentikasi/i);
  });

  it("returns { userId } when authenticated", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT_42" } });
    const result = await requireAuth();
    expect(result).toEqual({ userId: "u_AUT_42" });
  });

  it("does not call getWorkOS or cookies (session-only check)", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    await requireAuth();
    expect(mocks.getWorkOS).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// getAuthenticatedUserId — session-only escape hatch
// ===========================================================================

describe("getAuthenticatedUserId", () => {
  it("returns userId when authenticated", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT_99" } });
    expect(await getAuthenticatedUserId()).toBe("u_AUT_99");
  });

  it("returns null when unauthenticated (does NOT throw)", async () => {
    mocks.withAuth.mockResolvedValue({ user: null });
    expect(await getAuthenticatedUserId()).toBe(null);
  });

  it("does not call getWorkOS or cookies (session-only check)", async () => {
    mocks.withAuth.mockResolvedValue({ user: { id: "u_AUT" } });
    await getAuthenticatedUserId();
    expect(mocks.getWorkOS).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
});
