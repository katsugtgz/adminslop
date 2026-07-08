import { describe, expect, it } from "vitest";

import {
  assertReturnedRow,
  parseFiniteNumber,
  requireFileSize,
  requireFormString,
  requireIsoDate,
  requireTextSize,
  requireUuid,
} from "./validation";

describe("validation helpers", () => {
  it("rejects numeric infinities", () => {
    expect(() => parseFiniteNumber("Infinity", "bad")).toThrow("bad");
    expect(parseFiniteNumber("12.5", "bad")).toBe(12.5);
  });

  it("rejects impossible ISO dates with the provided error", () => {
    expect(() => requireIsoDate("2026-02-31", "bad date")).toThrow("bad date");
    expect(() => requireIsoDate("2026-13-01", "bad date")).toThrow("bad date");
    expect(requireIsoDate("2026-02-28", "bad date")).toBe("2026-02-28");
  });

  it("validates UUID shape", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(requireUuid(id, "bad uuid")).toBe(id);
    expect(() => requireUuid("not-a-uuid", "bad uuid")).toThrow("bad uuid");
  });

  it("requires returned rows", () => {
    const row = { id: "row_1" };
    expect(assertReturnedRow(row, "missing")).toBe(row);
    expect(() => assertReturnedRow(undefined, "missing")).toThrow("missing");
  });

  it("requires non-empty string FormData values", () => {
    const fd = new FormData();
    fd.set("nama", "  Budi  ");
    fd.set("kosong", "  ");
    fd.set("file", new File(["x"], "x.txt"));

    expect(requireFormString(fd, "nama", "bad form")).toBe("Budi");
    expect(() => requireFormString(fd, "kosong", "bad form")).toThrow("bad form");
    expect(() => requireFormString(fd, "file", "bad form")).toThrow("bad form");
  });

  it("bounds text and file sizes", () => {
    expect(requireTextSize("abcd", 4, "too big")).toBe("abcd");
    expect(() => requireTextSize("abcde", 4, "too big")).toThrow("too big");

    const file = new File(["abcd"], "data.csv");
    expect(requireFileSize(file, 4, "file too big")).toBe(file);
    expect(() => requireFileSize(file, 3, "file too big")).toThrow("file too big");
  });
});
