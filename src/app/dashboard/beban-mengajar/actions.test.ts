import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors the idiom in src/app/dashboard/akses/actions.test.ts: hoist all
// mocks, mock the modules to wire them in, then import the actions under test.

const mocks = vi.hoisted(() => {
  const fakeTxLocal = { __tx: true };
  const taAktifRow = {
    id: "ta_2025",
    tenantId: "org_A",
    nama: "2025/2026",
    aktif: true,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  };
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    // withTenant runs the callback with fakeTx so repo fns receive it.
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTxLocal)
    ),
    catatAudit: vi.fn(
      async (
        _tx: unknown,
        _entry: {
          aktor: string;
          aksi: string;
          target?: string;
          beban?: unknown;
        }
      ) => undefined
    ),
    // beban-mengajar repos
    buatBebanMengajar: vi.fn(
      async (
        _tx: unknown,
        input: { ptkId: string; mataPelajaranId: string }
      ) => ({
        id: "bm_new",
        tenantId: "org_A",
        ptkId: input.ptkId,
        mataPelajaranId: input.mataPelajaranId,
        rombonganBelajarId: null,
        tingkatId: null,
        tahunAjaranId: "ta_2025",
        semester: "ganjil",
        dibuatPada: new Date("2026-01-01T00:00:00Z"),
      })
    ),
    ubahBebanMengajar: vi.fn(async (_tx: unknown, id: string) => ({
      id,
      tenantId: "org_A",
      ptkId: "ptk_1",
      mataPelajaranId: "map_1",
      rombonganBelajarId: null,
      tingkatId: null,
      tahunAjaranId: "ta_2025",
      semester: "ganjil",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    })),
    hapusBebanMengajar: vi.fn(async () => undefined),
    // wali-kelas repos
    upsertWaliKelas: vi.fn(
      async (
        _tx: unknown,
        input: { ptkId: string; rombonganBelajarId: string }
      ) => ({
        id: "wk_new",
        tenantId: "org_A",
        ptkId: input.ptkId,
        rombonganBelajarId: input.rombonganBelajarId,
        tahunAjaranId: "ta_2025",
        semester: "ganjil",
        dibuatOleh: "workos_u_1",
        dibuatPada: new Date("2026-01-01T00:00:00Z"),
      })
    ),
    hapusWaliKelas: vi.fn(async () => undefined),
    // tahun-ajaran repos (AC#4 — server-side active period resolution).
    // Explicit return annotation keeps the mock nullable so group E's
    // mockResolvedValue(null) type-checks; without it TS would infer non-null.
    getTahunAjaranAktif: vi.fn(
      async (): Promise<typeof taAktifRow | null> => taAktifRow
    ),
    getSemesterAktif: vi.fn(
      async (): Promise<"ganjil" | "genap" | null> => "ganjil"
    ),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  buatBebanMengajar,
  ubahBebanMengajar,
  hapusBebanMengajar,
  upsertWaliKelas,
  hapusWaliKelas,
  getTahunAjaranAktif,
  getSemesterAktif,
  revalidatePath,
  fakeTx: fakeTxRef,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/beban-mengajar", () => ({
  buatBebanMengajar: mocks.buatBebanMengajar,
  ubahBebanMengajar: mocks.ubahBebanMengajar,
  hapusBebanMengajar: mocks.hapusBebanMengajar,
}));
vi.mock("@/db/queries/wali-kelas", () => ({
  upsertWaliKelas: mocks.upsertWaliKelas,
  hapusWaliKelas: mocks.hapusWaliKelas,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  getSemesterAktif: mocks.getSemesterAktif,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  hapusBebanMengajarAction,
  hapusWaliKelasAction,
  simpanBebanMengajarBaruAction,
  ubahBebanMengajarAction,
  upsertWaliKelasAction,
} from "./actions";

// --- helpers ---------------------------------------------------------------

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

/** `expect.anything()` stand-in for the fakeTx passed as the first repo arg. */
const TX = expect.anything();

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default) so the tests are
 * realistic. Defaults extended to cover beban_mengajar:* + wali_kelas:* slugs.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "beban_mengajar:baca",
      "beban_mengajar:buat",
      "beban_mengajar:ubah",
      "wali_kelas:baca",
      "wali_kelas:buat",
      "wali_kelas:ubah",
    ],
    dev: [
      "beban_mengajar:baca",
      "beban_mengajar:buat",
      "beban_mengajar:ubah",
      "wali_kelas:baca",
      "wali_kelas:buat",
      "wali_kelas:ubah",
    ],
    kepala_sekolah: ["beban_mengajar:baca", "wali_kelas:baca"],
    guru: ["beban_mengajar:baca", "wali_kelas:baca"],
    wali_kelas: ["beban_mengajar:baca", "wali_kelas:baca"],
  };
  const boleh = (diminta: IzinSlug): KeputusanAkses => {
    if (pembatasan.includes(diminta))
      return { diizinkan: false, sumber: "pembatasan" as const };
    if (izin.includes(diminta))
      return { diizinkan: true, sumber: "izin" as const };
    if (defaults[roleSlug].includes(diminta))
      return { diizinkan: true, sumber: "peran" as const };
    return { diizinkan: false, sumber: "tidak_ada_izin" as const };
  };
  return {
    status: "active",
    membership: { orgId: "org_A", orgName: "Sekolah A", roleSlug },
    userId: "workos_u_1",
    pengguna: null,
    izin,
    pembatasan,
    boleh,
  };
}

