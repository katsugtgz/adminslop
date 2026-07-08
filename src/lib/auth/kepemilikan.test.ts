import { describe, expect, it, vi } from "vitest";

import { dbSchema, type Tx } from "@/db/client";
import type { Pengguna } from "@/db/schema";

import { evaluasiAkses, type KeputusanAkses } from "./otorisasi";
import {
  assertPemilikBeban,
  assertPemilikPermintaan,
  assertPemilikRombongan,
  bebanIdDariKomponen,
  bebanIdDariNilai,
  bebanIdDariPenilaian,
  KepemilikanError,
  rombonganBelajarIdDariAbsensi,
  type AksesAktif,
} from "./kepemilikan";
import type { IzinSlug, RoleSlug } from "./types";

// --- mock tx ---------------------------------------------------------------
// kepemilikan.ts is a pure module that takes `tx: Tx` as a parameter. We mock
// the tx at this boundary (the I/O seam), not internal functions. The mock
// supports only `select().from(table).where()` — the sole query pattern in
// kepemilikan.ts. The `.where()` returns ALL seeded rows for the table; the
// internal `.find()` filters in kepemilikan.ts handle the actual matching.

/**
 * Build a mock tx backed by a Map<table, rows>. The cast is necessary because
 * `Tx` (a Drizzle transaction handle) has dozens of methods we don't use; we
 * only need `select().from().where()`. The mock's behaviour is verified by the
 * test assertions, not by the type system.
 */
function makeMockTx(rows: Map<unknown, unknown[]>): Tx {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => rows.get(table) ?? [],
      }),
    }),
  } as unknown as Tx;
}

// --- akses helpers ---------------------------------------------------------

/** Build a realistic AksesAktif whose `boleh()` uses the real evaluasiAkses. */
function makeAksesAktif(
  roleSlug: RoleSlug,
  opts?: { ptkId?: string | null; izin?: IzinSlug[]; pembatasan?: IzinSlug[] },
): AksesAktif {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const ptkId = opts?.ptkId ?? null;
  const pengguna: Pengguna | null = ptkId
    ? {
        id: "pg_AUT_1",
        tenantId: "org_AUT_a",
        userId: "workos_u_AUT",
        peranAkses: roleSlug,
        ptkId,
        nama: "Guru AUT Test",
        dibuatPada: new Date("2026-01-01T00:00:00Z"),
      }
    : null;
  const boleh = (diminta: IzinSlug): KeputusanAkses =>
    evaluasiAkses({ roleSlug, diminta, izinGrants: izin, pembatasan });
  return {
    status: "active",
    membership: { orgId: "org_AUT_a", orgName: "Sekolah AUT A", roleSlug },
    userId: "workos_u_AUT",
    pengguna,
    izin,
    pembatasan,
    boleh,
  };
}

// ===========================================================================
// KepemilikanError — error class contract
// ===========================================================================

describe("KepemilikanError", () => {
  it("is an Error subclass (enables instanceof checks at call sites)", () => {
    const err = new KepemilikanError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(KepemilikanError);
  });

  it("has name 'KepemilikanError'", () => {
    const err = new KepemilikanError("test");
    expect(err.name).toBe("KepemilikanError");
  });

  it("carries the Bahasa Indonesia message verbatim", () => {
    const msg = "Anda tidak memiliki izin untuk Beban Mengajar ini.";
    const err = new KepemilikanError(msg);
    expect(err.message).toBe(msg);
  });
});

// ===========================================================================
// assertPemilikBeban — ownership gate for Beban Mengajar
// ===========================================================================

