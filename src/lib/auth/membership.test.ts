import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- hoisted mocks ---------------------------------------------------------
// Mock at the SDK boundary: getWorkOS (WorkOS SDK) and getDb (DB client).
// safeRoleSlug is module-private, so we test it indirectly through
// listMembershipsForUser → WorkOSMembershipProvider.listForUser, which calls
// safeRoleSlug(membership.role?.slug) on each WorkOS OrganizationMembership.

const mocks = vi.hoisted(() => ({
  getWorkOS: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: mocks.getWorkOS,
}));

vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/db/seed/tenant", () => ({
  DEMO_TENANTS: [
    { id: "org_AUT_a", nama: "Sekolah AUT A" },
    { id: "org_AUT_b", nama: "Sekolah AUT B" },
  ],
}));

import { listMembershipsForUser, membershipProvider } from "./membership";

// --- helpers ---------------------------------------------------------------

/** Minimal fake WorkOS OrganizationMembership (only fields the provider reads). */
interface FakeOrgMembership {
  status: "active" | "inactive" | "pending";
  organizationId: string;
  organizationName: string;
  role?: { slug?: string | null } | null;
}

/** Wire mocks.getWorkOS to return a fake client yielding the given memberships. */
function workosReturns(memberships: FakeOrgMembership[]): void {
  mocks.getWorkOS.mockReturnValue({
    userManagement: {
      listOrganizationMemberships: vi
        .fn()
        .mockResolvedValue({ data: memberships }),
    },
  });
}

/** Wire mocks.getDb to return a fake db whose select chain returns the rows. */
function dbReturnsSatuan(rows: { id: string; nama: string }[]): void {
  mocks.getDb.mockReturnValue({
    db: {
      select: () => ({
        from: () => ({
          where: async () => rows,
        }),
      }),
    },
  });
}

// Env stubs — DEV_MEMBERSHIP_ALL and NODE_ENV drive provider switch.
// vi.stubEnv bypasses the readonly modifier on NODE_ENV in @types/node.
beforeEach(() => {
  mocks.getWorkOS.mockReset();
  mocks.getDb.mockReset();
  vi.stubEnv("DEV_MEMBERSHIP_ALL", "");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ===========================================================================
// safeRoleSlug (tested via WorkOSMembershipProvider.listForUser)
//
// safeRoleSlug is the single defense vs an unknown WorkOS roleSlug silently
// granting admin. If it breaks, no other test catches it. These tests are the
// guardrail.
// ===========================================================================

describe("safeRoleSlug — unknown slug narrows to 'guru' (least-privilege)", () => {
  it("unknown role slug ('superuser') -> 'guru' fallback", async () => {
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah A",
        role: { slug: "superuser" }, // NOT in KNOWN_ROLES
      },
    ]);
    const result = await listMembershipsForUser("u_AUT");
    expect(result).toHaveLength(1);
    expect(result[0]!.roleSlug).toBe("guru");
  });

  it("null role.slug -> 'guru' fallback", async () => {
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah A",
        role: { slug: null },
      },
    ]);
    const result = await listMembershipsForUser("u_AUT");
    expect(result[0]!.roleSlug).toBe("guru");
  });

  it("missing role object -> 'guru' fallback", async () => {
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah A",
        role: undefined,
      },
    ]);
    const result = await listMembershipsForUser("u_AUT");
    expect(result[0]!.roleSlug).toBe("guru");
  });

  it("empty-string slug -> 'guru' fallback", async () => {
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah A",
        role: { slug: "" },
      },
    ]);
    const result = await listMembershipsForUser("u_AUT");
    expect(result[0]!.roleSlug).toBe("guru");
  });
});

describe("safeRoleSlug — dev slug guard (ADR-0004 D1, belt-to-suspenders)", () => {
  it("dev slug on a WorkOS membership is REJECTED when DEV_MEMBERSHIP_ALL is unset", async () => {
    vi.stubEnv("DEV_MEMBERSHIP_ALL", "");
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah A",
        role: { slug: "dev" },
      },
    ]);
    await expect(listMembershipsForUser("u_AUT")).rejects.toThrow(
      /dev.*ditolak/i,
    );
  });

  it("dev slug is REJECTED when DEV_MEMBERSHIP_ALL is explicitly 'false'", async () => {
    vi.stubEnv("DEV_MEMBERSHIP_ALL", "false");
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah A",
        role: { slug: "dev" },
      },
    ]);
    await expect(listMembershipsForUser("u_AUT")).rejects.toThrow(
      /dev.*ditolak/i,
    );
  });
});

describe("safeRoleSlug — valid known slugs pass through", () => {
  it.each([
    "admin_satuan_pendidikan",
    "guru",
    "wali_kelas",
    "kepala_sekolah",
  ])("role.slug='%s' passes through unchanged", async (slug) => {
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah A",
        role: { slug },
      },
    ]);
    const result = await listMembershipsForUser("u_AUT");
    expect(result[0]!.roleSlug).toBe(slug);
  });

  it("multiple memberships with mixed valid slugs all pass through", async () => {
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah A",
        role: { slug: "admin_satuan_pendidikan" },
      },
      {
        status: "active",
        organizationId: "org_AUT_b",
        organizationName: "Sekolah B",
        role: { slug: "guru" },
      },
    ]);
    const result = await listMembershipsForUser("u_AUT");
    expect(result).toHaveLength(2);
    expect(result[0]!.roleSlug).toBe("admin_satuan_pendidikan");
    expect(result[1]!.roleSlug).toBe("guru");
  });
});

