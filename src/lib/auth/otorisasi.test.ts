import { describe, expect, it } from "vitest";
import { canAdminSatuanPendidikan, canViewPengaturanSatuanPendidikan } from "./otorisasi";

describe("canAdminSatuanPendidikan (#5)", () => {
  it("admin_satuan_pendidikan -> true", () => {
    expect(canAdminSatuanPendidikan("admin_satuan_pendidikan")).toBe(true);
  });
  it("dev (local shim) -> true (admin-equivalent)", () => {
    expect(canAdminSatuanPendidikan("dev")).toBe(true);
  });
  it("guru -> false (read-only)", () => {
    expect(canAdminSatuanPendidikan("guru")).toBe(false);
  });
  it("kepala_sekolah -> false (read-only when not also admin)", () => {
    expect(canAdminSatuanPendidikan("kepala_sekolah")).toBe(false);
  });
  it("unknown slug -> false (deny by default)", () => {
    expect(canAdminSatuanPendidikan("superuser")).toBe(false);
  });
  it("undefined -> false (deny by default)", () => {
    expect(canAdminSatuanPendidikan(undefined)).toBe(false);
  });
});

describe("canViewPengaturanSatuanPendidikan (#5)", () => {
  it.each(["admin_satuan_pendidikan", "dev", "guru", "kepala_sekolah"] as const)(
    "%s -> true (any member can view their Satuan Pendidikan profil/pengaturan)",
    (slug) => {
      expect(canViewPengaturanSatuanPendidikan(slug)).toBe(true);
    },
  );
  it("unknown -> false", () => {
    expect(canViewPengaturanSatuanPendidikan("random")).toBe(false);
  });
  it("undefined -> false", () => {
    expect(canViewPengaturanSatuanPendidikan(undefined)).toBe(false);
  });
});
