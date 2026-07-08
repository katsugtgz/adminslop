import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

const mocks = vi.hoisted(() => {
  // Mirror of the real KepemilikanError shape. The whole kepemilikan module
  // is mocked below (assertPemilikBeban is a vi.fn), so the real class is not
  // importable here. We re-declare the minimal subclass so the rejection test
  // can throw `new KepemilikanError(...)` and assert propagation faithfully.
  class KepemilikanError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "KepemilikanError";
    }
  }
  const fakeTxLocal = { __tx: true };
  return {
    getAksesSaya: vi.fn(),
    assertPemilikBeban: vi.fn(async () => undefined),
    KepemilikanError,
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTxLocal)
    ),
    catatAudit: vi.fn(async () => undefined),
    // eraport repos
    buatDrafEraport: vi.fn(
      async (_tx: unknown, _input: unknown) => ({ id: "er_new" })
    ),
    getDrafEraportById: vi.fn(async (): Promise<unknown> => null),
    terbitkanEraport: vi.fn(async () => ({ id: "er_1", status: "terbit" })),
    catatRevisi: vi.fn(async () => ({ id: "rev_new", eraportId: "er_1" })),
    // nilai-peserta-didik repo (getNilaiAkhir for konten)
    getNilaiAkhir: vi.fn(async (): Promise<unknown> => []),
    // tahun-ajaran repos
    getTahunAjaranAktif: vi.fn(
      async (): Promise<unknown> => ({
        id: "ta_1",
        nama: "2026/2027",
        aktif: true,
      })
    ),
    getSemesterAktif: vi.fn(async (): Promise<unknown> => "ganjil"),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  assertPemilikBeban,
  KepemilikanError,
  getDb,
  withTenant,
  catatAudit,
  buatDrafEraport,
  getDrafEraportById,
  terbitkanEraport,
  catatRevisi,
  getNilaiAkhir,
  getTahunAjaranAktif,
  getSemesterAktif,
  revalidatePath,
  fakeTx: fakeTxRef,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
  // Mirror the real requireAksesAktif: delegate to the mocked getAksesSaya so
  // every existing getAksesSaya.mockResolvedValue(...) setup continues to drive
  // both the status branch and the boleh() branch unchanged.
  requireAksesAktif: async (izin: IzinSlug, pesanTolak?: string) => {
    const akses = await mocks.getAksesSaya();
    if (akses.status !== "active") {
      throw new Error("Satuan Pendidikan Aktif belum dipilih.");
    }
    if (!akses.boleh(izin).diizinkan) {
      throw new Error(pesanTolak ?? "Anda tidak memiliki izin untuk aksi ini.");
    }
    return akses;
  },
}));
vi.mock("@/lib/auth/kepemilikan", () => ({
  assertPemilikBeban: mocks.assertPemilikBeban,
  KepemilikanError: mocks.KepemilikanError,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/eraport", () => ({
  buatDrafEraport: mocks.buatDrafEraport,
  getDrafEraportById: mocks.getDrafEraportById,
  terbitkanEraport: mocks.terbitkanEraport,
  catatRevisi: mocks.catatRevisi,
}));
vi.mock("@/db/queries/nilai-peserta-didik", () => ({
  getNilaiAkhir: mocks.getNilaiAkhir,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  getSemesterAktif: mocks.getSemesterAktif,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  buatDrafEraportAction,
  catatRevisiEraportAction,
  terbitkanEraportAction,
} from "./actions";

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

const TX = expect.anything();
const DB = expect.anything();

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default).
 *
 * Role defaults for the E-Raport domain:
 *   admin / dev           — baca + buat + terbit + revisi
 *   kepala_sekolah        — baca + terbit
 *   guru                  — baca + buat (NO terbit/revisi)
 *   wali_kelas            — baca only
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "eraport:baca",
      "eraport:buat",
      "eraport:terbit",
      "eraport:revisi",
    ],
    dev: ["eraport:baca", "eraport:buat", "eraport:terbit", "eraport:revisi"],
    kepala_sekolah: ["eraport:baca", "eraport:terbit"],
    guru: ["eraport:baca", "eraport:buat"],
    wali_kelas: ["eraport:baca"],
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
  vi.clearAllMocks();
  getAksesSaya.mockReset();
  assertPemilikBeban.mockReset();
  assertPemilikBeban.mockResolvedValue(undefined);
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  buatDrafEraport.mockReset();
  getDrafEraportById.mockReset();
  terbitkanEraport.mockReset();
  catatRevisi.mockReset();
  getNilaiAkhir.mockReset();
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
  catatAudit.mockResolvedValue(undefined);
  buatDrafEraport.mockResolvedValue({ id: "er_new" });
  getDrafEraportById.mockResolvedValue(null);
  terbitkanEraport.mockResolvedValue({ id: "er_1", status: "terbit" });
  catatRevisi.mockResolvedValue({ id: "rev_new", eraportId: "er_1" });
  getNilaiAkhir.mockResolvedValue([]);
  getTahunAjaranAktif.mockResolvedValue({
    id: "ta_1",
    nama: "2026/2027",
    aktif: true,
  });
  getSemesterAktif.mockResolvedValue("ganjil");
});

