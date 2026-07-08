import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the Onboarding Satuan Pendidikan server action (identity
 * doc §14, Phase 2 self-service provisioning).
 *
 * The action is the provisioning boundary; it must
 *   - require authentication (never run anonymous),
 *   - reject a Pengguna who already holds a Keanggotaan (onboarding is once),
 *   - validate the payload with zod BEFORE any WorkOS/DB call,
 *   - create the WorkOS Organization first (it mints the tenant id),
 *   - create the membership, then mirror both into the app DB inside withTenant,
 *   - set the active-tenant cookie and redirect to /dashboard on success.
 *
 * `redirect()` throws NEXT_REDIRECT internally; the mock throws a sentinel so
 * happy-path assertions can detect the redirect without aborting the test.
 */

const REDIRECT_SENTINEL = Symbol("redirect");

/** Stable table sentinels so the tx.insert mock can route by identity. */
const TABLES = vi.hoisted(() => ({
  satuan: Symbol("satuan_pendidikan"),
  pengguna: Symbol("pengguna"),
}));

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => ({ userId: "workos_u_1" })),
  withAuth: vi.fn(),
  listMembershipsForUser: vi.fn(),
  getWorkOS: vi.fn(),
  getDb: vi.fn(),
  withTenant: vi.fn(),
  catatAudit: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw { __redirect: path, sentinel: REDIRECT_SENTINEL };
  }),
  cookiesSet: vi.fn(),
}));

const orgInsert = vi.fn(async () => [{ id: "sat_org_NEW" }]);
const penggunaInsert = vi.fn(async () => [{ id: "pg_NEW" }]);

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: mocks.getWorkOS,
  withAuth: mocks.withAuth,
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: mocks.requireAuth,
  getAuthenticatedUserId: vi.fn(async () => "workos_u_1"),
  ACTIVE_TENANT_COOKIE: "eapp_active_org",
  ACTIVE_TENANT_MAX_AGE: 60 * 60 * 24 * 30,
}));
vi.mock("@/lib/auth/membership", () => ({
  listMembershipsForUser: mocks.listMembershipsForUser,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/schema", () => ({
  satuanPendidikan: TABLES.satuan,
  pengguna: TABLES.pengguna,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mocks.cookiesSet })),
}));

import { buatSatuanPendidikanBaruAction } from "./actions";

/** tx.insert(table) -> { values(row) }; routes by Symbol table identity. */
function makeFakeTx() {
  const tx = {
    insert: vi.fn((table: unknown) => {
      if (table === TABLES.satuan) return { values: orgInsert };
      if (table === TABLES.pengguna) return { values: penggunaInsert };
      throw new Error(`unexpected insert table: ${String(table)}`);
    }),
  };
  return tx;
}

const FAKE_DB = { __db: true };

const WORKOS_USER = {
  id: "workos_u_1",
  firstName: "Budi",
  lastName: "Santoso",
  email: "budi@example.com",
};

const createOrg = vi.fn();
const createMembership = vi.fn();

function workosClient() {
  createOrg.mockResolvedValue({
    id: "org_01NEW",
    name: "SMP Negeri 1",
  });
  createMembership.mockResolvedValue({
    id: "om_01NEW",
    organizationId: "org_01NEW",
    userId: "workos_u_1",
  });
  return {
    organizations: { createOrganization: createOrg },
    userManagement: { createOrganizationMembership: createMembership },
  };
}

