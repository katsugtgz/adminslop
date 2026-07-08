import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors src/app/dashboard/akses/actions.test.ts + penilaian/actions.test.ts:
// hoist all mocks, mock the modules to wire them in, then import the actions.
//
// No ownership chain here (unlike penilaian) — the action resolves everything
// via mocked repo fns (cariPermintaanAiById, getTahunAjaranAktif, ...). So
// fakeTx is a plain sentinel; no per-table fixture Map is needed.

const mocks = vi.hoisted(() => {
  const fakeTxLocal = { __tx: true };
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    // withTenant runs the callback with fakeTx so every repo fn receives it.
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTxLocal)
    ),
    catatAudit: vi.fn(async () => undefined),
    // permintaan-ai repos
    buatPermintaanAi: vi.fn(async () => ({ id: "pa_new" })),
    ubahStatusPermintaanAi: vi.fn(async () => ({ id: "pa_new", status: "selesai" })),
    batalkanPermintaanAi: vi.fn(async () => ({ id: "pa_1", status: "dibatalkan" })),
    cariPermintaanAiById: vi.fn(async (): Promise<unknown> => null),
    // draf-ai repos
    buatDrafAi: vi.fn(async () => ({ id: "da_new" })),
    verifikasiDrafAi: vi.fn(async () => ({ id: "da_1", statusVerifikasi: "disetujui" })),
    // kuota-ai repos
    getAtauBuatKuotaAi: vi.fn(async () => ({ terpakai: 0, batas: 100, tersisa: 100 })),
    tambahPemakaianKuota: vi.fn(async () => ({ terpakai: 1, batas: 100, tersisa: 99 })),
    // tahun-ajaran repos
    getTahunAjaranAktif: vi.fn(async () => ({ id: "ta_1", nama: "2026/2027", aktif: true })),
    getSemesterAktif: vi.fn(async () => "ganjil" as const),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  buatPermintaanAi,
  ubahStatusPermintaanAi,
  batalkanPermintaanAi,
  cariPermintaanAiById,
  buatDrafAi,
  verifikasiDrafAi,
  getAtauBuatKuotaAi,
  tambahPemakaianKuota,
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
vi.mock("@/db/queries/permintaan-ai", () => ({
  buatPermintaanAi: mocks.buatPermintaanAi,
  ubahStatusPermintaanAi: mocks.ubahStatusPermintaanAi,
  batalkanPermintaanAi: mocks.batalkanPermintaanAi,
  cariPermintaanAiById: mocks.cariPermintaanAiById,
}));
vi.mock("@/db/queries/draf-ai", () => ({
  buatDrafAi: mocks.buatDrafAi,
  verifikasiDrafAi: mocks.verifikasiDrafAi,
}));
vi.mock("@/db/queries/kuota-ai", () => ({
  getAtauBuatKuotaAi: mocks.getAtauBuatKuotaAi,
  tambahPemakaianKuota: mocks.tambahPemakaianKuota,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  getSemesterAktif: mocks.getSemesterAktif,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  batalkanPermintaanAiAction,
  buatPermintaanAiAction,
  retryPermintaanAiAction,
  verifikasiDrafAiAction,
} from "./actions";

// --- helpers ---------------------------------------------------------------

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

/** `expect.anything()` stand-in for the fakeTx passed as the first repo arg. */
const TX = expect.anything();
/** `expect.anything()` stand-in for the db passed as first withTenant arg. */
const DB = expect.anything();

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default).
 *
 * Role defaults for the AI domain:
 *   admin / dev           — create + verify + manage
 *   kepala_sekolah        — verify drafts, read requests
 *   guru                  — create requests (NO verify)
 *   wali_kelas            — read only (NO create, NO verify)
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "permintaan_ai:baca",
      "permintaan_ai:buat",
      "draf_ai:baca",
      "draf_ai:verifikasi",
      "akses:kelola",
    ],
    dev: [
      "permintaan_ai:baca",
      "permintaan_ai:buat",
      "draf_ai:baca",
      "draf_ai:verifikasi",
      "akses:kelola",
    ],
    kepala_sekolah: [
      "permintaan_ai:baca",
      "draf_ai:baca",
      "draf_ai:verifikasi",
    ],
    guru: ["permintaan_ai:baca", "permintaan_ai:buat"],
    wali_kelas: ["permintaan_ai:baca"],
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
  buatPermintaanAi.mockReset();
  ubahStatusPermintaanAi.mockReset();
  batalkanPermintaanAi.mockReset();
  cariPermintaanAiById.mockReset();
  buatDrafAi.mockReset();
  verifikasiDrafAi.mockReset();
  getAtauBuatKuotaAi.mockReset();
  tambahPemakaianKuota.mockReset();
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
  buatPermintaanAi.mockResolvedValue({ id: "pa_new" });
  ubahStatusPermintaanAi.mockResolvedValue({ id: "pa_new", status: "selesai" });
  batalkanPermintaanAi.mockResolvedValue({ id: "pa_1", status: "dibatalkan" });
  cariPermintaanAiById.mockResolvedValue(null);
  buatDrafAi.mockResolvedValue({ id: "da_new" });
  verifikasiDrafAi.mockResolvedValue({
    id: "da_1",
    statusVerifikasi: "disetujui",
  });
  getAtauBuatKuotaAi.mockResolvedValue({ terpakai: 0, batas: 100, tersisa: 100 });
  tambahPemakaianKuota.mockResolvedValue({ terpakai: 1, batas: 100, tersisa: 99 });
  getTahunAjaranAktif.mockResolvedValue({
    id: "ta_1",
    nama: "2026/2027",
    aktif: true,
  });
  getSemesterAktif.mockResolvedValue("ganjil");
});

