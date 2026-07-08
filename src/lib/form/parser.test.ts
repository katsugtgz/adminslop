import { describe, expect, it } from "vitest";

import {
  checkboxField,
  optionalString,
  requiredString,
  trimField,
} from "./parser";

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

describe("trimField", () => {
  it("returns trimmed string for present field", () => {
    expect(trimField(formData({ name: "  Budi  " }), "name")).toBe("Budi");
  });

  it("returns empty string for missing field", () => {
    expect(trimField(new FormData(), "missing")).toBe("");
  });
});

describe("optionalString", () => {
  it("returns trimmed string for non-empty field", () => {
    expect(optionalString(formData({ id: "  abc  " }), "id")).toBe("abc");
  });

  it("returns null for whitespace-only field", () => {
    expect(optionalString(formData({ id: "   " }), "id")).toBeNull();
  });

  it("returns null for missing field", () => {
    expect(optionalString(new FormData(), "missing")).toBeNull();
  });
});

describe("requiredString", () => {
  it("returns trimmed string for non-empty field", () => {
    expect(
      requiredString(formData({ id: "  abc  " }), "id", "wajib"),
    ).toBe("abc");
  });

  it("throws given error for empty field", () => {
    expect(() =>
      requiredString(formData({ id: "" }), "id", "ID wajib diisi."),
    ).toThrow("ID wajib diisi.");
  });

  it("throws given error for missing field", () => {
    expect(() => requiredString(new FormData(), "missing", "wajib")).toThrow(
      "wajib",
    );
  });
});

describe("checkboxField", () => {
  it("returns true when field is 'on'", () => {
    expect(checkboxField(formData({ aktif: "on" }), "aktif")).toBe(true);
  });

  it("returns false when field is absent", () => {
    expect(checkboxField(new FormData(), "aktif")).toBe(false);
  });

  it("returns false when field has other value", () => {
    expect(checkboxField(formData({ aktif: "off" }), "aktif")).toBe(false);
  });
});