beforeEach(() => {
  getAksesSaya.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  buatBebanMengajar.mockReset();
  ubahBebanMengajar.mockReset();
  hapusBebanMengajar.mockReset();
  upsertWaliKelas.mockReset();
  hapusWaliKelas.mockReset();
  getTahunAjaranAktif.mockReset();
  getSemesterAktif.mockReset();
  revalidatePath.mockReset();
  // restore default implementations cleared by mockReset
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(
    async (
      _db: unknown,
      _tenantId: unknown,
      fn: (tx: unknown) => Promise<unknown>
    ) => fn(fakeTxRef)
  );
  buatBebanMengajar.mockImplementation(
    async (_tx: unknown, input: { ptkId: string; mataPelajaranId: string }) => ({
      id: "bm_new",
      tenantId: "org_A",
      ptkId: input.ptkId,
      mataPelajaranId: input.mataPelajaranId,
      rombonganBelajarId: null,
      tingkatId: null,
      tahunAjaranId: "ta_2025",
      semester: "ganjil",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    })
  );
  ubahBebanMengajar.mockImplementation(async (_tx: unknown, id: string) => ({
    id,
    tenantId: "org_A",
    ptkId: "ptk_1",
    mataPelajaranId: "map_1",
    rombonganBelajarId: null,
    tingkatId: null,
    tahunAjaranId: "ta_2025",
    semester: "ganjil",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  }));
  hapusBebanMengajar.mockResolvedValue(undefined);
  upsertWaliKelas.mockImplementation(
    async (
      _tx: unknown,
      input: { ptkId: string; rombonganBelajarId: string }
    ) => ({
      id: "wk_new",
      tenantId: "org_A",
      ptkId: input.ptkId,
      rombonganBelajarId: input.rombonganBelajarId,
      tahunAjaranId: "ta_2025",
      semester: "ganjil",
      dibuatOleh: "workos_u_1",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    })
  );
  hapusWaliKelas.mockResolvedValue(undefined);
  getTahunAjaranAktif.mockResolvedValue({
    id: "ta_2025",
    tenantId: "org_A",
    nama: "2025/2026",
    aktif: true,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  });
  getSemesterAktif.mockResolvedValue("ganjil");
  catatAudit.mockResolvedValue(undefined);
});

// ===========================================================================
// A. Authorization denial (guru) — core security: action throws BEFORE any DB.
// guru has only :baca slugs (read-only); every write action below MUST refuse.
// ===========================================================================