// ===========================================================================
// WorkOSMembershipProvider — active-status filter
// ===========================================================================

describe("WorkOSMembershipProvider — active-status filter", () => {
  it("only status='active' memberships are returned; inactive/pending filtered", async () => {
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah A",
        role: { slug: "guru" },
      },
      {
        status: "inactive",
        organizationId: "org_AUT_b",
        organizationName: "Sekolah B",
        role: { slug: "guru" },
      },
      {
        status: "pending",
        organizationId: "org_AUT_c",
        organizationName: "Sekolah C",
        role: { slug: "admin_satuan_pendidikan" },
      },
    ]);
    const result = await listMembershipsForUser("u_AUT");
    expect(result).toHaveLength(1);
    expect(result[0]!.orgId).toBe("org_AUT_a");
  });

  it("zero active memberships -> empty array", async () => {
    workosReturns([
      {
        status: "inactive",
        organizationId: "org_AUT_a",
        organizationName: "A",
        role: { slug: "guru" },
      },
    ]);
    const result = await listMembershipsForUser("u_AUT");
    expect(result).toHaveLength(0);
  });

  it("passes userId to WorkOS listOrganizationMemberships", async () => {
    const listFn = vi.fn().mockResolvedValue({ data: [] });
    mocks.getWorkOS.mockReturnValue({
      userManagement: { listOrganizationMemberships: listFn },
    });
    await listMembershipsForUser("user_AUT_123");
    expect(listFn).toHaveBeenCalledWith({ userId: "user_AUT_123" });
  });

  it("maps orgId and orgName from WorkOS membership fields", async () => {
    workosReturns([
      {
        status: "active",
        organizationId: "org_AUT_a",
        organizationName: "Sekolah AUT A",
        role: { slug: "guru" },
      },
    ]);
    const result = await listMembershipsForUser("u_AUT");
    expect(result[0]!.orgId).toBe("org_AUT_a");
    expect(result[0]!.orgName).toBe("Sekolah AUT A");
  });
});

// ===========================================================================
// DevMembershipProvider — prod guard + dev shim behavior
// ===========================================================================

describe("DevMembershipProvider — dev shim behavior", () => {
  it("returns roleSlug='dev' for all DEMO_TENANTS when DEV_MEMBERSHIP_ALL=true", async () => {
    vi.stubEnv("DEV_MEMBERSHIP_ALL", "true");
    vi.stubEnv("NODE_ENV", "test");
    dbReturnsSatuan([
      { id: "org_AUT_a", nama: "Sekolah AUT A" },
      { id: "org_AUT_b", nama: "Sekolah AUT B" },
    ]);

    const result = await listMembershipsForUser("u_AUT");
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.roleSlug === "dev")).toBe(true);
    expect(result[0]!.orgId).toBe("org_AUT_a");
    expect(result[0]!.orgName).toBe("Sekolah AUT A");
  });

  it("does not call getWorkOS (dev shim bypasses WorkOS entirely)", async () => {
    vi.stubEnv("DEV_MEMBERSHIP_ALL", "true");
    vi.stubEnv("NODE_ENV", "test");
    dbReturnsSatuan([{ id: "org_AUT_a", nama: "Sekolah AUT A" }]);

    await listMembershipsForUser("u_AUT");
    expect(mocks.getWorkOS).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// membershipProvider() — switch logic
// ===========================================================================

describe("membershipProvider() — switch logic", () => {
  it("returns WorkOSMembershipProvider when DEV_MEMBERSHIP_ALL is unset", async () => {
    vi.stubEnv("DEV_MEMBERSHIP_ALL", "");
    workosReturns([]);
    const provider = membershipProvider();
    await provider.listForUser("u_AUT");
    expect(mocks.getWorkOS).toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns DevMembershipProvider when DEV_MEMBERSHIP_ALL=true and non-prod", async () => {
    vi.stubEnv("DEV_MEMBERSHIP_ALL", "true");
    vi.stubEnv("NODE_ENV", "test");
    dbReturnsSatuan([{ id: "org_AUT_a", nama: "Sekolah AUT A" }]);
    const provider = membershipProvider();
    await provider.listForUser("u_AUT");
    expect(mocks.getDb).toHaveBeenCalled();
    expect(mocks.getWorkOS).not.toHaveBeenCalled();
  });

  it("THROWS when DEV_MEMBERSHIP_ALL=true AND NODE_ENV=production", () => {
    vi.stubEnv("DEV_MEMBERSHIP_ALL", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => membershipProvider()).toThrow(
      /DEV_MEMBERSHIP_ALL.*produksi/i,
    );
  });

  it("does NOT throw when DEV_MEMBERSHIP_ALL is unset even in production", () => {
    vi.stubEnv("DEV_MEMBERSHIP_ALL", "");
    vi.stubEnv("NODE_ENV", "production");
    workosReturns([]);
    expect(() => membershipProvider()).not.toThrow();
  });

  it("listMembershipsForUser propagates the prod-guard throw", async () => {
    vi.stubEnv("DEV_MEMBERSHIP_ALL", "true");
    vi.stubEnv("NODE_ENV", "production");
    await expect(listMembershipsForUser("u_AUT")).rejects.toThrow(
      /DEV_MEMBERSHIP_ALL.*produksi/i,
    );
  });
});
