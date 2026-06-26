import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Pengguna } from "@/db/schema";

import type { KeputusanAkses } from "./otorisasi";
import type { Membership, RoleSlug } from "./types";

// Hoisted mocks + sentinel fixtures. `vi.hoisted` guarantees these exist before
// the `vi.mock(...)` factories evaluate (which happens during import hoisting).
const mocks = vi.hoisted(() => {
  // Sentinels passed as the `db` and `tx` arguments. Identity-checkable so we
  // can assert the repo functions received the tx handed to withTenant's
  // callback, and that withTenant received the db from getDb().
  const fakeDb = { __tag: "db" };
  const fakeTx = { __tag: "tx" };
  return {
    fakeDb,
    fakeTx,
    getActiveTenantContext: vi.fn(),
    getAuthenticatedUserId: vi.fn(),
    evaluasiAkses: vi.fn(),
    getDb: vi.fn(() => ({ db: fakeDb })),
    // Mirror withTenant(db, tenantId, fn): invoke the callback with fakeTx so
    // the SUT's repo calls run "inside" the tenant scope.
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: string,
        fn: (tx: unknown) => Promise<unknown>
      ): Promise<unknown> => fn(fakeTx)
    ),
    cariPenggunaByUserId: vi.fn(),
    loadAksesPengguna: vi.fn(),
  };
});

vi.mock("./server", () => ({
  getActiveTenantContext: mocks.getActiveTenantContext,
  getAuthenticatedUserId: mocks.getAuthenticatedUserId,
}));
vi.mock("./otorisasi", () => ({ evaluasiAkses: mocks.evaluasiAkses }));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
}));
vi.mock("@/db/queries/akses", () => ({
  cariPenggunaByUserId: mocks.cariPenggunaByUserId,
  loadAksesPengguna: mocks.loadAksesPengguna,
}));

import { getAksesSaya } from "./akses-saya";

const m = (orgId: string, roleSlug: RoleSlug): Membership => ({
  orgId,
  orgName: orgId,
  roleSlug,
});

const pengguna = (
  id: string,
  userId: string,
  orgId: string,
  peranAkses: string
): Pengguna => ({
  id,
  tenantId: orgId,
  userId,
  peranAkses,
  ptkId: null,
  nama: null,
  dibuatPada: new Date("2024-01-01T00:00:00Z"),
});

beforeEach(() => {
  // Clears call/instance state but preserves implementations set above.
  vi.clearAllMocks();
});