// ===========================================================================
// A. Role denial — wali_kelas holds permintaan_ai:baca ONLY. Any write/cancel
// action MUST throw BEFORE any DB work (gate 1).
// ===========================================================================

describe("A. role denial — wali_kelas (permintaan_ai:baca only)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
  });

  it("1. buatPermintaanAiAction -> throws /izin/i; buatPermintaanAi + audit + withTenant NOT called", async () => {
    await expect(
      buatPermintaanAiAction(formData({ jenis: "deskripsi_cp" }))
    ).rejects.toThrow(/izin/i);
    expect(buatPermintaanAi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. batalkanPermintaanAiAction -> throws /izin/i; batalkanPermintaanAi NOT called", async () => {
    await expect(
      batalkanPermintaanAiAction(formData({ id: "pa_1" }))
    ).rejects.toThrow(/izin/i);
    expect(batalkanPermintaanAi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Guru success — has permintaan_ai:buat. Asserts the FULL processing chain
// (AC#1 state machine, AC#2 provenance, AC#5 kuota-before-processing).
// ===========================================================================

describe("B. guru success — full processing chain (permintaan_ai:buat)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("3. buatPermintaanAiAction -> full chain: kuota(check) -> buat -> kuota(inc) -> diproses -> draf -> selesai -> audit", async () => {
    await buatPermintaanAiAction(
      formData({ jenis: "deskripsi_cp", konteks: '{"mapel":"Matematika"}' })
    );

    // AC#5: kuota read BEFORE the permintaan is created / processed.
    expect(getAtauBuatKuotaAi).toHaveBeenCalledWith(TX, "ta_1", "ganjil");
    expect(getAtauBuatKuotaAi).toHaveBeenCalledBefore(buatPermintaanAi);

    // AC#1: buat with dibuatOleh + konteks parsed.
    expect(buatPermintaanAi).toHaveBeenCalledWith(TX, {
      jenis: "deskripsi_cp",
      konteks: { mapel: "Matematika" },
      dibuatOleh: "workos_u_1",
      permintaanTerkaitId: null,
    });

    // AC#5: increment after the gate passed.
    expect(tambahPemakaianKuota).toHaveBeenCalledWith(TX, "ta_1", "ganjil");
    expect(tambahPemakaianKuota).toHaveBeenCalledBefore(buatDrafAi);

    // AC#1 state machine: diproses then selesai (stamped in order).
    expect(ubahStatusPermintaanAi).toHaveBeenCalledTimes(2);
    expect(ubahStatusPermintaanAi).toHaveBeenNthCalledWith(
      1,
      TX,
      "pa_new",
      "diproses"
    );
    expect(ubahStatusPermintaanAi).toHaveBeenNthCalledWith(
      2,
      TX,
      "pa_new",
      "selesai"
    );

    // AC#2: draf stored with provenance + konten, linked 1:1. Order proof
    // (invocationCallOrder): diproses(idx0) < draf < selesai(idx1) — the selesai
    // transition only fires AFTER the draf exists.
    expect(buatDrafAi).toHaveBeenCalledWith(TX, {
      permintaanAiId: "pa_new",
      konten: expect.stringMatching(/^\[AI-GENERATED: jenis deskripsi_cp\]$/),
      provenance: expect.stringMatching(/^mock-model-v1@/),
    });
    const orderDraf = buatDrafAi.mock.invocationCallOrder[0];
    const orderStatus = ubahStatusPermintaanAi.mock.invocationCallOrder;
    expect(orderDraf).toBeGreaterThan(orderStatus[0]); // after diproses
    expect(orderDraf).toBeLessThan(orderStatus[1]); // before selesai

    // Audit + revalidate.
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_permintaan_ai",
        target: "permintaan_ai:pa_new",
        beban: { jenis: "deskripsi_cp", status: "selesai" },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/permintaan-ai");
  });

  it("4. provenance is always set (AC#2) — draf never anonymous; konteks defaults to {} when omitted", async () => {
    await buatPermintaanAiAction(formData({ jenis: "narasi_raport" }));
    expect(buatDrafAi).toHaveBeenCalledTimes(1);
    expect(buatDrafAi).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        provenance: expect.stringMatching(/^mock-model-v1@/),
        konten: "[AI-GENERATED: jenis narasi_raport]",
      })
    );
    // konteks defaulted to {} (no formData field).
    expect(buatPermintaanAi).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ konteks: {}, permintaanTerkaitId: null })
    );
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary".
// A client that bypasses the UI and POSTs raw FormData to the action fn is
// STILL decided correctly server-side: guru create succeeds, wali_kelas denied,
// guru verify denied (lacks draf_ai:verifikasi).
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("5. guru (has permintaan_ai:buat) calling buatPermintaanAiAction DIRECTLY -> succeeds (repo called)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await buatPermintaanAiAction(formData({ jenis: "deskripsi_tp" }));
    expect(buatPermintaanAi).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("6. wali_kelas (no permintaan_ai:buat) calling buatPermintaanAiAction DIRECTLY -> throws /izin/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await expect(
      buatPermintaanAiAction(formData({ jenis: "deskripsi_tp" }))
    ).rejects.toThrow(/izin/i);
    expect(buatPermintaanAi).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("7. guru (no draf_ai:verifikasi) calling verifikasiDrafAiAction DIRECTLY -> throws /izin/i; verifikasiDrafAi NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await expect(
      verifikasiDrafAiAction(formData({ drafId: "da_1", status: "disetujui" }))
    ).rejects.toThrow(/izin/i);
    expect(verifikasiDrafAi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. Cancel — only dibuat / diproses are cancellable; terminal states throw.
// ===========================================================================

describe("D. cancel (batalkanPermintaanAiAction)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("8. status='dibuat' -> batalkanPermintaanAi called + audit(batalkan_permintaan_ai)", async () => {
    cariPermintaanAiById.mockResolvedValueOnce({
      id: "pa_1",
      jenis: "deskripsi_cp",
      status: "dibuat",
      dibuatOleh: "workos_u_1",
    });
    await batalkanPermintaanAiAction(formData({ id: "pa_1" }));
    expect(batalkanPermintaanAi).toHaveBeenCalledWith(TX, "pa_1");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "batalkan_permintaan_ai",
        target: "permintaan_ai:pa_1",
      })
    );
  });

  it("9. status='selesai' -> throws /tidak dapat dibatalkan/i; batalkanPermintaanAi NOT called", async () => {
    cariPermintaanAiById.mockResolvedValueOnce({
      id: "pa_1",
      jenis: "deskripsi_cp",
      status: "selesai",
      dibuatOleh: "workos_u_1",
    });
    await expect(
      batalkanPermintaanAiAction(formData({ id: "pa_1" }))
    ).rejects.toThrow(/tidak dapat dibatalkan/i);
    expect(batalkanPermintaanAi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D2. Ownership gate (gate 2) — only the creator (or admin) may cancel/retry.
// ===========================================================================

describe("D2. ownership gate — guru cannot cancel/retry another user's permintaan", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("9a. batalkanPermintaanAiAction + dibuatOleh=other_user -> throws KepemilikanError; batalkan NOT called", async () => {
    cariPermintaanAiById.mockResolvedValueOnce({
      id: "pa_1",
      jenis: "deskripsi_cp",
      status: "dibuat",
      dibuatOleh: "workos_u_OTHER",
    });
    await expect(
      batalkanPermintaanAiAction(formData({ id: "pa_1" }))
    ).rejects.toThrow(/tidak memiliki izin untuk Permintaan AI/i);
    expect(batalkanPermintaanAi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("9b. retryPermintaanAiAction + dibuatOleh=other_user -> throws KepemilikanError; buatPermintaanAi NOT called", async () => {
    cariPermintaanAiById.mockResolvedValueOnce({
      id: "pa_orig",
      jenis: "deskripsi_atp",
      konteks: {},
      status: "gagal",
      dibuatOleh: "workos_u_OTHER",
    });
    await expect(
      retryPermintaanAiAction(formData({ id: "pa_orig" }))
    ).rejects.toThrow(/tidak memiliki izin untuk Permintaan AI/i);
    expect(buatPermintaanAi).not.toHaveBeenCalled();
  });

  it("9c. admin can cancel ANY user's permintaan (admin bypass)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    cariPermintaanAiById.mockResolvedValueOnce({
      id: "pa_1",
      jenis: "deskripsi_cp",
      status: "dibuat",
      dibuatOleh: "workos_u_OTHER",
    });
    await batalkanPermintaanAiAction(formData({ id: "pa_1" }));
    expect(batalkanPermintaanAi).toHaveBeenCalledWith(TX, "pa_1");
  });
});

// ===========================================================================
// E. Verify (AC#3 gate) — menunggu -> disetujui|ditolak; idempotency on
// already-verified (repo throws, action propagates).
// ===========================================================================

describe("E. verify (verifikasiDrafAiAction) — AC#3 gate", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("10. status=disetujui -> verifikasiDrafAi(tx, drafId, 'disetujui', userId) + audit", async () => {
    await verifikasiDrafAiAction(
      formData({ drafId: "da_1", status: "disetujui" })
    );
    expect(verifikasiDrafAi).toHaveBeenCalledWith(
      TX,
      "da_1",
      "disetujui",
      "workos_u_1"
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "verifikasi_draf_ai",
        target: "draf_ai:da_1",
        beban: { status: "disetujui" },
      })
    );
  });

  it("11. status=ditolak -> verifikasiDrafAi called with 'ditolak' + audit", async () => {
    await verifikasiDrafAiAction(formData({ drafId: "da_1", status: "ditolak" }));
    expect(verifikasiDrafAi).toHaveBeenCalledWith(
      TX,
      "da_1",
      "ditolak",
      "workos_u_1"
    );
  });

  it("12. already-verified (repo throws 'sudah diverifikasi') -> action propagates; idempotent (no second verdict)", async () => {
    verifikasiDrafAi.mockRejectedValueOnce(
      new Error("Draf AI sudah diverifikasi")
    );
    await expect(
      verifikasiDrafAiAction(
        formData({ drafId: "da_1", status: "disetujui" })
      )
    ).rejects.toThrow(/sudah diverifikasi/i);
    // repo attempted exactly once — no retry/rewrite.
    expect(verifikasiDrafAi).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// F. Retry (AC#4) — NEW permintaan linked via permintaanTerkaitId, same jenis
// + konteks, processed identically. Consumes a fresh kuota unit.
// ===========================================================================

describe("F. retry (retryPermintaanAiAction)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("13. retry -> buatPermintaanAi with permintaanTerkaitId=original.id; audit(retry_permintaan_ai)", async () => {
    cariPermintaanAiById.mockResolvedValueOnce({
      id: "pa_orig",
      jenis: "deskripsi_atp",
      konteks: { fase: "C" },
      status: "gagal",
      dibuatOleh: "workos_u_1",
    });
    await retryPermintaanAiAction(formData({ id: "pa_orig" }));

    expect(cariPermintaanAiById).toHaveBeenCalledWith(TX, "pa_orig");
    expect(buatPermintaanAi).toHaveBeenCalledWith(TX, {
      jenis: "deskripsi_atp",
      konteks: { fase: "C" },
      dibuatOleh: "workos_u_1",
      permintaanTerkaitId: "pa_orig",
    });
    expect(tambahPemakaianKuota).toHaveBeenCalledTimes(1);
    expect(buatDrafAi).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "retry_permintaan_ai",
        target: "permintaan_ai:pa_new",
        beban: {
          permintaanTerkaitId: "pa_orig",
          jenis: "deskripsi_atp",
          status: "selesai",
        },
      })
    );
  });
});