function formData(obj: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

const validPayload = (over: Record<string, string> = {}) => ({
  nama: "SMP Negeri 1 Nusantara",
  jenjang: "SMP",
  alamat: "Jl. Merdeka 1",
  ...over,
});

beforeEach(() => {
  mocks.requireAuth.mockReset();
  mocks.withAuth.mockReset();
  mocks.listMembershipsForUser.mockReset();
  mocks.getWorkOS.mockReset();
  mocks.getDb.mockReset();
  mocks.withTenant.mockReset();
  mocks.catatAudit.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.redirect.mockReset();
  mocks.cookiesSet.mockReset();
  createOrg.mockReset();
  createMembership.mockReset();
  orgInsert.mockReset();
  penggunaInsert.mockReset();

  mocks.requireAuth.mockResolvedValue({ userId: "workos_u_1" });
  mocks.withAuth.mockResolvedValue({ user: WORKOS_USER });
  mocks.listMembershipsForUser.mockResolvedValue([]);
  mocks.getWorkOS.mockReturnValue(workosClient());
  mocks.getDb.mockReturnValue({ db: FAKE_DB });
  mocks.withTenant.mockImplementation(
    async (_db: unknown, _id: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn(makeFakeTx()),
  );
  mocks.catatAudit.mockResolvedValue(undefined);
  orgInsert.mockResolvedValue([{ id: "sat_org_NEW" }]);
  penggunaInsert.mockResolvedValue([{ id: "pg_NEW" }]);
  mocks.redirect.mockImplementation((path: string) => {
    throw { __redirect: path, sentinel: REDIRECT_SENTINEL };
  });
});

afterEach(() => {
  expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
});

describe("buatSatuanPendidikanBaruAction — provisioning (#14)", () => {
  it("happy path: org -> membership -> DB satuan + pengguna + audit -> cookie -> redirect", async () => {
    const result = await buatSatuanPendidikanBaruAction(
      null,
      formData(validPayload()),
    ).catch((e: unknown) => e);

    expect(result).toEqual({
      __redirect: "/dashboard",
      sentinel: REDIRECT_SENTINEL,
    });

    expect(createOrg).toHaveBeenCalledWith({
      name: "SMP Negeri 1 Nusantara",
      metadata: { jenjang: "SMP", alamat: "Jl. Merdeka 1" },
    });
    expect(createMembership).toHaveBeenCalledWith({
      organizationId: "org_01NEW",
      userId: "workos_u_1",
      roleSlug: "admin_satuan_pendidikan",
    });
    expect(mocks.withTenant).toHaveBeenCalledWith(
      FAKE_DB,
      "org_01NEW",
      expect.any(Function),
    );
    expect(orgInsert).toHaveBeenCalledWith({
      id: "org_01NEW",
      nama: "SMP Negeri 1 Nusantara",
      jenjang: "SMP",
      alamat: "Jl. Merdeka 1",
    });
    expect(penggunaInsert).toHaveBeenCalledWith({
      tenantId: "org_01NEW",
      userId: "workos_u_1",
      peranAkses: "admin_satuan_pendidikan",
      nama: "Budi Santoso",
    });
    expect(mocks.catatAudit).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_satuan_pendidikan",
        target: "satuan_pendidikan:org_01NEW",
      }),
    );
    expect(mocks.cookiesSet).toHaveBeenCalledWith(
      "eapp_active_org",
      "org_01NEW",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("no session -> Bahasa error, no WorkOS/DB call", async () => {
    mocks.withAuth.mockResolvedValue({ user: null });

    const result = (await buatSatuanPendidikanBaruAction(
      null,
      formData(validPayload()),
    )) as { ok: boolean; error: string };

    expect(result).toEqual({ ok: false, error: "Belum terautentikasi." });
    expect(createOrg).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("already has a membership -> rejects before any WorkOS call", async () => {
    mocks.listMembershipsForUser.mockResolvedValue([
      { orgId: "org_EXISTING", orgName: "Existing", roleSlug: "guru" },
    ]);

    const result = (await buatSatuanPendidikanBaruAction(
      null,
      formData(validPayload()),
    )) as { ok: boolean; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sudah memiliki Satuan Pendidikan/i);
    expect(createOrg).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("nama too short -> zod rejects before WorkOS/DB", async () => {
    const result = (await buatSatuanPendidikanBaruAction(
      null,
      formData(validPayload({ nama: "SD" })),
    )) as { ok: boolean; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tidak valid/i);
    expect(createOrg).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("invalid jenjang (TK) -> zod rejects", async () => {
    const result = (await buatSatuanPendidikanBaruAction(
      null,
      formData(validPayload({ jenjang: "TK" })),
    )) as { ok: boolean; error: string };

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/tidak valid/i);
    expect(createOrg).not.toHaveBeenCalled();
  });

  it("Madrasah jenjang (MI/MTs/MA) accepted", async () => {
    const res = await buatSatuanPendidikanBaruAction(
      null,
      formData(validPayload({ jenjang: "MI" })),
    ).catch((e: unknown) => e);

    expect(res).toEqual({
      __redirect: "/dashboard",
      sentinel: REDIRECT_SENTINEL,
    });
    expect(createOrg).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ jenjang: "MI" }),
      }),
    );
  });

  it("empty alamat -> metadata omits alamat, DB stores null", async () => {
    const res = await buatSatuanPendidikanBaruAction(
      null,
      formData(validPayload({ alamat: "" })),
    ).catch((e: unknown) => e);

    expect(res).toEqual({
      __redirect: "/dashboard",
      sentinel: REDIRECT_SENTINEL,
    });
    expect(createOrg).toHaveBeenCalledWith({
      name: "SMP Negeri 1 Nusantara",
      metadata: { jenjang: "SMP" },
    });
    expect(orgInsert).toHaveBeenCalledWith(
      expect.objectContaining({ alamat: null }),
    );
  });

  it("nama joins firstName + lastName; nulls collapse gracefully", async () => {
    mocks.withAuth.mockResolvedValue({
      user: {
        id: "workos_u_1",
        firstName: null,
        lastName: "Santoso",
        email: "x@y.z",
      },
    });

    await buatSatuanPendidikanBaruAction(
      null,
      formData(validPayload()),
    ).catch(() => undefined);

    expect(penggunaInsert).toHaveBeenCalledWith(
      expect.objectContaining({ nama: "Santoso" }),
    );
  });

  it("both names null -> pengguna.nama stored as null, not 'undefined'", async () => {
    mocks.withAuth.mockResolvedValue({
      user: {
        id: "workos_u_1",
        firstName: null,
        lastName: null,
        email: "x@y.z",
      },
    });

    await buatSatuanPendidikanBaruAction(
      null,
      formData(validPayload()),
    ).catch(() => undefined);

    expect(penggunaInsert).toHaveBeenCalledWith(
      expect.objectContaining({ nama: null }),
    );
  });
});
