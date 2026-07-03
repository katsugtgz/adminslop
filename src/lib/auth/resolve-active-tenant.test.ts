import { describe, expect, it } from "vitest";

import { resolveActiveTenant } from "./resolve-active-tenant";
import type { Membership } from "./types";

const m = (orgId: string, orgName = orgId): Membership => ({
  orgId,
  orgName,
  roleSlug: "guru",
});

describe("resolveActiveTenant (#4)", () => {
  it("no membership -> denied with authenticated bit threaded through", () => {
    expect(
      resolveActiveTenant({ memberships: [], authenticated: false })
    ).toEqual({ status: "denied", authenticated: false });
    expect(
      resolveActiveTenant({ memberships: [], authenticated: true })
    ).toEqual({ status: "denied", authenticated: true });
  });

  it("single membership -> auto-selected active, even with stale cookie", () => {
    expect(
      resolveActiveTenant({ memberships: [m("org_A")], authenticated: true })
    ).toEqual({
      status: "active",
      membership: m("org_A"),
    });
    expect(
      resolveActiveTenant({
        memberships: [m("org_A")],
        requestedOrgId: "org_tampered",
        authenticated: true,
      })
    ).toEqual({ status: "active", membership: m("org_A") });
  });

  it("multiple memberships, no choice -> choose", () => {
    const memberships = [m("org_A", "Sekolah A"), m("org_B", "Sekolah B")];
    expect(
      resolveActiveTenant({ memberships, authenticated: true })
    ).toEqual({
      status: "choose",
      memberships,
    });
  });

  it("multiple memberships, valid choice -> active", () => {
    const memberships = [m("org_A"), m("org_B")];
    expect(
      resolveActiveTenant({
        memberships,
        requestedOrgId: "org_B",
        authenticated: true,
      })
    ).toEqual({ status: "active", membership: m("org_B") });
  });

  it("multiple memberships, invalid/tampered choice -> choose (no access granted)", () => {
    const memberships = [m("org_A"), m("org_B")];
    expect(
      resolveActiveTenant({
        memberships,
        requestedOrgId: "org_X",
        authenticated: true,
      })
    ).toEqual({ status: "choose", memberships });
  });
});