describe("assertPemilikBeban — admin short-circuit", () => {
  it("admin (akses:kelola) bypasses ownership check — no DB hit, no resolver call", async () => {
    // Empty row store — admin should never touch the DB.
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const admin = makeAksesAktif("admin_satuan_pendidikan", { ptkId: null });
    const resolver = vi.fn(async () => "beban_AUT_1");

    await assertPemilikBeban(tx, admin, resolver);

    expect(resolver).not.toHaveBeenCalled();
  });

  it("admin with no linked PTK still passes (admin manages school-wide)", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const admin = makeAksesAktif("admin_satuan_pendidikan", { ptkId: null });
    await assertPemilikBeban(tx, admin, async () => "beban_any");
    // no throw = pass
  });

  it("dev role (akses:kelola by default) also short-circuits", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const dev = makeAksesAktif("dev", { ptkId: null });
    const resolver = vi.fn(async () => "beban_AUT_1");
    await assertPemilikBeban(tx, dev, resolver);
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("assertPemilikBeban — guru ownership", () => {
  it("owner passes — beban.ptkId === akses.pengguna.ptkId", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.bebanMengajar,
        [
          {
            id: "beban_AUT_1",
            ptkId: "ptk_mine",
            rombonganBelajarId: "rombel_1",
            tenantId: "org_AUT_a",
          },
        ],
      ],
    ]);
    const tx = makeMockTx(rows);
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await assertPemilikBeban(tx, guru, async () => "beban_AUT_1");
    // no throw = pass
  });

  it("non-owner throws KepemilikanError (beban.ptkId !== my ptkId)", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.bebanMengajar,
        [
          {
            id: "beban_AUT_1",
            ptkId: "ptk_other",
            rombonganBelajarId: "rombel_1",
            tenantId: "org_AUT_a",
          },
        ],
      ],
    ]);
    const tx = makeMockTx(rows);
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await expect(
      assertPemilikBeban(tx, guru, async () => "beban_AUT_1"),
    ).rejects.toThrow(KepemilikanError);
  });

  it("non-owner error message is in Bahasa Indonesia", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.bebanMengajar,
        [{ id: "beban_AUT_1", ptkId: "ptk_other", rombonganBelajarId: "r1", tenantId: "org_AUT_a" }],
      ],
    ]);
    const tx = makeMockTx(rows);
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await expect(
      assertPemilikBeban(tx, guru, async () => "beban_AUT_1"),
    ).rejects.toThrow(/tidak memiliki izin untuk Beban Mengajar/i);
  });

  it("guru without linked PTK is refused outright", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", { ptkId: null });

    await expect(
      assertPemilikBeban(tx, guru, async () => "beban_AUT_1"),
    ).rejects.toThrow(KepemilikanError);
  });

  it("guru without linked PTK error mentions PTK in Bahasa Indonesia", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", { ptkId: null });

    await expect(
      assertPemilikBeban(tx, guru, async () => "beban_AUT_1"),
    ).rejects.toThrow(/belum terhubung dengan PTK/i);
  });

  it("missing beban (cross-tenant / bogus id) throws KepemilikanError", async () => {
    // No beban rows seeded — simulates RLS cross-tenant denial or missing id.
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await expect(
      assertPemilikBeban(tx, guru, async () => "beban_missing"),
    ).rejects.toThrow(KepemilikanError);
  });

  it("resolver is called lazily (only when not admin)", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.bebanMengajar,
        [{ id: "beban_AUT_1", ptkId: "ptk_mine", rombonganBelajarId: "r1", tenantId: "org_AUT_a" }],
      ],
    ]);
    const tx = makeMockTx(rows);
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });
    const resolver = vi.fn(async () => "beban_AUT_1");

    await assertPemilikBeban(tx, guru, resolver);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith();
  });
});

// ===========================================================================
// assertPemilikRombongan — ownership gate for Rombongan Belajar
// ===========================================================================

describe("assertPemilikRombongan — admin short-circuit", () => {
  it("admin (akses:kelola) bypasses ownership check — no DB hit, no resolver", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const admin = makeAksesAktif("admin_satuan_pendidikan", { ptkId: null });
    const resolver = vi.fn(async () => "rombel_AUT_1");

    await assertPemilikRombongan(tx, admin, resolver);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("dev role also short-circuits", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const dev = makeAksesAktif("dev", { ptkId: null });
    await assertPemilikRombongan(tx, dev, async () => "rombel_any");
    // no throw = pass
  });
});

describe("assertPemilikRombongan — guru ownership via beban_mengajar", () => {
  it("owner with beban_mengajar assignment passes", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.bebanMengajar,
        [
          {
            id: "beban_AUT_1",
            ptkId: "ptk_mine",
            rombonganBelajarId: "rombel_AUT_1",
            tenantId: "org_AUT_a",
          },
        ],
      ],
      // wali_kelas has no matching row — beban is the matching assignment.
      [dbSchema.waliKelas, []],
      [dbSchema.rombonganBelajar, [{ id: "rombel_AUT_1", tenantId: "org_AUT_a" }]],
    ]);
    const tx = makeMockTx(rows);
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await assertPemilikRombongan(tx, guru, async () => "rombel_AUT_1");
    // no throw = pass
  });
});

