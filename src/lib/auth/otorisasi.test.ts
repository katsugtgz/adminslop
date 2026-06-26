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

describe("evaluasiAkses (#8 T2) — tahun_ajaran + rombongan_belajar defaults", () => {
  // admin/dev get every new slug (TA management + full class CRUD).
  it.each<IzinSlug>([
    "tahun_ajaran:baca",
    "tahun_ajaran:kelola",
    "rombongan_belajar:baca",
    "rombongan_belajar:buat",
    "rombongan_belajar:ubah",
    "rombongan_belajar:kelola_penempatan",
  ])(
    "admin_satuan_pendidikan requesting '%s' (no grants/restrictions) -> allow, sumber 'peran'",
    (slug) => {
      expect(
        evaluasiAkses(defaults("admin_satuan_pendidikan", slug))
      ).toEqual({ diizinkan: true, sumber: "peran" });
    }
  );

  it.each<IzinSlug>([
    "tahun_ajaran:baca",
    "tahun_ajaran:kelola",
    "rombongan_belajar:baca",
    "rombongan_belajar:buat",
    "rombongan_belajar:ubah",
    "rombongan_belajar:kelola_penempatan",
  ])(
    "dev mirrors admin: requesting '%s' -> allow, sumber 'peran'",
    (slug) => {
      expect(evaluasiAkses(defaults("dev", slug))).toEqual({
        diizinkan: true,
        sumber: "peran",
      });
    }
  );

  // Class/rombel data is core teaching data -> teaching roles read by default.
  it("guru requesting rombongan_belajar:baca -> allow 'peran' (core teaching data)", () => {
    expect(
      evaluasiAkses(defaults("guru", "rombongan_belajar:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  it("wali_kelas requesting rombongan_belajar:baca -> allow 'peran'", () => {
    expect(
      evaluasiAkses(defaults("wali_kelas", "rombongan_belajar:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  it("kepala_sekolah requesting rombongan_belajar:baca -> allow 'peran'", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "rombongan_belajar:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  it("kepala_sekolah requesting tahun_ajaran:baca -> allow 'peran'", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "tahun_ajaran:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  // Writes remain admin-scoped — guru cannot create classes.
  it("guru requesting rombongan_belajar:buat -> deny 'tidak_ada_izin' (no write default)", () => {
    expect(
      evaluasiAkses(defaults("guru", "rombongan_belajar:buat"))
    ).toEqual({ diizinkan: false, sumber: "tidak_ada_izin" });
  });

  // TA management is admin-only — kepala_sekolah reads but does not manage.
  it("kepala_sekolah requesting tahun_ajaran:kelola -> deny 'tidak_ada_izin' (admin-only)", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "tahun_ajaran:kelola"))
    ).toEqual({ diizinkan: false, sumber: "tidak_ada_izin" });
  });

  // pembatasan still wins (no superuser).
  it("guru requesting rombongan_belajar:baca WITH pembatasan=['rombongan_belajar:baca'] -> DENY 'pembatasan'", () => {
    expect(
      evaluasiAkses({
        roleSlug: "guru",
        diminta: "rombongan_belajar:baca",
        izinGrants: [],
        pembatasan: ["rombongan_belajar:baca"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });
});

describe("evaluasiAkses (#9 T2) — kurikulum:baca universal default", () => {
  // Curriculum reference data is universal — every authenticated member can
  // browse it (read-only; seeded via migration, no write slugs this issue).
  it("admin_satuan_pendidikan requesting kurikulum:baca -> allow 'peran'", () => {
    expect(
      evaluasiAkses(defaults("admin_satuan_pendidikan", "kurikulum:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  it("guru requesting kurikulum:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("guru", "kurikulum:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("wali_kelas requesting kurikulum:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("wali_kelas", "kurikulum:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("kepala_sekolah requesting kurikulum:baca -> allow 'peran'", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "kurikulum:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });
});

describe("evaluasiAkses (#10 T2) — beban_mengajar + wali_kelas defaults", () => {
  // admin/dev get every new slug (full teaching-load + homeroom CRUD).
  it.each<IzinSlug>([
    "beban_mengajar:baca",
    "beban_mengajar:buat",
    "beban_mengajar:ubah",
    "wali_kelas:baca",
    "wali_kelas:buat",
    "wali_kelas:ubah",
  ])(
    "admin_satuan_pendidikan requesting '%s' (no grants/restrictions) -> allow, sumber 'peran'",
    (slug) => {
      expect(
        evaluasiAkses(defaults("admin_satuan_pendidikan", slug))
      ).toEqual({ diizinkan: true, sumber: "peran" });
    }
  );

  // Teaching roles read their own teaching load + homeroom context (AC#4).
  it("guru requesting beban_mengajar:baca -> allow 'peran' (own teaching load — AC#4)", () => {
    expect(
      evaluasiAkses(defaults("guru", "beban_mengajar:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  it("guru requesting wali_kelas:baca -> allow 'peran' (homeroom context — AC#4)", () => {
    expect(evaluasiAkses(defaults("guru", "wali_kelas:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  // Writes remain admin-scoped — guru cannot create teaching-load records.
  it("guru requesting beban_mengajar:buat -> deny 'tidak_ada_izin' (no write default)", () => {
    expect(
      evaluasiAkses(defaults("guru", "beban_mengajar:buat"))
    ).toEqual({ diizinkan: false, sumber: "tidak_ada_izin" });
  });
});

describe("evaluasiAkses (#11 T2) — penilaian defaults (dual-gate)", () => {
  // admin/dev get every penilaian slug (school-wide assessment management).
  it.each<IzinSlug>([
    "penilaian:baca",
    "penilaian:buat",
    "penilaian:ubah",
  ])(
    "admin_satuan_pendidikan requesting '%s' (no grants/restrictions) -> allow, sumber 'peran'",
    (slug) => {
      expect(
        evaluasiAkses(defaults("admin_satuan_pendidikan", slug))
      ).toEqual({ diizinkan: true, sumber: "peran" });
    }
  );

  it.each<IzinSlug>([
    "penilaian:baca",
    "penilaian:buat",
    "penilaian:ubah",
  ])(
    "dev mirrors admin: requesting '%s' -> allow, sumber 'peran'",
    (slug) => {
      expect(evaluasiAkses(defaults("dev", slug))).toEqual({
        diizinkan: true,
        sumber: "peran",
      });
    }
  );

  // AC#1 + AC#4 DUAL GATE: guru passes boleh() (gate 1, role-level) for all
  // three penilaian slugs. Ownership of the beban_mengajar is the SECOND gate,
  // enforced at the action layer — NOT here. evaluasiAkses only answers the
  // role-level question.
  it("guru requesting penilaian:buat -> allow 'peran' (gate 1; ownership is action-layer gate per AC#4)", () => {
    expect(evaluasiAkses(defaults("guru", "penilaian:buat"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("guru requesting penilaian:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("guru", "penilaian:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("guru requesting penilaian:ubah -> allow 'peran' (gate 1; ownership is action-layer gate per AC#4)", () => {
    expect(evaluasiAkses(defaults("guru", "penilaian:ubah"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  // wali_kelas reads (homeroom oversight); writes are admin/guru only.
  it("wali_kelas requesting penilaian:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("wali_kelas", "penilaian:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("wali_kelas requesting penilaian:buat -> deny 'tidak_ada_izin' (only baca default)", () => {
    expect(evaluasiAkses(defaults("wali_kelas", "penilaian:buat"))).toEqual({
      diizinkan: false,
      sumber: "tidak_ada_izin",
    });
  });

  // kepala_sekolah reads oversight; writes are admin/guru only.
  it("kepala_sekolah requesting penilaian:baca -> allow 'peran'", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "penilaian:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  it("kepala_sekolah requesting penilaian:buat -> deny 'tidak_ada_izin' (only baca default)", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "penilaian:buat"))
    ).toEqual({ diizinkan: false, sumber: "tidak_ada_izin" });
  });

  // pembatasan still wins (no superuser).
  it("guru requesting penilaian:buat WITH pembatasan=['penilaian:buat'] -> DENY 'pembatasan' (no superuser)", () => {
    expect(
      evaluasiAkses({
        roleSlug: "guru",
        diminta: "penilaian:buat",
        izinGrants: [],
        pembatasan: ["penilaian:buat"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });
});

describe("evaluasiAkses (#12 T2) — permintaan_ai + draf_ai defaults (AC#3 verify gate)", () => {
  // admin/dev get every new slug (full AI request/draft/verify lifecycle).
  it.each<IzinSlug>([
    "permintaan_ai:baca",
    "permintaan_ai:buat",
    "draf_ai:baca",
    "draf_ai:verifikasi",
  ])(
    "admin_satuan_pendidikan requesting '%s' (no grants/restrictions) -> allow, sumber 'peran'",
    (slug) => {
      expect(
        evaluasiAkses(defaults("admin_satuan_pendidikan", slug))
      ).toEqual({ diizinkan: true, sumber: "peran" });
    }
  );

  it.each<IzinSlug>([
    "permintaan_ai:baca",
    "permintaan_ai:buat",
    "draf_ai:baca",
    "draf_ai:verifikasi",
  ])(
    "dev mirrors admin: requesting '%s' -> allow, sumber 'peran'",
    (slug) => {
      expect(evaluasiAkses(defaults("dev", slug))).toEqual({
        diizinkan: true,
        sumber: "peran",
      });
    }
  );

  // AC#3 verification gate: guru may REQUEST AI generation (buat) + read
  // drafts, but CANNOT self-verify.
  it("guru requesting permintaan_ai:buat -> allow 'peran' (guru can request AI)", () => {
    expect(
      evaluasiAkses(defaults("guru", "permintaan_ai:buat"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  it("guru requesting draf_ai:verifikasi -> deny 'tidak_ada_izin' (AC#3: guru cannot self-verify)", () => {
    expect(
      evaluasiAkses(defaults("guru", "draf_ai:verifikasi"))
    ).toEqual({ diizinkan: false, sumber: "tidak_ada_izin" });
  });

  // kepala_sekolah verifies drafts (AC#3 approval gate).
  it("kepala_sekolah requesting draf_ai:verifikasi -> allow 'peran' (kepala verifies)", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "draf_ai:verifikasi"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  // pembatasan still wins (no superuser).
  it("kepala_sekolah requesting draf_ai:verifikasi WITH pembatasan=['draf_ai:verifikasi'] -> DENY 'pembatasan' (no superuser)", () => {
    expect(
      evaluasiAkses({
        roleSlug: "kepala_sekolah",
        diminta: "draf_ai:verifikasi",
        izinGrants: [],
        pembatasan: ["draf_ai:verifikasi"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });
});

describe("evaluasiAkses (#18) — impor/ekspor peserta_didik defaults", () => {
  // admin/dev get all three: read + manage import, read export.
  it.each<IzinSlug>([
    "impor_peserta_didik:baca",
    "impor_peserta_didik:kelola",
    "ekspor_peserta_didik:baca",
  ])(
    "admin_satuan_pendidikan requesting '%s' (no grants/restrictions) -> allow, sumber 'peran'",
    (slug) => {
      expect(
        evaluasiAkses(defaults("admin_satuan_pendidikan", slug))
      ).toEqual({ diizinkan: true, sumber: "peran" });
    }
  );

  it.each<IzinSlug>([
    "impor_peserta_didik:baca",
    "impor_peserta_didik:kelola",
    "ekspor_peserta_didik:baca",
  ])(
    "dev mirrors admin: requesting '%s' -> allow, sumber 'peran'",
    (slug) => {
      expect(evaluasiAkses(defaults("dev", slug))).toEqual({
        diizinkan: true,
        sumber: "peran",
      });
    }
  );

  // kepala_sekolah reads (oversight) — impor:baca + ekspor:baca; NOT kelola.
  it("kepala_sekolah requesting impor_peserta_didik:baca -> allow 'peran' (oversight)", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "impor_peserta_didik:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  it("kepala_sekolah requesting ekspor_peserta_didik:baca -> allow 'peran' (oversight)", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "ekspor_peserta_didik:baca"))
    ).toEqual({ diizinkan: true, sumber: "peran" });
  });

  it("kepala_sekolah requesting impor_peserta_didik:kelola -> deny 'tidak_ada_izin' (admin-only write)", () => {
    expect(
      evaluasiAkses(defaults("kepala_sekolah", "impor_peserta_didik:kelola"))
    ).toEqual({ diizinkan: false, sumber: "tidak_ada_izin" });
  });

  // guru / wali_kelas get NONE of the three (import/export is admin-scoped).
  it("guru requesting impor_peserta_didik:baca -> deny 'tidak_ada_izin' (no default)", () => {
    expect(
      evaluasiAkses(defaults("guru", "impor_peserta_didik:baca"))
    ).toEqual({ diizinkan: false, sumber: "tidak_ada_izin" });
  });

  it("wali_kelas requesting ekspor_peserta_didik:baca -> deny 'tidak_ada_izin' (no default)", () => {
    expect(
      evaluasiAkses(defaults("wali_kelas", "ekspor_peserta_didik:baca"))
    ).toEqual({ diizinkan: false, sumber: "tidak_ada_izin" });
  });

  // pembatasan still wins (no superuser).
  it("admin requesting ekspor_peserta_didik:baca WITH pembatasan -> DENY 'pembatasan'", () => {
    expect(
      evaluasiAkses({
        roleSlug: "admin_satuan_pendidikan",
        diminta: "ekspor_peserta_didik:baca",
        izinGrants: [],
        pembatasan: ["ekspor_peserta_didik:baca"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });
});

describe("evaluasiAkses (#13 T2) — eraport defaults (lifecycle Draf->Terbit->Revisi)", () => {
  // admin/dev get every eraport slug (full document lifecycle).
  it.each<IzinSlug>([
    "eraport:baca",
    "eraport:buat",
    "eraport:terbit",
    "eraport:revisi",
  ])(
    "admin_satuan_pendidikan requesting '%s' (no grants/restrictions) -> allow, sumber 'peran'",
    (slug) => {
      expect(
        evaluasiAkses(defaults("admin_satuan_pendidikan", slug))
      ).toEqual({ diizinkan: true, sumber: "peran" });
    }
  );

  it.each<IzinSlug>([
    "eraport:baca",
    "eraport:buat",
    "eraport:terbit",
    "eraport:revisi",
  ])(
    "dev mirrors admin: requesting '%s' -> allow, sumber 'peran'",
    (slug) => {
      expect(evaluasiAkses(defaults("dev", slug))).toEqual({
        diizinkan: true,
        sumber: "peran",
      });
    }
  );

  // guru creates drafts from Nilai Akhir (AC#1) + reads; no terbit/revisi.
  it("guru requesting eraport:buat -> allow 'peran' (guru creates report drafts)", () => {
    expect(evaluasiAkses(defaults("guru", "eraport:buat"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("guru requesting eraport:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("guru", "eraport:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("guru requesting eraport:terbit -> deny 'tidak_ada_izin' (guru cannot publish)", () => {
    expect(evaluasiAkses(defaults("guru", "eraport:terbit"))).toEqual({
      diizinkan: false,
      sumber: "tidak_ada_izin",
    });
  });

  // kepala_sekolah publishes (terbit) reports; no buat/revisi.
  it("kepala_sekolah requesting eraport:terbit -> allow 'peran' (kepala publishes)", () => {
    expect(evaluasiAkses(defaults("kepala_sekolah", "eraport:terbit"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("kepala_sekolah requesting eraport:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("kepala_sekolah", "eraport:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("kepala_sekolah requesting eraport:buat -> deny 'tidak_ada_izin' (no create default)", () => {
    expect(evaluasiAkses(defaults("kepala_sekolah", "eraport:buat"))).toEqual({
      diizinkan: false,
      sumber: "tidak_ada_izin",
    });
  });

  // wali_kelas reads homeroom reports only.
  it("wali_kelas requesting eraport:baca -> allow 'peran'", () => {
    expect(evaluasiAkses(defaults("wali_kelas", "eraport:baca"))).toEqual({
      diizinkan: true,
      sumber: "peran",
    });
  });

  it("wali_kelas requesting eraport:buat -> deny 'tidak_ada_izin' (read only)", () => {
    expect(evaluasiAkses(defaults("wali_kelas", "eraport:buat"))).toEqual({
      diizinkan: false,
      sumber: "tidak_ada_izin",
    });
  });

  // pembatasan still wins (no superuser).
  it("admin requesting eraport:revisi WITH pembatasan=['eraport:revisi'] -> DENY 'pembatasan' (no superuser)", () => {
    expect(
      evaluasiAkses({
        roleSlug: "admin_satuan_pendidikan",
        diminta: "eraport:revisi",
        izinGrants: [],
        pembatasan: ["eraport:revisi"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });
});

describe("evaluasiAkses (#16 T2) — bank_soal + paket_soal defaults", () => {
  // admin/dev get every new slug (full question-bank + package CRUD).
  it.each<IzinSlug>([
    "bank_soal:baca",
    "bank_soal:buat",
    "bank_soal:ubah",
    "paket_soal:baca",
    "paket_soal:buat",
    "paket_soal:ubah",
  ])(
    "admin_satuan_pendidikan requesting '%s' (no grants/restrictions) -> allow, sumber 'peran'",
    (slug) => {
      expect(
        evaluasiAkses(defaults("admin_satuan_pendidikan", slug))
      ).toEqual({ diizinkan: true, sumber: "peran" });
    }
  );

  it.each<IzinSlug>([
    "bank_soal:baca",
    "bank_soal:buat",
    "bank_soal:ubah",
    "paket_soal:baca",
    "paket_soal:buat",
    "paket_soal:ubah",
  ])(
    "dev mirrors admin: requesting '%s' -> allow, sumber 'peran'",
    (slug) => {
      expect(evaluasiAkses(defaults("dev", slug))).toEqual({
        diizinkan: true,
        sumber: "peran",
      });
    }
  );

  // AC#1 — guru authors question items and assembles packages (all six).
  it.each<IzinSlug>([
    "bank_soal:baca",
    "bank_soal:buat",
    "bank_soal:ubah",
    "paket_soal:baca",
    "paket_soal:buat",
    "paket_soal:ubah",
  ])(
    "guru requesting '%s' -> allow 'peran' (guru authors + assembles)",
    (slug) => {
      expect(evaluasiAkses(defaults("guru", slug))).toEqual({
        diizinkan: true,
        sumber: "peran",
      });
    }
  );

  // wali_kelas / kepala_sekolah are read-only on both surfaces.
  it.each<[RoleSlug, IzinSlug]>([
    ["wali_kelas", "bank_soal:baca"],
    ["wali_kelas", "paket_soal:baca"],
    ["kepala_sekolah", "bank_soal:baca"],
    ["kepala_sekolah", "paket_soal:baca"],
  ])(
    "%s requesting '%s' -> allow 'peran' (read-only oversight)",
    (role, slug) => {
      expect(evaluasiAkses(defaults(role, slug))).toEqual({
        diizinkan: true,
        sumber: "peran",
      });
    }
  );

  it.each<[RoleSlug, IzinSlug]>([
    ["wali_kelas", "bank_soal:buat"],
    ["wali_kelas", "paket_soal:buat"],
    ["kepala_sekolah", "bank_soal:buat"],
    ["kepala_sekolah", "paket_soal:buat"],
    ["wali_kelas", "bank_soal:ubah"],
    ["kepala_sekolah", "paket_soal:ubah"],
  ])(
    "%s requesting '%s' -> deny 'tidak_ada_izin' (read-only — no writes)",
    (role, slug) => {
      expect(evaluasiAkses(defaults(role, slug))).toEqual({
        diizinkan: false,
        sumber: "tidak_ada_izin",
      });
    }
  );

  // pembatasan still wins (no superuser).
  it("guru requesting bank_soal:buat WITH pembatasan=['bank_soal:buat'] -> DENY 'pembatasan' (no superuser)", () => {
    expect(
      evaluasiAkses({
        roleSlug: "guru",
        diminta: "bank_soal:buat",
        izinGrants: [],
        pembatasan: ["bank_soal:buat"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });

  it("admin requesting paket_soal:ubah WITH pembatasan=['paket_soal:ubah'] -> DENY 'pembatasan' (no superuser)", () => {
    expect(
      evaluasiAkses({
        roleSlug: "admin_satuan_pendidikan",
        diminta: "paket_soal:ubah",
        izinGrants: [],
        pembatasan: ["paket_soal:ubah"],
      })
    ).toEqual({ diizinkan: false, sumber: "pembatasan" });
  });
});
