import { describe, expect, it, vi } from "vitest";

vi.mock("@workos-inc/authkit-nextjs", () => ({
  authkitMiddleware: () => vi.fn(),
}));

import { config } from "./middleware";

describe("AuthKit middleware matcher", () => {
  it("keeps the public landing page outside AuthKit", () => {
    expect(config.matcher).not.toContain("/");
    expect(config.matcher).toContain("/dashboard/:path*");
    expect(config.matcher).toContain("/api/auth/:path*");
  });
});