describe("assertPemilikRombongan — guru ownership via wali_kelas", () => {
  it("owner with wali_kelas assignment (no beban) passes", async () => {
    const rows = new Map<unknown, unknown[]>([
      // No beban_mengajar row matching this (rombel, ptk).
      [dbSchema.bebanMengajar, []],
      [
        dbSchema.waliKelas,
        [
          {
            id: "wali_AUT_1",
            ptkId: "ptk_mine",
            rombonganBelajarId: "rombel_AUT_1",
            tenantId: "org_AUT_a",
          },
        ],
      ],
      [dbSchema.rombonganBelajar, [{ id: "rombel_AUT_1", tenantId: "org_AUT_a" }]],
    ]);
    const tx = makeMockTx(rows);
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await assertPemilikRombongan(tx, guru, async () => "rombel_AUT_1");
    // no throw = pass
  });
});

describe("assertPemilikRombongan — non-owner denial", () => {
  it("guru with no assignment to the rombel throws KepemilikanError", async () => {
    const rows = new Map<unknown, unknown[]>([
      // beban_mengajar exists but belongs to a different ptk.
      [
        dbSchema.bebanMengajar,
        [
          {
            id: "beban_other",
            ptkId: "ptk_other",
            rombonganBelajarId: "rombel_AUT_1",
            tenantId: "org_AUT_a",
          },
        ],
      ],
      // wali_kelas exists but belongs to a different ptk.
      [
        dbSchema.waliKelas,
        [
          {
            id: "wali_other",
            ptkId: "ptk_other",
            rombonganBelajarId: "rombel_AUT_1",
            tenantId: "org_AUT_a",
          },
        ],
      ],
      [dbSchema.rombonganBelajar, [{ id: "rombel_AUT_1", tenantId: "org_AUT_a" }]],
    ]);
    const tx = makeMockTx(rows);
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await expect(
      assertPemilikRombongan(tx, guru, async () => "rombel_AUT_1"),
    ).rejects.toThrow(KepemilikanError);
  });

  it("non-owner error message is in Bahasa Indonesia", async () => {
    const rows = new Map<unknown, unknown[]>([
      [dbSchema.bebanMengajar, []],
      [dbSchema.waliKelas, []],
      [dbSchema.rombonganBelajar, [{ id: "rombel_AUT_1", tenantId: "org_AUT_a" }]],
    ]);
    const tx = makeMockTx(rows);
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await expect(
      assertPemilikRombongan(tx, guru, async () => "rombel_AUT_1"),
    ).rejects.toThrow(/tidak memiliki izin untuk Rombongan Belajar/i);
  });

  it("guru without linked PTK is refused outright", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", { ptkId: null });

    await expect(
      assertPemilikRombongan(tx, guru, async () => "rombel_AUT_1"),
    ).rejects.toThrow(/belum terhubung dengan PTK/i);
  });

  it("missing rombel (cross-tenant / bogus id) throws (no assignment rows match)", async () => {
    const rows = new Map<unknown, unknown[]>([
      [dbSchema.bebanMengajar, []],
      [dbSchema.waliKelas, []],
      // rombongan_belajar row exists (within tenant), but no assignment.
      [dbSchema.rombonganBelajar, [{ id: "rombel_AUT_1", tenantId: "org_AUT_a" }]],
    ]);
    const tx = makeMockTx(rows);
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await expect(
      assertPemilikRombongan(tx, guru, async () => "rombel_AUT_missing"),
    ).rejects.toThrow(KepemilikanError);
  });
});

// ===========================================================================
// assertPemilikPermintaan — per-user ownership gate (Permintaan AI surface).
//
// Unlike Beban/Rombongan (PTK-owned), a permintaan_ai is per-user:
// row.dibuatOleh === akses.userId. The gate trusts the caller-supplied
// resolver for the owner value (the caller pre-loads the row for status
// checks). Admin (`akses:kelola`) short-circuits without resolving.
// ===========================================================================