// ===========================================================================
// A. Role denial — wali_kelas holds eraport:baca ONLY. Any write action MUST
// throw BEFORE any DB work (gate 1).
// ===========================================================================

describe("A. role denial — wali_kelas (eraport:baca only)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
  });

  it("1. buatDrafEraportAction -> throws /izin/i; buatDrafEraport + audit + withTenant NOT called", async () => {
    await expect(
      buatDrafEraportAction(formData({ pesertaDidikId: "pd_1" }))
    ).rejects.toThrow(/izin/i);
    expect(buatDrafEraport).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. terbitkanEraportAction -> throws /izin/i; terbitkanEraport NOT called", async () => {
    await expect(
      terbitkanEraportAction(formData({ id: "er_1" }))
    ).rejects.toThrow(/izin/i);
    expect(terbitkanEraport).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("3. catatRevisiEraportAction -> throws /izin/i; catatRevisi NOT called", async () => {
    await expect(
      catatRevisiEraportAction(formData({ id: "er_1", alasan: "x" }))
    ).rejects.toThrow(/izin/i);
    expect(catatRevisi).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Guru success — has eraport:buat. Asserts the FULL create chain (AC#1 draf
// from Nilai Akhir; konten snapshot built; period resolved server-side).
// ===========================================================================

describe("B. guru success — buatDrafEraportAction (AC#1 draf from Nilai Akhir)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("4. buatDrafEraportAction -> resolves TA+semester server-side; builds konten from getNilaiAkhir; audit(buat_draf_eraport)", async () => {
    // AC#1: getNilaiAkhir returns the student's derivation; the action folds
    // it into the konten snapshot.
    getNilaiAkhir.mockResolvedValueOnce([
      {
        pesertaDidikId: "pd_1",
        nilaiAkhir: 87.5,
        rincian: [{ nama: "UTS", bobot: 1, rataRata: 87.5 }],
      },
    ]);

    await buatDrafEraportAction(
      formData({ pesertaDidikId: "pd_1", bebanMengajarId: "bm_1" })
    );

    // Period resolved server-side (not from formData).
    expect(getTahunAjaranAktif).toHaveBeenCalledWith(TX);
    expect(getSemesterAktif).toHaveBeenCalledWith(TX);
    expect(getNilaiAkhir).toHaveBeenCalledWith(TX, "bm_1", "pd_1");

    // konten snapshot built from Nilai Akhir.
    expect(buatDrafEraport).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        pesertaDidikId: "pd_1",
        tahunAjaranId: "ta_1",
        semester: "ganjil",
        konten: expect.objectContaining({
          sumber: "nilai_akhir",
          nilaiAkhir: 87.5,
          bebanMengajarId: "bm_1",
          rincian: expect.any(Array),
        }),
        dibuatOleh: "workos_u_1",
      })
    );

    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_draf_eraport",
        target: "draf_eraport:er_new",
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/eraport");

    // Gate 2 (AC#4 ownership): assertPemilikBeban invoked with the tenant tx,
    // the active akses, and a resolver bound to the formData beban id — BEFORE
    // getNilaiAkhir runs.
    expect(assertPemilikBeban).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ userId: "workos_u_1", status: "active" }),
      expect.any(Function)
    );
    expect(getNilaiAkhir).toHaveBeenCalledWith(TX, "bm_1", "pd_1");
  });

  it("5. no bebanMengajarId -> konten carries only period+student context (no nilaiAkhir)", async () => {
    await buatDrafEraportAction(formData({ pesertaDidikId: "pd_2" }));

    expect(getNilaiAkhir).not.toHaveBeenCalled();
    expect(buatDrafEraport).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        pesertaDidikId: "pd_2",
        konten: expect.objectContaining({
          sumber: "nilai_akhir",
          pesertaDidikId: "pd_2",
        }),
      })
    );
    // no nilaiAkhir key when no beban supplied.
    const call = buatDrafEraport.mock.calls[0][1] as {
      konten: Record<string, unknown>;
    };
    expect(call.konten).not.toHaveProperty("nilaiAkhir");
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary".
// A client that bypasses the UI and POSTs raw FormData to the action fn is
// STILL decided correctly server-side: guru create succeeds, wali_kelas denied,
// guru terbit denied (lacks eraport:terbit).
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("6. guru (has eraport:buat) calling buatDrafEraportAction DIRECTLY -> succeeds (repo called)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await buatDrafEraportAction(formData({ pesertaDidikId: "pd_1" }));
    expect(buatDrafEraport).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("7. wali_kelas (no eraport:buat) calling buatDrafEraportAction DIRECTLY -> throws /izin/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await expect(
      buatDrafEraportAction(formData({ pesertaDidikId: "pd_1" }))
    ).rejects.toThrow(/izin/i);
    expect(buatDrafEraport).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("8. guru (no eraport:terbit) calling terbitkanEraportAction DIRECTLY -> throws /izin/i; terbitkanEraport NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await expect(
      terbitkanEraportAction(formData({ id: "er_1" }))
    ).rejects.toThrow(/izin/i);
    expect(terbitkanEraport).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("9. guru (no eraport:revisi) calling catatRevisiEraportAction DIRECTLY -> throws /izin/i; catatRevisi NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await expect(
      catatRevisiEraportAction(formData({ id: "er_1", alasan: "x" }))
    ).rejects.toThrow(/izin/i);
    expect(catatRevisi).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. AC#4 PROOF — unverified AI rejected. The repo validates draf_ai.status
// when drafAiId is supplied; a menunggu draft throws. The action propagates
// the repo's "belum diverifikasi" error.
// ===========================================================================

describe("AC#4: unverified AI rejected", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("10. drafAiId supplied + repo rejects (menunggu) -> action throws /belum diverifikasi/i; audit NOT called", async () => {
    buatDrafEraport.mockRejectedValueOnce(
      new Error("Konten AI belum diverifikasi tidak dapat digunakan.")
    );
    await expect(
      buatDrafEraportAction(
        formData({ pesertaDidikId: "pd_1", drafAiId: "da_menunggu" })
      )
    ).rejects.toThrow(/belum diverifikasi/i);
    expect(buatDrafEraport).toHaveBeenCalledTimes(1);
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("11. drafAiId supplied + repo accepts (disetujui) -> drafAiId forwarded to repo", async () => {
    await buatDrafEraportAction(
      formData({ pesertaDidikId: "pd_1", drafAiId: "da_disetujui" })
    );
    expect(buatDrafEraport).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ drafAiId: "da_disetujui" })
    );
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// E. Terbit (AC#2) — kepala_sekolah publishes; repo refuses a second terbit.
// ===========================================================================

describe("E. terbit (terbitkanEraportAction) — AC#2", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
  });

  it("12. terbit -> terbitkanEraport(tx, id) + audit(terbit_eraport)", async () => {
    await terbitkanEraportAction(formData({ id: "er_1" }));
    expect(terbitkanEraport).toHaveBeenCalledWith(TX, "er_1");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "terbit_eraport",
        target: "draf_eraport:er_1",
        beban: { id: "er_1", status: "terbit" },
      })
    );
  });

  it("13. already-terbit (repo throws 'sudah diterbitkan') -> action propagates; idempotent", async () => {
    terbitkanEraport.mockRejectedValueOnce(
      new Error("E-Raport sudah diterbitkan")
    );
    await expect(
      terbitkanEraportAction(formData({ id: "er_1" }))
    ).rejects.toThrow(/sudah diterbitkan/i);
    expect(terbitkanEraport).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// F. Revisi (AC#3) — admin appends a revisi (required alasan).
// ===========================================================================

describe("F. revisi (catatRevisiEraportAction) — AC#3", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    getDrafEraportById.mockResolvedValue({ id: "er_1", status: "terbit" });
  });

  it("14. revisi -> existence check + catatRevisi(tx, id, {alasan, kontenPerubahan, dibuatOleh}) + audit(revisi_eraport)", async () => {
    await catatRevisiEraportAction(
      formData({ id: "er_1", alasan: "Nilai salah", kontenPerubahan: '{"a":1}' })
    );
    expect(getDrafEraportById).toHaveBeenCalledWith(TX, "er_1");
    expect(catatRevisi).toHaveBeenCalledWith(
      TX,
      "er_1",
      expect.objectContaining({
        alasan: "Nilai salah",
        kontenPerubahan: { a: 1 },
        dibuatOleh: "workos_u_1",
      })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "revisi_eraport",
        target: "draf_eraport:er_1",
      })
    );
  });

  it("15. missing eraport id -> throws /tidak ditemukan/i; catatRevisi NOT called", async () => {
    getDrafEraportById.mockResolvedValueOnce(null);
    await expect(
      catatRevisiEraportAction(formData({ id: "ghost", alasan: "x" }))
    ).rejects.toThrow(/tidak ditemukan/i);
    expect(catatRevisi).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. Manual validation failures (no zod).
// ===========================================================================

describe("G. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("16. buatDrafEraportAction + missing pesertaDidikId -> /Peserta Didik wajib/i; repo NOT called", async () => {
    await expect(buatDrafEraportAction(formData({}))).rejects.toThrow(
      /Peserta Didik wajib/i
    );
    expect(buatDrafEraport).not.toHaveBeenCalled();
  });

  it("17. terbitkanEraportAction + missing id -> /ID E-Raport wajib/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    await expect(terbitkanEraportAction(formData({}))).rejects.toThrow(
      /ID E-Raport wajib/i
    );
    expect(terbitkanEraport).not.toHaveBeenCalled();
  });

  it("18. catatRevisiEraportAction + missing alasan -> /Alasan Revisi wajib/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    getDrafEraportById.mockResolvedValue({ id: "er_1", status: "terbit" });
    await expect(
      catatRevisiEraportAction(formData({ id: "er_1" }))
    ).rejects.toThrow(/Alasan Revisi wajib/i);
    expect(catatRevisi).not.toHaveBeenCalled();
  });

  it("19. catatRevisiEraportAction + invalid JSON kontenPerubahan -> /JSON yang valid/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    getDrafEraportById.mockResolvedValue({ id: "er_1", status: "terbit" });
    await expect(
      catatRevisiEraportAction(
        formData({ id: "er_1", alasan: "x", kontenPerubahan: "{not json" })
      )
    ).rejects.toThrow(/JSON yang valid/i);
    expect(catatRevisi).not.toHaveBeenCalled();
  });

  it("20. no active Tahun Ajaran -> /Tahun Ajaran aktif belum diatur/i; repo NOT called", async () => {
    getTahunAjaranAktif.mockResolvedValueOnce(null);
    await expect(
      buatDrafEraportAction(formData({ pesertaDidikId: "pd_1" }))
    ).rejects.toThrow(/Tahun Ajaran aktif belum diatur/i);
    expect(buatDrafEraport).not.toHaveBeenCalled();
  });

  it("21. no active Semester -> /Semester aktif belum diatur/i; repo NOT called", async () => {
    getSemesterAktif.mockResolvedValueOnce(null);
    await expect(
      buatDrafEraportAction(formData({ pesertaDidikId: "pd_1" }))
    ).rejects.toThrow(/Semester aktif belum diatur/i);
    expect(buatDrafEraport).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// H. Non-active context (denied / choose) — no active Satuan Pendidikan.
// ===========================================================================

describe("H. non-active akses context", () => {
  it("22. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(
      buatDrafEraportAction(formData({ pesertaDidikId: "pd_1" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("23. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    await expect(
      terbitkanEraportAction(formData({ id: "er_1" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// I. dev role is admin-equivalent (scoped to seeded tenants — NOT a superuser).
// ===========================================================================

describe("I. dev role behaves like admin", () => {
  it("24. buatDrafEraportAction with dev role -> succeeds (buatDrafEraport + audit)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("dev"));
    await buatDrafEraportAction(formData({ pesertaDidikId: "pd_1" }));
    expect(buatDrafEraport).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_draf_eraport",
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/eraport");
  });
});

// ===========================================================================
// J. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("J. tenant tamper-proofing", () => {
  it("25. bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await buatDrafEraportAction(
      formData({ pesertaDidikId: "pd_1", tenantId: "org_VICTIM" })
    );
    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(withTenant).toHaveBeenCalledWith(DB, "org_A", expect.anything());
    expect(withTenant).not.toHaveBeenCalledWith(
      DB,
      "org_VICTIM",
      expect.anything()
    );
  });
});

// ===========================================================================
// K. AC#4 ownership gate (gate 2) — assertPemilikBeban rejection propagates.
// A guru who passed gate 1 (eraport:buat) but does NOT own the beban is denied
// at gate 2. The action MUST propagate the KepemilikanError and run NO
// downstream work (getNilaiAkhir, buatDrafEraport, audit).
// ===========================================================================

describe("K. ownership gate (assertPemilikBeban) rejection propagates", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("26. assertPemilikBeban rejects -> action throws /tidak memiliki izin/i; getNilaiAkhir + buatDrafEraport NOT called", async () => {
    assertPemilikBeban.mockRejectedValueOnce(
      new KepemilikanError(
        "Anda tidak memiliki izin untuk Beban Mengajar ini."
      )
    );

    await expect(
      buatDrafEraportAction(
        formData({ pesertaDidikId: "pd_1", bebanMengajarId: "bm_other" })
      )
    ).rejects.toThrow(/tidak memiliki izin untuk Beban Mengajar/i);

    expect(assertPemilikBeban).toHaveBeenCalledTimes(1);
    // The gate short-circuits the chain: no Nilai Akhir fetch, no insert, no audit.
    expect(getNilaiAkhir).not.toHaveBeenCalled();
    expect(buatDrafEraport).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});
