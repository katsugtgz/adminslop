import { describe, expect, it } from "vitest";

import { dapatMelihatAkses, dapatMengelolaAkses, evaluasiAkses } from "./otorisasi";
import type { IzinSlug, RoleSlug } from "./types";

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

describe("evaluasiAkses (#7 T1) — peserta_didik defaults", () => {
  it("admin_satuan_pendidikan requesting peserta_didik:buat -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("admin_satuan_pendidikan", "peserta_didik:buat"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("admin_satuan_pendidikan requesting peserta_didik:ubah -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("admin_satuan_pendidikan", "peserta_didik:ubah"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("admin_satuan_pendidikan requesting peserta_didik:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("admin_satuan_pendidikan", "peserta_didik:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("guru requesting peserta_didik:baca -> allow 'peran' (students are core teaching data)", () => {
    expect(evaluasiAkses(defaults("guru", "peserta_didik:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("guru requesting peserta_didik:buat -> deny 'tidak_ada_izin' (no write default for guru)", () => {
    expect(evaluasiAkses(defaults("guru", "peserta_didik:buat"))).toEqual({
      diizinkan: false,
      sumber: "tidak_ada_izin",
    });
  });

  it("wali_kelas requesting peserta_didik:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("wali_kelas", "peserta_didik:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("kepala_sekolah requesting peserta_didik:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("kepala_sekolah", "peserta_didik:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("dev mirrors admin: peserta_didik:ubah -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("dev", "peserta_didik:ubah"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("guru requesting peserta_didik:baca WITH pembatasan=['peserta_didik:baca'] -> DENY 'pembatasan' (no superuser)", () => {
    expect(
      evaluasiAkses({
        roleSlug: "guru",
        diminta: "peserta_didik:baca",
        izinGrants: [],
        pembatasan: ["peserta_didik:baca"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });
});
