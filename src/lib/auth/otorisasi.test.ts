import { describe, expect, it } from "vitest";
import {
  canAdminSatuanPendidikan,
  canViewPengaturanSatuanPendidikan,
  dapatMelihatAkses,
  dapatMengelolaAkses,
  evaluasiAkses,
} from "./otorisasi";
import type { IzinSlug, RoleSlug } from "./types";

// ─── #5: Profil/Pengaturan Satuan Pendidikan predicates ──────────────────────

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
  it("wali_kelas -> false (read-only)", () => {
    expect(canAdminSatuanPendidikan("wali_kelas")).toBe(false);
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

// ─── #6: Akses evaluator ─────────────────────────────────────────────────────

/** Minimal evaluator input: no grants, no restrictions (defaults only). */
const defaults = (roleSlug: RoleSlug, diminta: IzinSlug) => ({
  roleSlug,
  diminta,
  izinGrants: [],
  pembatasan: [],
});

describe("evaluasiAkses (#6 T1) — role defaults", () => {
  it("admin_satuan_pendidikan requesting ptk:baca (no grants/restrictions) -> allow, sumber 'peran'", () => {
    expect(evaluasiAkses(defaults("admin_satuan_pendidikan", "ptk:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("admin_satuan_pendidikan requesting akses:kelola (no grants/restrictions) -> allow, sumber 'peran'", () => {
    expect(evaluasiAkses(defaults("admin_satuan_pendidikan", "akses:kelola"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("guru requesting ptk:baca (no grants/restrictions) -> deny, sumber 'tidak_ada_izin' (empty defaults)", () => {
    expect(evaluasiAkses(defaults("guru", "ptk:baca"))).toEqual({
      diizinkan: false,
      sumber: "tidak_ada_izin",
    });
  });
});

describe("evaluasiAkses (#6 T1) — explicit izin grants", () => {
  it("guru requesting ptk:baca WITH izinGrants=['ptk:baca'] -> allow, sumber 'izin' (explicit grant overrides empty default)", () => {
    expect(
      evaluasiAkses({
        roleSlug: "guru",
        diminta: "ptk:baca",
        izinGrants: ["ptk:baca"],
        pembatasan: [],
      })
    ).toEqual({ diizinkan: true, sumber: "izin" });
  });
});

describe("evaluasiAkses (#6 T1) — pembatasan (deny-wins, no superuser)", () => {
  it("admin requesting ptk:hapus WITH pembatasan=['ptk:hapus'] -> DENY 'pembatasan' (restriction wins even over admin — NO SUPERUSER)", () => {
    expect(
      evaluasiAkses({
        roleSlug: "admin_satuan_pendidikan",
        diminta: "ptk:hapus",
        izinGrants: [],
        pembatasan: ["ptk:hapus"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });

  it("guru requesting ptk:baca WITH izinGrants=['ptk:baca'] AND pembatasan=['ptk:baca'] -> DENY 'pembatasan' (restriction wins over explicit grant)", () => {
    expect(
      evaluasiAkses({
        roleSlug: "guru",
        diminta: "ptk:baca",
        izinGrants: ["ptk:baca"],
        pembatasan: ["ptk:baca"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });
});

describe("evaluasiAkses (#6 T1) — role default coverage across all peran", () => {
  it("dev mirrors admin: ptk:buat -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("dev", "ptk:buat"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("dev mirrors admin: akses:kelola -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("dev", "akses:kelola"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("wali_kelas requesting akses:baca -> deny 'tidak_ada_izin' (empty defaults, needs explicit grant)", () => {
    expect(evaluasiAkses(defaults("wali_kelas", "akses:baca"))).toEqual({
      diizinkan: false,
      sumber: "tidak_ada_izin",
    });
  });

  it("kepala_sekolah requesting akses:baca -> allow 'peran' (has akses:baca default)", () => {
    expect(evaluasiAkses(defaults("kepala_sekolah", "akses:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("kepala_sekolah requesting ptk:buat -> deny 'tidak_ada_izin' (no admin defaults)", () => {
    expect(evaluasiAkses(defaults("kepala_sekolah", "ptk:buat"))).toEqual({
      diizinkan: false,
      sumber: "tidak_ada_izin",
    });
  });
});

describe("dapatMengelolaAkses (#6 T1) — page visibility for Akses administration", () => {
  it.each<[RoleSlug, boolean]>([
    ["admin_satuan_pendidikan", true],
    ["dev", true],
    ["guru", false],
    ["wali_kelas", false],
    ["kepala_sekolah", false],
  ])("dapatMengelolaAkses('%s') -> %s", (roleSlug, expected) => {
    expect(dapatMengelolaAkses(roleSlug)).toBe(expected);
  });
});

describe("dapatMelihatAkses (#6 T1) — read visibility for Akses page", () => {
  it.each<[RoleSlug, boolean]>([
    ["kepala_sekolah", true],
    ["admin_satuan_pendidikan", true],
    ["guru", false],
    ["wali_kelas", false],
  ])("dapatMelihatAkses('%s') -> %s", (roleSlug, expected) => {
    expect(dapatMelihatAkses(roleSlug)).toBe(expected);
  });
});

describe("evaluasiAkses (#6 T1) — input robustness", () => {
  it("duplicate entries in izinGrants do not break the explicit-grant path", () => {
    expect(
      evaluasiAkses({
        roleSlug: "guru",
        diminta: "ptk:baca",
        izinGrants: ["ptk:baca", "ptk:baca", "ptk:buat"],
        pembatasan: [],
      })
    ).toEqual({ diizinkan: true, sumber: "izin" });
  });

  it("duplicate entries in pembatasan do not break the deny path", () => {
    expect(
      evaluasiAkses({
        roleSlug: "admin_satuan_pendidikan",
        diminta: "ptk:hapus",
        izinGrants: [],
        pembatasan: ["ptk:hapus", "ptk:hapus"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });
});
