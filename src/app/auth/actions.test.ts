import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const cookieStore = { get: vi.fn(), set: vi.fn() };
  return {
    withAuth: vi.fn(),
    listMembershipsForUser: vi.fn(),
    revalidatePath: vi.fn(),
    cookies: vi.fn().mockResolvedValue(cookieStore),
    cookieStore,
  };
});

const { withAuth, listMembershipsForUser, revalidatePath, cookieStore } =
  mocks;

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: mocks.withAuth,
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth/membership", () => ({
  listMembershipsForUser: mocks.listMembershipsForUser,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { pilihSatuanPendidikanAction } from "./actions";

function formData(obj: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  withAuth.mockReset();
  listMembershipsForUser.mockReset();
  cookieStore.set.mockReset();
  revalidatePath.mockReset();
});

describe("pilihSatuanPendidikanAction — tenant-injection guard (#4)", () => {
  it("rejects an org the user is NOT a member of (no cookie set)", async () => {
    withAuth.mockResolvedValue({ user: { id: "u1" } });
    listMembershipsForUser.mockResolvedValue([
      { orgId: "org_A", orgName: "A", roleSlug: "guru" },
    ]);

    await expect(
      pilihSatuanPendidikanAction(formData({ orgId: "org_TAMPERED" }))
    ).rejects.toThrow(/tidak valid/i);

    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("binds active tenant (httpOnly cookie) only for a real membership", async () => {
    withAuth.mockResolvedValue({ user: { id: "u1" } });
    listMembershipsForUser.mockResolvedValue([
      { orgId: "org_A", orgName: "A", roleSlug: "guru" },
      { orgId: "org_B", orgName: "B", roleSlug: "guru" },
    ]);

    await pilihSatuanPendidikanAction(formData({ orgId: "org_B" }));

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, opts] = cookieStore.set.mock.calls[0];
    expect(name).toBe("eapp_active_org");
    expect(value).toBe("org_B");
    expect(opts.httpOnly).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects when not authenticated", async () => {
    withAuth.mockResolvedValue({ user: null });
    await expect(
      pilihSatuanPendidikanAction(formData({ orgId: "org_A" }))
    ).rejects.toThrow(/terautentikasi/i);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