describe("getAksesSaya (#6, T4 — authorization composition)", () => {
  it("denied context -> {status:'denied'}; does not call userId resolver or repo", async () => {
    mocks.getActiveTenantContext.mockResolvedValue({ status: "denied" });

    const res = await getAksesSaya();

    expect(res).toEqual({ status: "denied" });
    expect(mocks.getAuthenticatedUserId).not.toHaveBeenCalled();
    expect(mocks.cariPenggunaByUserId).not.toHaveBeenCalled();
    expect(mocks.loadAksesPengguna).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
    expect(mocks.evaluasiAkses).not.toHaveBeenCalled();
  });

  it("choose context -> {status:'choose', memberships}; does not resolve user or repo", async () => {
    const memberships = [
      m("org_A", "guru"),
      m("org_B", "admin_satuan_pendidikan"),
    ];
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "choose",
      memberships,
    });

    const res = await getAksesSaya();

    expect(res).toEqual({ status: "choose", memberships });
    expect(mocks.getAuthenticatedUserId).not.toHaveBeenCalled();
    expect(mocks.cariPenggunaByUserId).not.toHaveBeenCalled();
    expect(mocks.loadAksesPengguna).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });

  it("active, no pengguna row -> izin/pembatasan empty, pengguna null; loadAksesPengguna skipped; admin boleh() -> peran", async () => {
    const membership = m("org_A", "admin_satuan_pendidikan");
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership,
    });
    mocks.getAuthenticatedUserId.mockResolvedValue("workos_u_1");
    mocks.cariPenggunaByUserId.mockResolvedValue(null);
    const decision: KeputusanAkses = { diizinkan: true, sumber: "peran" };
    mocks.evaluasiAkses.mockReturnValue(decision);

    const res = await getAksesSaya();
    expect(res.status).toBe("active");
    if (res.status !== "active") return;

    expect(res.membership).toBe(membership);
    expect(res.userId).toBe("workos_u_1");
    expect(res.pengguna).toBeNull();
    expect(res.izin).toEqual([]);
    expect(res.pembatasan).toEqual([]);
    // No pengguna row => no point loading akses.
    expect(mocks.loadAksesPengguna).not.toHaveBeenCalled();

    expect(res.boleh("ptk:buat")).toBe(decision);
    expect(mocks.evaluasiAkses).toHaveBeenCalledWith({
      roleSlug: "admin_satuan_pendidikan",
      izinGrants: [],
      pembatasan: [],
      diminta: "ptk:buat",
    });
  });

  it("active, no pengguna row, guru -> boleh() -> tidak_ada_izin (role default empty)", async () => {
    const membership = m("org_A", "guru");
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership,
    });
    mocks.getAuthenticatedUserId.mockResolvedValue("workos_u_2");
    mocks.cariPenggunaByUserId.mockResolvedValue(null);
    const decision: KeputusanAkses = {
      diizinkan: false,
      sumber: "tidak_ada_izin",
    };
    mocks.evaluasiAkses.mockReturnValue(decision);

    const res = await getAksesSaya();
    if (res.status !== "active") throw new Error("expected active");

    expect(res.boleh("ptk:buat")).toBe(decision);
    expect(mocks.evaluasiAkses).toHaveBeenCalledWith({
      roleSlug: "guru",
      izinGrants: [],
      pembatasan: [],
      diminta: "ptk:buat",
    });
  });

  it("active, pengguna with izin=['ptk:baca'] -> grants loaded and passed; guru boleh('ptk:baca') -> izin source", async () => {
    const membership = m("org_A", "guru");
    const p = pengguna("pg_1", "workos_u_3", "org_A", "guru");
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership,
    });
    mocks.getAuthenticatedUserId.mockResolvedValue("workos_u_3");
    mocks.cariPenggunaByUserId.mockResolvedValue(p);
    mocks.loadAksesPengguna.mockResolvedValue({
      izin: ["ptk:baca"],
      pembatasan: [],
    });
    const decision: KeputusanAkses = { diizinkan: true, sumber: "izin" };
    mocks.evaluasiAkses.mockReturnValue(decision);

    const res = await getAksesSaya();
    if (res.status !== "active") throw new Error("expected active");

    expect(res.pengguna).toBe(p);
    expect(res.izin).toEqual(["ptk:baca"]);
    expect(res.pembatasan).toEqual([]);
    // Loaded inside withTenant using the pengguna id.
    expect(mocks.loadAksesPengguna).toHaveBeenCalledWith(mocks.fakeTx, "pg_1");

    expect(res.boleh("ptk:baca")).toBe(decision);
    expect(mocks.evaluasiAkses).toHaveBeenCalledWith({
      roleSlug: "guru",
      izinGrants: ["ptk:baca"],
      pembatasan: [],
      diminta: "ptk:baca",
    });
  });

  it("active, pembatasan=['ptk:hapus'] -> admin boleh('ptk:hapus') -> pembatasan wins; roleSlug taken from membership not peranAkses", async () => {
    // Intentional mismatch: pengguna.peranAkses is a stale 'guru' snapshot,
    // but the live membership role is 'admin_satuan_pendidikan'. The evaluator
    // MUST receive the membership role (authoritative), proving peranAkses is
    // never trusted for authorization (identity doc §13).
    const membership = m("org_A", "admin_satuan_pendidikan");
    const p = pengguna("pg_2", "workos_u_4", "org_A", "guru");
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership,
    });
    mocks.getAuthenticatedUserId.mockResolvedValue("workos_u_4");
    mocks.cariPenggunaByUserId.mockResolvedValue(p);
    mocks.loadAksesPengguna.mockResolvedValue({
      izin: [],
      pembatasan: ["ptk:hapus"],
    });
    const decision: KeputusanAkses = { diizinkan: false, sumber: "pembatasan" };
    mocks.evaluasiAkses.mockReturnValue(decision);

    const res = await getAksesSaya();
    if (res.status !== "active") throw new Error("expected active");

    expect(res.pembatasan).toEqual(["ptk:hapus"]);
    // No superuser: admin's default ptk:hapus is still denied by the restriction.
    expect(res.boleh("ptk:hapus")).toBe(decision);
    expect(mocks.evaluasiAkses).toHaveBeenCalledWith({
      roleSlug: "admin_satuan_pendidikan", // <- from membership, NOT peranAkses 'guru'
      izinGrants: [],
      pembatasan: ["ptk:hapus"],
      diminta: "ptk:hapus",
    });
  });

  it("scopes repo calls inside withTenant(db, membership.orgId, tx => ...)", async () => {
    const membership = m("org_TENANT", "admin_satuan_pendidikan");
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership,
    });
    mocks.getAuthenticatedUserId.mockResolvedValue("workos_u_6");
    mocks.cariPenggunaByUserId.mockResolvedValue(null);

    await getAksesSaya();

    // getDb called exactly once; withTenant called exactly once with the db
    // returned by getDb and the membership's orgId.
    expect(mocks.getDb).toHaveBeenCalledTimes(1);
    expect(mocks.withTenant).toHaveBeenCalledTimes(1);
    const [dbArg, tenantArg, fnArg] = mocks.withTenant.mock.calls[0];
    expect(dbArg).toBe(mocks.fakeDb);
    expect(tenantArg).toBe("org_TENANT");
    expect(typeof fnArg).toBe("function");
    // The callback was invoked with fakeTx, which the repo then received.
    expect(mocks.cariPenggunaByUserId).toHaveBeenCalledWith(
      mocks.fakeTx,
      "workos_u_6"
    );
  });

  it("getAuthenticatedUserId is called for active and its return feeds cariPenggunaByUserId", async () => {
    const membership = m("org_A", "guru");
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership,
    });
    mocks.getAuthenticatedUserId.mockResolvedValue("workos_u_7");
    mocks.cariPenggunaByUserId.mockResolvedValue(null);

    const res = await getAksesSaya();
    if (res.status !== "active") throw new Error("expected active");

    expect(mocks.getAuthenticatedUserId).toHaveBeenCalledTimes(1);
    expect(res.userId).toBe("workos_u_7");
    expect(mocks.cariPenggunaByUserId).toHaveBeenCalledWith(
      mocks.fakeTx,
      "workos_u_7"
    );
  });

  it("active but getAuthenticatedUserId returns null mid-request -> denied (no throw)", async () => {
    // Defensive: session vanished between getActiveTenantContext and the
    // second withAuth read. Must not 500, must not load any tenant data.
    const membership = m("org_A", "guru");
    mocks.getActiveTenantContext.mockResolvedValue({
      status: "active",
      membership,
    });
    mocks.getAuthenticatedUserId.mockResolvedValue(null);

    const res = await getAksesSaya();

    expect(res).toEqual({ status: "denied" });
    expect(mocks.cariPenggunaByUserId).not.toHaveBeenCalled();
    expect(mocks.loadAksesPengguna).not.toHaveBeenCalled();
    expect(mocks.withTenant).not.toHaveBeenCalled();
  });
});