describe("assertPemilikPermintaan — admin short-circuit", () => {
  it("admin (akses:kelola) bypasses ownership check — no resolver call", async () => {
    // Empty row store — admin should never read the row.
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const admin = makeAksesAktif("admin_satuan_pendidikan", { ptkId: null });
    const resolver = vi.fn(async () => "workos_u_other");

    await assertPemilikPermintaan(tx, admin, resolver);

    expect(resolver).not.toHaveBeenCalled();
  });

  it("dev role (akses:kelola by default) also short-circuits", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const dev = makeAksesAktif("dev", { ptkId: null });
    const resolver = vi.fn(async () => "workos_u_other");

    await assertPemilikPermintaan(tx, dev, resolver);

    expect(resolver).not.toHaveBeenCalled();
  });

  it("guru granted akses:kelola via izin short-circuits (bypass keyed on permission, not role)", async () => {
    // The bypass is `akses.boleh('akses:kelola')`, not a role-name check. A
    // guru carrying an explicit akses:kelola grant therefore bypasses too.
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", {
      ptkId: "ptk_mine",
      izin: ["akses:kelola"],
    });
    const resolver = vi.fn(async () => "workos_u_other");

    await assertPemilikPermintaan(tx, guru, resolver);

    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("assertPemilikPermintaan — user ownership", () => {
  it("owner passes — dibuatOleh === akses.userId", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });
    // makeAksesAktif sets userId: "workos_u_AUT".
    await assertPemilikPermintaan(tx, guru, async () => "workos_u_AUT");
    // no throw = pass
  });

  it("non-owner throws KepemilikanError (dibuatOleh !== my userId)", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await expect(
      assertPemilikPermintaan(tx, guru, async () => "workos_u_other"),
    ).rejects.toThrow(KepemilikanError);
  });

  it("non-owner error message is in Bahasa Indonesia", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await expect(
      assertPemilikPermintaan(tx, guru, async () => "workos_u_other"),
    ).rejects.toThrow(/tidak memiliki izin untuk Permintaan AI/i);
  });

  it("missing permintaan (resolver throws) propagates KepemilikanError, not swallowed", async () => {
    // The caller pre-loads the row; a missing/cross-tenant id makes the
    // resolver throw. The gate must propagate that, never swallow it.
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });

    await expect(
      assertPemilikPermintaan(tx, guru, async () => {
        throw new KepemilikanError("Permintaan AI tidak ditemukan.");
      }),
    ).rejects.toThrow(/Permintaan AI tidak ditemukan/i);
  });

  it("resolver is called lazily (only when not admin)", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    const guru = makeAksesAktif("guru", { ptkId: "ptk_mine" });
    const resolver = vi.fn(async () => "workos_u_AUT");

    await assertPemilikPermintaan(tx, guru, resolver);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith();
  });
});

// ===========================================================================
// Chain resolvers — komponen_nilai -> beban, penilaian -> komponen -> beban,
// nilai -> penilaian -> komponen -> beban, absensi -> rombongan.
// ===========================================================================

describe("bebanIdDariKomponen — komponen_nilai(id) -> beban_mengajar id", () => {
  it("resolves bebanMengajarId from a found komponen_nilai", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.komponenNilai,
        [
          { id: "komp_AUT_1", bebanMengajarId: "beban_AUT_1", tenantId: "org_AUT_a" },
        ],
      ],
    ]);
    const tx = makeMockTx(rows);

    const bebanId = await bebanIdDariKomponen(tx, "komp_AUT_1");
    expect(bebanId).toBe("beban_AUT_1");
  });

  it("throws KepemilikanError when komponen_nilai not found (Bahasa Indonesia)", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    await expect(bebanIdDariKomponen(tx, "komp_missing")).rejects.toThrow(
      /Komponen Nilai tidak ditemukan/i,
    );
  });

  it("throws KepemilikanError (not a generic Error)", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    await expect(bebanIdDariKomponen(tx, "komp_missing")).rejects.toBeInstanceOf(
      KepemilikanError,
    );
  });
});