// ===========================================================================
// G. Kuota exhausted (AC#5) — tersisa=0 throws BEFORE any processing.
// ===========================================================================

describe("G. kuota exhausted (AC#5 budget)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("14. tersisa=0 -> throws /kuota/i; buatPermintaanAi + tambahPemakaianKuota NOT called", async () => {
    getAtauBuatKuotaAi.mockResolvedValueOnce({
      terpakai: 100,
      batas: 100,
      tersisa: 0,
    });
    await expect(
      buatPermintaanAiAction(formData({ jenis: "deskripsi_cp" }))
    ).rejects.toThrow(/kuota/i);
    expect(getAtauBuatKuotaAi).toHaveBeenCalledTimes(1);
    expect(buatPermintaanAi).not.toHaveBeenCalled();
    expect(tambahPemakaianKuota).not.toHaveBeenCalled();
    expect(buatDrafAi).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// H. Manual validation failures (no zod).
// ===========================================================================

describe("H. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("15. buatPermintaanAiAction + invalid jenis -> /Jenis Permintaan AI tidak valid/i; repo NOT called", async () => {
    await expect(
      buatPermintaanAiAction(formData({ jenis: "raga_ai" }))
    ).rejects.toThrow(/Jenis Permintaan AI tidak valid/i);
    expect(buatPermintaanAi).not.toHaveBeenCalled();
  });

  it("16. batalkanPermintaanAiAction + missing id -> /ID Permintaan AI wajib diisi/i; repo NOT called", async () => {
    await expect(batalkanPermintaanAiAction(formData({}))).rejects.toThrow(
      /ID Permintaan AI wajib diisi/i
    );
    expect(cariPermintaanAiById).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// I. Non-active context (denied / choose) — no active Satuan Pendidikan.
// ===========================================================================

describe("I. non-active akses context", () => {
  it("17. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(
      buatPermintaanAiAction(formData({ jenis: "deskripsi_cp" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("18. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    await expect(
      verifikasiDrafAiAction(formData({ drafId: "da_1", status: "disetujui" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// J. dev role is admin-equivalent (scoped to seeded tenants — NOT a superuser).
// ===========================================================================

describe("J. dev role behaves like admin", () => {
  it("19. buatPermintaanAiAction with dev role -> succeeds (buatPermintaanAi + audit)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("dev"));
    await buatPermintaanAiAction(formData({ jenis: "deskripsi_cp" }));
    expect(buatPermintaanAi).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_permintaan_ai",
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/permintaan-ai");
  });
});

// ===========================================================================
// K. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("K. tenant tamper-proofing", () => {
  it("20. bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await buatPermintaanAiAction(
      formData({ jenis: "deskripsi_cp", tenantId: "org_VICTIM" })
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
