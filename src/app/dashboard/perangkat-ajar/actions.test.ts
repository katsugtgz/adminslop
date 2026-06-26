import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors src/app/dashboard/permintaan-ai/actions.test.ts: hoist all mocks,
// mock the modules to wire them in, then import the actions. fakeTx is a plain
// sentinel passed as the first repo arg.

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
    // perangkat-ajar repos
    buatPerangkatAjar: vi.fn(async () => ({
      id: "pa_new",
      statusDokumenAi: null,
    })),
    ubahPerangkatAjar: vi.fn(async () => ({ id: "pa_1" })),
    cariPerangkatAjarById: vi.fn(async (): Promise<unknown> => null),
    verifikasiDokumenAi: vi.fn(async () => ({
      id: "pa_1",
      statusDokumenAi: "disetujui",
    })),
    // tahun-ajaran repos (resolved server-side; may be null when unset)
    getTahunAjaranAktif: vi.fn(
      async (): Promise<{ id: string; nama: string; aktif: boolean } | null> => ({
        id: "ta_1",
        nama: "2026/2027",
        aktif: true,
      })
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
  buatPerangkatAjar,
  ubahPerangkatAjar,
  cariPerangkatAjarById,
  verifikasiDokumenAi,
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
vi.mock("@/db/queries/perangkat-ajar", () => ({
  buatPerangkatAjar: mocks.buatPerangkatAjar,
  ubahPerangkatAjar: mocks.ubahPerangkatAjar,
  cariPerangkatAjarById: mocks.cariPerangkatAjarById,
  verifikasiDokumenAi: mocks.verifikasiDokumenAi,
}));
vi.mock("@/db/queries/tahun-ajaran", () => ({
  getTahunAjaranAktif: mocks.getTahunAjaranAktif,
  getSemesterAktif: mocks.getSemesterAktif,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  buatPerangkatAjarAction,
  ubahPerangkatAjarAction,
  verifikasiDokumenAiAction,
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
 * Role defaults for the Perangkat Ajar domain (#17):
 *   admin / dev / guru      — baca + buat + ubah (guru creates + verifies AI)
 *   wali_kelas / kepala     — baca only (oversight, no write)
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "perangkat_ajar:baca",
      "perangkat_ajar:buat",
      "perangkat_ajar:ubah",
    ],
    dev: [
      "perangkat_ajar:baca",
      "perangkat_ajar:buat",
      "perangkat_ajar:ubah",
    ],
    kepala_sekolah: ["perangkat_ajar:baca"],
    guru: ["perangkat_ajar:baca", "perangkat_ajar:buat", "perangkat_ajar:ubah"],
    wali_kelas: ["perangkat_ajar:baca"],
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
  // restore default implementations cleared by clearAllMocks
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(
    async (
      _db: unknown,
      _tenantId: unknown,
      fn: (tx: unknown) => Promise<unknown>
    ) => fn(fakeTxRef)
  );
  catatAudit.mockResolvedValue(undefined);
  buatPerangkatAjar.mockResolvedValue({ id: "pa_new", statusDokumenAi: null });
  ubahPerangkatAjar.mockResolvedValue({ id: "pa_1" });
  cariPerangkatAjarById.mockResolvedValue(null);
  verifikasiDokumenAi.mockResolvedValue({
    id: "pa_1",
    statusDokumenAi: "disetujui",
  });
  getTahunAjaranAktif.mockResolvedValue({
    id: "ta_1",
    nama: "2026/2027",
    aktif: true,
  });
  getSemesterAktif.mockResolvedValue("ganjil");
});

// ===========================================================================
// A. Role denial — wali_kelas holds perangkat_ajar:baca ONLY. Any write/verify
// action MUST throw BEFORE any DB work (gate 1).
// ===========================================================================

describe("A. role denial — wali_kelas (perangkat_ajar:baca only)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
  });

  it("1. buatPerangkatAjarAction -> throws /izin/i; repo + audit + withTenant NOT called", async () => {
    await expect(
      buatPerangkatAjarAction(
        formData({ jenis: "modul_ajar", mataPelajaranId: "mp_1", judul: "J" })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatPerangkatAjar).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. ubahPerangkatAjarAction -> throws /izin/i; repo NOT called", async () => {
    await expect(
      ubahPerangkatAjarAction(formData({ id: "pa_1", judul: "J" }))
    ).rejects.toThrow(/izin/i);
    expect(ubahPerangkatAjar).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("3. verifikasiDokumenAiAction -> throws /izin/i; repo NOT called", async () => {
    await expect(
      verifikasiDokumenAiAction(formData({ id: "pa_1", keputusan: "disetujui" }))
    ).rejects.toThrow(/izin/i);
    expect(verifikasiDokumenAi).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Guru success — has perangkat_ajar:buat+ubah. Asserts the full chain:
// TA+semester resolved SERVER-SIDE, repo called with correct args, audit.
// ===========================================================================

describe("B. guru success — full chain (perangkat_ajar:buat+ubah)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("4. buatPerangkatAjarAction -> resolves TA+semester server-side; repo + audit", async () => {
    await buatPerangkatAjarAction(
      formData({
        jenis: "modul_ajar",
        mataPelajaranId: "mp_1",
        judul: "Modul Ajar Satu",
        konten: '{"tujuan":"x"}',
      })
    );

    // TA + semester resolved server-side (inside withTenant).
    expect(getTahunAjaranAktif).toHaveBeenCalledWith(TX);
    expect(getSemesterAktif).toHaveBeenCalledWith(TX);

    expect(buatPerangkatAjar).toHaveBeenCalledWith(TX, {
      jenis: "modul_ajar",
      mataPelajaranId: "mp_1",
      tingkatId: null,
      tahunAjaranId: "ta_1",
      semester: "ganjil",
      judul: "Modul Ajar Satu",
      konten: { tujuan: "x" },
      drafAiId: null,
      dibuatOleh: "workos_u_1",
    });

    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_perangkat_ajar",
        target: "perangkat_ajar:pa_new",
        beban: {
          jenis: "modul_ajar",
          judul: "Modul Ajar Satu",
          statusDokumenAi: null,
        },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/perangkat-ajar");
  });

  it("5. AC#3: buat with drafAiId -> repo receives drafAiId (AI-assisted draft)", async () => {
    await buatPerangkatAjarAction(
      formData({
        jenis: "rpp",
        mataPelajaranId: "mp_1",
        judul: "RPP AI",
        drafAiId: "da_1",
      })
    );
    expect(buatPerangkatAjar).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ drafAiId: "da_1" })
    );
  });

  it("6. ubahPerangkatAjarAction -> repo + audit(ubah_perangkat_ajar)", async () => {
    await ubahPerangkatAjarAction(
      formData({ id: "pa_1", judul: "Judul Baru", konten: '{"a":1}' })
    );
    expect(ubahPerangkatAjar).toHaveBeenCalledWith(TX, "pa_1", {
      judul: "Judul Baru",
      konten: { a: 1 },
      mataPelajaranId: undefined,
      tingkatId: undefined,
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "ubah_perangkat_ajar",
        target: "perangkat_ajar:pa_1",
      })
    );
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary".
// A client that bypasses the UI and POSTs raw FormData DIRECTLY is still
// decided correctly server-side: guru create succeeds, wali_kelas/kepala denied.
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("7. guru (has perangkat_ajar:buat) calling buat DIRECTLY -> succeeds (repo called)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await buatPerangkatAjarAction(
      formData({ jenis: "silabus", mataPelajaranId: "mp_1", judul: "J" })
    );
    expect(buatPerangkatAjar).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("8. wali_kelas (no perangkat_ajar:buat) calling buat DIRECTLY -> throws /izin/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await expect(
      buatPerangkatAjarAction(
        formData({ jenis: "silabus", mataPelajaranId: "mp_1", judul: "J" })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatPerangkatAjar).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("9. kepala_sekolah (baca only) calling buat DIRECTLY -> throws /izin/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    await expect(
      buatPerangkatAjarAction(
        formData({ jenis: "silabus", mataPelajaranId: "mp_1", judul: "J" })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatPerangkatAjar).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. AC#3 PROOF — verifikasiDokumenAiAction: the gate on AI-assisted content.
// menunggu -> disetujui|ditolak; idempotency propagated; missing id denied.
// ===========================================================================

describe("AC#3: verifikasiDokumenAiAction — Dokumen AI gate", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    cariPerangkatAjarById.mockResolvedValue({
      id: "pa_1",
      statusDokumenAi: "menunggu",
    });
  });

  it("10. keputusan=disetujui -> verifikasiDokumenAi(tx,id,'disetujui') + audit", async () => {
    await verifikasiDokumenAiAction(
      formData({ id: "pa_1", keputusan: "disetujui" })
    );
    expect(verifikasiDokumenAi).toHaveBeenCalledWith(TX, "pa_1", "disetujui");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "verifikasi_dokumen_ai",
        target: "perangkat_ajar:pa_1",
        beban: { keputusan: "disetujui", statusDokumenAi: "disetujui" },
      })
    );
  });

  it("11. keputusan=ditolak -> verifikasiDokumenAi called with 'ditolak'", async () => {
    await verifikasiDokumenAiAction(
      formData({ id: "pa_1", keputusan: "ditolak" })
    );
    expect(verifikasiDokumenAi).toHaveBeenCalledWith(TX, "pa_1", "ditolak");
  });

  it("12. already-verified (repo throws 'sudah diverifikasi') -> action propagates; idempotent", async () => {
    verifikasiDokumenAi.mockRejectedValueOnce(
      new Error("Dokumen AI sudah diverifikasi")
    );
    await expect(
      verifikasiDokumenAiAction(
        formData({ id: "pa_1", keputusan: "disetujui" })
      )
    ).rejects.toThrow(/sudah diverifikasi/i);
    expect(verifikasiDokumenAi).toHaveBeenCalledTimes(1);
  });

  it("13. missing id (cari returns null) -> throws /tidak ditemukan/; verify NOT called", async () => {
    cariPerangkatAjarById.mockResolvedValueOnce(null);
    await expect(
      verifikasiDokumenAiAction(
        formData({ id: "pa_x", keputusan: "disetujui" })
      )
    ).rejects.toThrow(/tidak ditemukan/i);
    expect(verifikasiDokumenAi).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// E. AC#4 PROOF — invalid jenis rejected at the action boundary.
// ===========================================================================

describe("AC#4: invalid jenis rejected", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("14. buat + invalid jenis -> /Jenis Perangkat Ajar tidak valid/i; repo NOT called", async () => {
    await expect(
      buatPerangkatAjarAction(
        formData({ jenis: "modul_aaja", mataPelajaranId: "mp_1", judul: "J" })
      )
    ).rejects.toThrow(/Jenis Perangkat Ajar tidak valid/i);
    expect(buatPerangkatAjar).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F. Manual validation failures (no zod).
// ===========================================================================

describe("F. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("15. buat + missing mataPelajaranId -> /Mata Pelajaran wajib/i; repo NOT called", async () => {
    await expect(
      buatPerangkatAjarAction(formData({ jenis: "rpp", judul: "J" }))
    ).rejects.toThrow(/Mata Pelajaran wajib/i);
    expect(buatPerangkatAjar).not.toHaveBeenCalled();
  });

  it("16. buat + missing judul -> /Judul wajib/i; repo NOT called", async () => {
    await expect(
      buatPerangkatAjarAction(
        formData({ jenis: "rpp", mataPelajaranId: "mp_1" })
      )
    ).rejects.toThrow(/Judul wajib/i);
    expect(buatPerangkatAjar).not.toHaveBeenCalled();
  });

  it("17. buat + invalid konten JSON -> /Konten harus berupa JSON/i; repo NOT called", async () => {
    await expect(
      buatPerangkatAjarAction(
        formData({
          jenis: "rpp",
          mataPelajaranId: "mp_1",
          judul: "J",
          konten: "{tidak valid",
        })
      )
    ).rejects.toThrow(/Konten harus berupa JSON/i);
    expect(buatPerangkatAjar).not.toHaveBeenCalled();
  });

  it("18. ubah + missing id -> /ID Perangkat Ajar wajib/i; repo NOT called", async () => {
    await expect(ubahPerangkatAjarAction(formData({}))).rejects.toThrow(
      /ID Perangkat Ajar wajib/i
    );
    expect(ubahPerangkatAjar).not.toHaveBeenCalled();
  });

  it("19. verifikasi + invalid keputusan -> /Keputusan verifikasi tidak valid/i; repo NOT called", async () => {
    await expect(
      verifikasiDokumenAiAction(formData({ id: "pa_1", keputusan: "mentah" }))
    ).rejects.toThrow(/Keputusan verifikasi tidak valid/i);
    expect(verifikasiDokumenAi).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. TA/semester resolution — server-side resolution surfaces clear errors.
// ===========================================================================

describe("G. active period resolution", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("20. no active Tahun Ajaran -> /Tahun Ajaran aktif belum diatur/i; repo NOT called", async () => {
    getTahunAjaranAktif.mockResolvedValueOnce(null);
    await expect(
      buatPerangkatAjarAction(
        formData({ jenis: "rpp", mataPelajaranId: "mp_1", judul: "J" })
      )
    ).rejects.toThrow(/Tahun Ajaran aktif belum diatur/i);
    expect(buatPerangkatAjar).not.toHaveBeenCalled();
  });

  it("21. no active Semester -> /Semester aktif belum diatur/i; repo NOT called", async () => {
    getSemesterAktif.mockResolvedValueOnce(null);
    await expect(
      buatPerangkatAjarAction(
        formData({ jenis: "rpp", mataPelajaranId: "mp_1", judul: "J" })
      )
    ).rejects.toThrow(/Semester aktif belum diatur/i);
    expect(buatPerangkatAjar).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// H. Non-active context (denied / choose) — no active Satuan Pendidikan.
// ===========================================================================

describe("H. non-active akses context", () => {
  it("22. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(
      buatPerangkatAjarAction(
        formData({ jenis: "rpp", mataPelajaranId: "mp_1", judul: "J" })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("23. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    await expect(
      verifikasiDokumenAiAction(
        formData({ id: "pa_1", keputusan: "disetujui" })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// I. dev role is admin-equivalent (scoped to seeded tenants — NOT a superuser).
// ===========================================================================

describe("I. dev role behaves like admin", () => {
  it("24. buatPerangkatAjarAction with dev role -> succeeds (repo + audit)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("dev"));
    await buatPerangkatAjarAction(
      formData({ jenis: "prota", mataPelajaranId: "mp_1", judul: "J" })
    );
    expect(buatPerangkatAjar).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_perangkat_ajar",
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/perangkat-ajar");
  });
});

// ===========================================================================
// J. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("J. tenant tamper-proofing", () => {
  it("25. bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await buatPerangkatAjarAction(
      formData({
        jenis: "rpp",
        mataPelajaranId: "mp_1",
        judul: "J",
        tenantId: "org_VICTIM",
      })
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