describe("bebanIdDariPenilaian — penilaian(id) -> komponen -> beban", () => {
  it("resolves bebanMengajarId through the penilaian -> komponen chain", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.penilaian,
        [
          { id: "pen_AUT_1", komponenNilaiId: "komp_AUT_1", tenantId: "org_AUT_a" },
        ],
      ],
      [
        dbSchema.komponenNilai,
        [
          { id: "komp_AUT_1", bebanMengajarId: "beban_AUT_1", tenantId: "org_AUT_a" },
        ],
      ],
    ]);
    const tx = makeMockTx(rows);

    const bebanId = await bebanIdDariPenilaian(tx, "pen_AUT_1");
    expect(bebanId).toBe("beban_AUT_1");
  });

  it("throws KepemilikanError when penilaian not found", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    await expect(bebanIdDariPenilaian(tx, "pen_missing")).rejects.toThrow(
      /Penilaian tidak ditemukan/i,
    );
  });

  it("throws KepemilikanError when penilaian exists but komponen missing", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.penilaian,
        [{ id: "pen_AUT_1", komponenNilaiId: "komp_missing", tenantId: "org_AUT_a" }],
      ],
      [dbSchema.komponenNilai, []],
    ]);
    const tx = makeMockTx(rows);
    await expect(bebanIdDariPenilaian(tx, "pen_AUT_1")).rejects.toThrow(
      /Komponen Nilai tidak ditemukan/i,
    );
  });
});

describe("bebanIdDariNilai — nilai(id) -> penilaian -> komponen -> beban", () => {
  it("resolves bebanMengajarId through the full 3-hop chain", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.nilaiPesertaDidik,
        [
          { id: "nilai_AUT_1", penilaianId: "pen_AUT_1", tenantId: "org_AUT_a" },
        ],
      ],
      [
        dbSchema.penilaian,
        [
          { id: "pen_AUT_1", komponenNilaiId: "komp_AUT_1", tenantId: "org_AUT_a" },
        ],
      ],
      [
        dbSchema.komponenNilai,
        [
          { id: "komp_AUT_1", bebanMengajarId: "beban_AUT_1", tenantId: "org_AUT_a" },
        ],
      ],
    ]);
    const tx = makeMockTx(rows);

    const bebanId = await bebanIdDariNilai(tx, "nilai_AUT_1");
    expect(bebanId).toBe("beban_AUT_1");
  });

  it("throws KepemilikanError when nilai not found", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    await expect(bebanIdDariNilai(tx, "nilai_missing")).rejects.toThrow(
      /Nilai tidak ditemukan/i,
    );
  });

  it("throws KepemilikanError when nilai exists but penilaian missing", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.nilaiPesertaDidik,
        [{ id: "nilai_AUT_1", penilaianId: "pen_missing", tenantId: "org_AUT_a" }],
      ],
      [dbSchema.penilaian, []],
    ]);
    const tx = makeMockTx(rows);
    await expect(bebanIdDariNilai(tx, "nilai_AUT_1")).rejects.toThrow(
      /Penilaian tidak ditemukan/i,
    );
  });
});

describe("rombonganBelajarIdDariAbsensi — absensi(id) -> rombongan", () => {
  it("resolves rombonganBelajarId from a found absensi row", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.absensiHarian,
        [
          { id: "abs_AUT_1", rombonganBelajarId: "rombel_AUT_1", tenantId: "org_AUT_a" },
        ],
      ],
    ]);
    const tx = makeMockTx(rows);

    const rombelId = await rombonganBelajarIdDariAbsensi(tx, "abs_AUT_1");
    expect(rombelId).toBe("rombel_AUT_1");
  });

  it("throws KepemilikanError when absensi not found (Bahasa Indonesia)", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    await expect(rombonganBelajarIdDariAbsensi(tx, "abs_missing")).rejects.toThrow(
      /Absensi tidak ditemukan/i,
    );
  });

  it("throws KepemilikanError when rombonganBelajarId is null", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        dbSchema.absensiHarian,
        [{ id: "abs_AUT_1", rombonganBelajarId: null, tenantId: "org_AUT_a" }],
      ],
    ]);
    const tx = makeMockTx(rows);
    await expect(rombonganBelajarIdDariAbsensi(tx, "abs_AUT_1")).rejects.toThrow(
      /tidak terhubung dengan Rombongan Belajar/i,
    );
  });

  it("throws KepemilikanError (not a generic Error) when not found", async () => {
    const tx = makeMockTx(new Map<unknown, unknown[]>());
    await expect(
      rombonganBelajarIdDariAbsensi(tx, "abs_missing"),
    ).rejects.toBeInstanceOf(KepemilikanError);
  });
});