describe("A. authorization denial — guru role (baca-only)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("1. simpanBebanMengajarBaruAction -> throws /izin/i; repo + audit + withTenant NOT called", async () => {
    await expect(
      simpanBebanMengajarBaruAction(
        formData({ ptkId: "ptk_1", mataPelajaranId: "map_1", rombonganBelajarId: "rb_1" })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatBebanMengajar).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. ubahBebanMengajarAction -> throws /izin/i; repo NOT called", async () => {
    await expect(
      ubahBebanMengajarAction(formData({ id: "bm_1", ptkId: "ptk_2" }))
    ).rejects.toThrow(/izin/i);
    expect(ubahBebanMengajar).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("3. hapusBebanMengajarAction -> throws /izin/i; repo NOT called", async () => {
    await expect(
      hapusBebanMengajarAction(formData({ id: "bm_1" }))
    ).rejects.toThrow(/izin/i);
    expect(hapusBebanMengajar).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("4. upsertWaliKelasAction -> throws /izin/i; repo NOT called", async () => {
    await expect(
      upsertWaliKelasAction(
        formData({ ptkId: "ptk_1", rombonganBelajarId: "rb_1" })
      )
    ).rejects.toThrow(/izin/i);
    expect(upsertWaliKelas).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("5. hapusWaliKelasAction -> throws /izin/i; repo NOT called", async () => {
    await expect(
      hapusWaliKelasAction(formData({ id: "wk_1" }))
    ).rejects.toThrow(/izin/i);
    expect(hapusWaliKelas).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Authorization success (admin_satuan_pendidikan) — DB write + audit happen.
// AC#4: simpanBebanMengajarBaru + upsertWaliKelas resolve TA+semester SERVER-SIDE.
// ===========================================================================

describe("B. authorization success — admin_satuan_pendidikan", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("6. simpanBebanMengajarBaruAction -> buatBebanMengajar + audit(buat_beban_mengajar); getTahunAjaranAktif + getSemesterAktif called server-side", async () => {
    await simpanBebanMengajarBaruAction(
      formData({
        ptkId: "ptk_1",
        mataPelajaranId: "map_1",
        rombonganBelajarId: "rb_1",
      })
    );
    // AC#4: active TA + semester resolved SERVER-SIDE (inside withTenant tx).
    expect(getTahunAjaranAktif).toHaveBeenCalledWith(fakeTxRef);
    expect(getSemesterAktif).toHaveBeenCalledWith(fakeTxRef);
    expect(buatBebanMengajar).toHaveBeenCalledWith(fakeTxRef, {
      ptkId: "ptk_1",
      mataPelajaranId: "map_1",
      rombonganBelajarId: "rb_1",
      tingkatId: null,
      tahunAjaranId: "ta_2025",
      semester: "ganjil",
    });
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_beban_mengajar",
        target: expect.stringMatching(/^beban_mengajar:/),
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/beban-mengajar");
  });

  it("7. ubahBebanMengajarAction -> ubahBebanMengajar(tx, id, input) + audit(ubah_beban_mengajar)", async () => {
    await ubahBebanMengajarAction(
      formData({ id: "bm_7", ptkId: "ptk_2" })
    );
    expect(ubahBebanMengajar).toHaveBeenCalledWith(
      fakeTxRef,
      "bm_7",
      expect.objectContaining({ ptkId: "ptk_2" })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "ubah_beban_mengajar",
        target: "beban_mengajar:bm_7",
      })
    );
  });

  it("8. hapusBebanMengajarAction -> hapusBebanMengajar(tx, id) + audit(hapus_beban_mengajar)", async () => {
    await hapusBebanMengajarAction(formData({ id: "bm_8" }));
    expect(hapusBebanMengajar).toHaveBeenCalledWith(fakeTxRef, "bm_8");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "hapus_beban_mengajar",
        target: "beban_mengajar:bm_8",
      })
    );
  });

  it("9. upsertWaliKelasAction -> upsertWaliKelas + audit(upsert_wali_kelas); getTahunAjaranAktif + getSemesterAktif called server-side; dibuatOleh=userId", async () => {
    await upsertWaliKelasAction(
      formData({ ptkId: "ptk_9", rombonganBelajarId: "rb_9" })
    );
    // AC#4: active TA + semester resolved SERVER-SIDE.
    expect(getTahunAjaranAktif).toHaveBeenCalledWith(fakeTxRef);
    expect(getSemesterAktif).toHaveBeenCalledWith(fakeTxRef);
    expect(upsertWaliKelas).toHaveBeenCalledWith(fakeTxRef, {
      ptkId: "ptk_9",
      rombonganBelajarId: "rb_9",
      tahunAjaranId: "ta_2025",
      semester: "ganjil",
      dibuatOleh: "workos_u_1",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "upsert_wali_kelas",
        target: expect.stringMatching(/^wali_kelas:/),
      })
    );
  });

  it("10. hapusWaliKelasAction -> hapusWaliKelas(tx, id) + audit(hapus_wali_kelas)", async () => {
    await hapusWaliKelasAction(formData({ id: "wk_10" }));
    expect(hapusWaliKelas).toHaveBeenCalledWith(fakeTxRef, "wk_10");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "hapus_wali_kelas",
        target: "wali_kelas:wk_10",
      })
    );
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary"
// These tests invoke the action DIRECTLY (no page, no button, no fetch guard).
// A client that bypasses the UI and POSTs raw FormData is STILL blocked
// server-side. This is acceptance criterion #5 of issue #10.
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("guru calling simpanBebanMengajarBaruAction directly (no UI) -> denied; no DB write; no audit", async () => {
    // The page would hide the form for guru, but a hostile client can bypass
    // the UI and POST the action fn directly. The server MUST still refuse —
    // the UI hiding is defense-in-depth, NOT the boundary.
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));

    await expect(
      simpanBebanMengajarBaruAction(
        formData({
          ptkId: "ptk_secret",
          mataPelajaranId: "map_1",
          rombonganBelajarId: "rb_1",
        })
      )
    ).rejects.toThrow(/izin/i);

    expect(buatBebanMengajar).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("admin calling simpanBebanMengajarBaruAction directly -> succeeds; DB write + audit happen", async () => {
    // Same direct call, but an admin IS authorized — proving the action
    // distinguishes by server-evaluated role, not by who clicked.
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await simpanBebanMengajarBaruAction(
      formData({
        ptkId: "ptk_secret",
        mataPelajaranId: "map_1",
        rombonganBelajarId: "rb_1",
      })
    );

    expect(buatBebanMengajar).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("admin WITH pembatasan['beban_mengajar:buat'] calling simpanBebanMengajarBaruAction -> DENIED (pembatasan wins, no superuser)", async () => {
    // identity doc §13: there is NO global superuser. An admin with an active
    // pembatasan_akses row for beban_mengajar:buat is STILL refused. The role
    // default does not override the restriction.
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", {
        pembatasan: ["beban_mengajar:buat"],
      })
    );

    await expect(
      simpanBebanMengajarBaruAction(
        formData({
          ptkId: "ptk_locked",
          mataPelajaranId: "map_1",
          rombonganBelajarId: "rb_1",
        })
      )
    ).rejects.toThrow(/izin/i);

    expect(buatBebanMengajar).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. XOR validation (AC#2) — exactly one of rombonganBelajarId / tingkatId.
// ===========================================================================

describe("D. XOR validation — rombonganBelajarId vs tingkatId", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("11. simpanBebanMengajarBaruAction with BOTH rombonganBelajarId + tingkatId -> throws 'Pilih salah satu'; repo NOT called", async () => {
    await expect(
      simpanBebanMengajarBaruAction(
        formData({
          ptkId: "ptk_1",
          mataPelajaranId: "map_1",
          rombonganBelajarId: "rb_1",
          tingkatId: "tg_1",
        })
      )
    ).rejects.toThrow(/Pilih salah satu/i);
    expect(buatBebanMengajar).not.toHaveBeenCalled();
  });

  it("12. simpanBebanMengajarBaruAction with NEITHER rombonganBelajarId nor tingkatId -> throws 'Pilih salah satu'; repo NOT called", async () => {
    await expect(
      simpanBebanMengajarBaruAction(
        formData({ ptkId: "ptk_1", mataPelajaranId: "map_1" })
      )
    ).rejects.toThrow(/Pilih salah satu/i);
    expect(buatBebanMengajar).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// E. No active period (AC#4) — server-side TA+semester resolution failures.
// ===========================================================================

describe("E. no active academic period", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("13. getTahunAjaranAktif returns null -> throws 'Belum ada Tahun Ajaran aktif'; repo NOT called", async () => {
    getTahunAjaranAktif.mockResolvedValue(null);

    await expect(
      simpanBebanMengajarBaruAction(
        formData({
          ptkId: "ptk_1",
          mataPelajaranId: "map_1",
          rombonganBelajarId: "rb_1",
        })
      )
    ).rejects.toThrow(/Belum ada Tahun Ajaran aktif/i);
    expect(buatBebanMengajar).not.toHaveBeenCalled();
  });

  it("14. getSemesterAktif returns null -> throws 'Belum ada Semester aktif'; repo NOT called", async () => {
    getSemesterAktif.mockResolvedValue(null);

    await expect(
      upsertWaliKelasAction(
        formData({ ptkId: "ptk_1", rombonganBelajarId: "rb_1" })
      )
    ).rejects.toThrow(/Belum ada Semester aktif/i);
    expect(upsertWaliKelas).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F. Non-active akses context (denied / choose).
// ===========================================================================

describe("F. non-active akses context", () => {
  it("15. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);

    await expect(
      simpanBebanMengajarBaruAction(
        formData({
          ptkId: "ptk_1",
          mataPelajaranId: "map_1",
          rombonganBelajarId: "rb_1",
        })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("16. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);

    await expect(
      hapusWaliKelasAction(formData({ id: "wk_1" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. dev role is admin-equivalent (scoped to seeded tenants — NOT a superuser).
// ===========================================================================

describe("G. dev role behaves like admin", () => {
  it("17. simpanBebanMengajarBaruAction with dev role -> succeeds (buatBebanMengajar + audit)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("dev"));

    await simpanBebanMengajarBaruAction(
      formData({
        ptkId: "ptk_dev",
        mataPelajaranId: "map_1",
        rombonganBelajarId: "rb_1",
      })
    );

    expect(buatBebanMengajar).toHaveBeenCalledWith(fakeTxRef, {
      ptkId: "ptk_dev",
      mataPelajaranId: "map_1",
      rombonganBelajarId: "rb_1",
      tingkatId: null,
      tahunAjaranId: "ta_2025",
      semester: "ganjil",
    });
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/beban-mengajar");
  });
});
