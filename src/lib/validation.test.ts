import { describe, expect, it } from "vitest";

import { parseFiniteNumber, requireIsoDate } from "./validation";

describe("validation helpers", () => {
  it("rejects numeric infinities", () => {
    expect(() => parseFiniteNumber("Infinity", "bad")).toThrow("bad");
    expect(parseFiniteNumber("12.5", "bad")).toBe(12.5);
  });

  it("rejects impossible ISO dates", () => {
    expect(() => requireIsoDate("2026-02-31", "bad date")).toThrow("bad date");
    expect(requireIsoDate("2026-02-28", "bad date")).toBe("2026-02-28");
  });
});
