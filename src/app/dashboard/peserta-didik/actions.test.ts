import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors the idiom in src/app/dashboard/akses/actions.test.ts: hoist all
// mocks, mock the modules to wire them in, then import the actions under test.

const mocks = vi.hoisted(() => {
  const fakeTxLocal = { __tx: true };
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
    // peserta-didik repo
    buatPesertaDidik: vi.fn(
      async (_tx: unknown, input: { nama: string }) => ({
        id: "pd_new",
        tenantId: "org_A",
        nama: input.nama,
        nisn: null,
        nis: null,
        tanggalLahir: "2010-01-01",
        jenisKelamin: "L",
        status: "aktif",
        dibuatPada: new Date("2026-01-01T00:00:00Z"),
      })
    ),
    ubahPesertaDidik: vi.fn(async () => ({
      id: "pd_1",
      tenantId: "org_A",
      nama: "Budi",
      status: "aktif",
    })),
    ubahStatus: vi.fn(async () => ({
      id: "pd_1",
      tenantId: "org_A",
      status: "pindah",
    })),
    // existence check (P1-5); defaults to "found".
    cariPesertaDidikById: vi.fn(
      async (): Promise<{ id: string; tenantId: string; nama: string } | null> => ({
        id: "pd_1",
        tenantId: "org_A",
        nama: "Budi",
      })
    ),
    // kontak repo
    tambahWali: vi.fn(async () => ({
      id: "wali_new",
      tenantId: "org_A",
      pesertaDidikId: "pd_1",
      nama: "Ayah",
    })),
    hapusWali: vi.fn(async () => undefined),
    tambahKontakDarurat: vi.fn(async () => ({
      id: "kd_new",
      tenantId: "org_A",
      pesertaDidikId: "pd_1",
      nama: "Paman",
    })),
    hapusKontakDarurat: vi.fn(async () => undefined),
    // mutasi repo
    tambahMutasi: vi.fn(async () => ({
      id: "mutasi_new",
      tenantId: "org_A",
      pesertaDidikId: "pd_1",
      arah: "keluar",
      tanggal: "2026-01-01",
    })),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  buatPesertaDidik,
  ubahPesertaDidik,
  ubahStatus,
  cariPesertaDidikById,
  tambahWali,
  hapusWali,
  tambahKontakDarurat,
  hapusKontakDarurat,
  tambahMutasi,
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
vi.mock("@/db/queries/peserta-didik", () => ({
  buatPesertaDidik: mocks.buatPesertaDidik,
  ubahPesertaDidik: mocks.ubahPesertaDidik,
  ubahStatus: mocks.ubahStatus,
  cariPesertaDidikById: mocks.cariPesertaDidikById,
}));
vi.mock("@/db/queries/kontak-peserta-didik", () => ({
  tambahWali: mocks.tambahWali,
  hapusWali: mocks.hapusWali,
  tambahKontakDarurat: mocks.tambahKontakDarurat,
  hapusKontakDarurat: mocks.hapusKontakDarurat,
}));
vi.mock("@/db/queries/mutasi-peserta-didik", () => ({
  tambahMutasi: mocks.tambahMutasi,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  catatMutasiPesertaDidikAction,
  hapusKontakDaruratAction,
  hapusWaliAction,
  simpanPesertaDidikBaruAction,
  tambahKontakDaruratAction,
  tambahWaliAction,
  ubahPesertaDidikAction,
  ubahStatusPesertaDidikAction,
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
 * evaluasiAkses precedence (pembatasan > izin > peran default) so the tests are
 * realistic. The peran defaults mirror `PERAN_KE_IZIN_DEFAULT` in
 * otorisasi.ts: admin/dev get all peserta_didik:* writes; teaching roles get
 * `peserta_didik:baca` only.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "peserta_didik:baca",
      "peserta_didik:buat",
      "peserta_didik:ubah",
    ],
    dev: ["peserta_didik:baca", "peserta_didik:buat", "peserta_didik:ubah"],
    kepala_sekolah: ["peserta_didik:baca"],
    guru: ["peserta_didik:baca"],
    wali_kelas: ["peserta_didik:baca"],
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
  buatPesertaDidik.mockReset();
  ubahPesertaDidik.mockReset();
  ubahStatus.mockReset();
  cariPesertaDidikById.mockReset();
  tambahWali.mockReset();
  hapusWali.mockReset();
  tambahKontakDarurat.mockReset();
  hapusKontakDarurat.mockReset();
  tambahMutasi.mockReset();
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
  buatPesertaDidik.mockImplementation(
    async (_tx: unknown, input: { nama: string }) => ({
      id: "pd_new",
      tenantId: "org_A",
      nama: input.nama,
      nisn: null,
      nis: null,
      tanggalLahir: "2010-01-01",
      jenisKelamin: "L",
      status: "aktif",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    })
  );
  ubahPesertaDidik.mockResolvedValue({
    id: "pd_1",
    tenantId: "org_A",
    nama: "Budi",
    status: "aktif",
  });
  ubahStatus.mockResolvedValue({
    id: "pd_1",
    tenantId: "org_A",
    status: "pindah",
  });
  cariPesertaDidikById.mockResolvedValue({
    id: "pd_1",
    tenantId: "org_A",
    nama: "Budi",
  });
  tambahWali.mockResolvedValue({
    id: "wali_new",
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    nama: "Ayah",
  });
  hapusWali.mockResolvedValue(undefined);
  tambahKontakDarurat.mockResolvedValue({
    id: "kd_new",
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    nama: "Paman",
  });
  hapusKontakDarurat.mockResolvedValue(undefined);
  tambahMutasi.mockResolvedValue({
    id: "mutasi_new",
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    arah: "keluar",
    tanggal: "2026-01-01",
  });
  catatAudit.mockResolvedValue(undefined);
});

// ===========================================================================
// A. Authorization denial (guru) — core security: action throws BEFORE any DB.
// guru has peserta_didik:baca only; no writes (buat/ubah).
// ===========================================================================

describe("A. authorization denial — guru role (baca only, no writes)", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("1. simpanPesertaDidikBaru -> throws /izin/i; buatPesertaDidik + audit + withTenant NOT called", async () => {
    await expect(
      simpanPesertaDidikBaruAction(
        formData({ nama: "Budi", tanggalLahir: "2010-01-01", jenisKelamin: "L" })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatPesertaDidik).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. ubahPesertaDidik -> throws /izin/i; ubahPesertaDidik NOT called", async () => {
    await expect(
      ubahPesertaDidikAction(formData({ id: "pd_1", nama: "Budi" }))
    ).rejects.toThrow(/izin/i);
    expect(ubahPesertaDidik).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("3. ubahStatus -> throws /izin/i; ubahStatus NOT called", async () => {
    await expect(
      ubahStatusPesertaDidikAction(formData({ id: "pd_1", status: "lulus" }))
    ).rejects.toThrow(/izin/i);
    expect(ubahStatus).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("4. catatMutasi -> throws /izin/i; tambahMutasi + ubahStatus NOT called", async () => {
    await expect(
      catatMutasiPesertaDidikAction(
        formData({ id: "pd_1", arah: "keluar", tanggal: "2026-01-01" })
      )
    ).rejects.toThrow(/izin/i);
    expect(tambahMutasi).not.toHaveBeenCalled();
    expect(ubahStatus).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("5. tambahWali -> throws /izin/i; tambahWali NOT called", async () => {
    await expect(
      tambahWaliAction(
        formData({ pesertaDidikId: "pd_1", nama: "Ayah" })
      )
    ).rejects.toThrow(/izin/i);
    expect(tambahWali).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Authorization success (admin_satuan_pendidikan) — DB write + audit happen.
// ===========================================================================

describe("B. authorization success — admin_satuan_pendidikan", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("6. simpanPesertaDidikBaru -> buatPesertaDidik + audit(buat_peserta_didik) + revalidatePath", async () => {
    await simpanPesertaDidikBaruAction(
      formData({
        nama: "Budi",
        nisn: "12345678",
        nis: "NIS-1",
        tanggalLahir: "2010-01-01",
        jenisKelamin: "L",
      })
    );
    expect(buatPesertaDidik).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({
        nama: "Budi",
        nisn: "12345678",
        nis: "NIS-1",
        tanggalLahir: "2010-01-01",
        jenisKelamin: "L",
      })
    );
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_peserta_didik",
        target: expect.stringMatching(/^peserta_didik:/),
        beban: expect.objectContaining({ nama: "Budi" }),
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/peserta-didik");
  });

  it("7. ubahPesertaDidik -> ubahPesertaDidik(tx, id, input) + audit(ubah_peserta_didik)", async () => {
    await ubahPesertaDidikAction(
      formData({ id: "pd_7", nama: "Citra", jenisKelamin: "P" })
    );
    expect(ubahPesertaDidik).toHaveBeenCalledWith(
      fakeTxRef,
      "pd_7",
      expect.objectContaining({ nama: "Citra", jenisKelamin: "P" })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "ubah_peserta_didik",
        target: "peserta_didik:pd_7",
      })
    );
  });

  it("8. ubahStatus -> ubahStatus(tx, id, {status, catatan, dibuatOleh}) + audit", async () => {
    await ubahStatusPesertaDidikAction(
      formData({ id: "pd_8", status: "lulus", catatan: "Angkatan 2026" })
    );
    expect(ubahStatus).toHaveBeenCalledWith(
      fakeTxRef,
      "pd_8",
      expect.objectContaining({
        status: "lulus",
        dibuatOleh: "workos_u_1",
      })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "ubah_status_peserta_didik",
        target: "peserta_didik:pd_8",
      })
    );
  });

  it("9. catatMutasi (keluar) -> tambahMutasi THEN ubahStatus(pindah) in same tx + audit(catat_mutasi)", async () => {
    await catatMutasiPesertaDidikAction(
      formData({
        id: "pd_9",
        arah: "keluar",
        tujuanSekolah: "SMP Lain",
        tanggal: "2026-02-01",
      })
    );
    expect(tambahMutasi).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({
        pesertaDidikId: "pd_9",
        arah: "keluar",
        tanggal: "2026-02-01",
      })
    );
    expect(ubahStatus).toHaveBeenCalledWith(
      fakeTxRef,
      "pd_9",
      expect.objectContaining({ status: "pindah" })
    );
    // call order: mutasi BEFORE status (same tx — atomic composition)
    expect(tambahMutasi.mock.invocationCallOrder[0]).toBeLessThan(
      ubahStatus.mock.invocationCallOrder[0]
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "catat_mutasi",
        target: "peserta_didik:pd_9",
      })
    );
    // exactly ONE withTenant call → both repos ran in the SAME tx
    expect(withTenant).toHaveBeenCalledTimes(1);
  });

  it("10. tambahWali -> tambahWali(tx, input) + audit(tambah_wali)", async () => {
    await tambahWaliAction(
      formData({
        pesertaDidikId: "pd_10",
        nama: "Ayah Budi",
        hubungan: "Ayah",
        telepon: "081234",
      })
    );
    expect(tambahWali).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({
        pesertaDidikId: "pd_10",
        nama: "Ayah Budi",
        hubungan: "Ayah",
        telepon: "081234",
      })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "tambah_wali",
        target: "peserta_didik:pd_10",
      })
    );
  });

  it("11. hapusWali -> hapusWali(tx, id) + audit(hapus_wali)", async () => {
    await hapusWaliAction(formData({ id: "wali_11" }));
    expect(hapusWali).toHaveBeenCalledWith(fakeTxRef, "wali_11");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "hapus_wali",
        target: "wali:wali_11",
      })
    );
  });

  it("12. tambahKontakDarurat -> tambahKontakDarurat(tx, input) + audit", async () => {
    await tambahKontakDaruratAction(
      formData({ pesertaDidikId: "pd_12", nama: "Paman", telepon: "0899" })
    );
    expect(tambahKontakDarurat).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({
        pesertaDidikId: "pd_12",
        nama: "Paman",
        telepon: "0899",
      })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ aksi: "tambah_kontak_darurat" })
    );
  });

  it("13. hapusKontakDarurat -> hapusKontakDarurat(tx, id) + audit", async () => {
    await hapusKontakDaruratAction(formData({ id: "kd_13" }));
    expect(hapusKontakDarurat).toHaveBeenCalledWith(fakeTxRef, "kd_13");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ aksi: "hapus_kontak_darurat" })
    );
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary"
// These tests invoke the action DIRECTLY (no page, no button, no fetch guard).
// A client that bypasses the UI and POSTs raw FormData is STILL blocked
// server-side. This is acceptance criterion #5 of issue #7.
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("C1. guru calling simpanPesertaDidikBaru DIRECTLY (no UI) -> denied; no DB write; no audit", async () => {
    // The Peserta Didik page would hide the create form for guru, but a hostile
    // client can bypass the UI and POST the action fn directly. The server
    // MUST still refuse — UI hiding is defense-in-depth, NOT the boundary.
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));

    await expect(
      simpanPesertaDidikBaruAction(
        formData({
          nama: "Hacker",
          tanggalLahir: "2010-01-01",
          jenisKelamin: "L",
        })
      )
    ).rejects.toThrow(/izin/i);

    expect(buatPesertaDidik).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("C2. admin calling simpanPesertaDidikBaru DIRECTLY -> succeeds; DB write + audit happen", async () => {
    // Same direct call, but an admin IS authorized — proving the action
    // distinguishes by server-evaluated role, not by who clicked.
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await simpanPesertaDidikBaruAction(
      formData({
        nama: "Citra",
        tanggalLahir: "2011-05-05",
        jenisKelamin: "P",
      })
    );

    expect(buatPesertaDidik).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("C3. admin WITH pembatasan['peserta_didik:buat'] -> DENIED (pembatasan wins, no superuser)", async () => {
    // identity doc §13: there is NO global superuser. An admin with an active
    // pembatasan_akses row for peserta_didik:buat is STILL refused. The role
    // default does not override the restriction.
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", {
        pembatasan: ["peserta_didik:buat"],
      })
    );

    await expect(
      simpanPesertaDidikBaruAction(
        formData({
          nama: "Locked",
          tanggalLahir: "2010-01-01",
          jenisKelamin: "L",
        })
      )
    ).rejects.toThrow(/izin/i);

    expect(buatPesertaDidik).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("D. tenant tamper-proofing", () => {
  it("14. bogus formData orgId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    // Hostile client injects a victim tenant id into the formData.
    await simpanPesertaDidikBaruAction(
      formData({
        nama: "Budi",
        tanggalLahir: "2010-01-01",
        jenisKelamin: "L",
        orgId: "org_VICTIM",
      })
    );

    // withTenant MUST be called with the membership's orgId, never the
    // tampered formData value. The action never reads formData.orgId.
    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(withTenant).toHaveBeenCalledWith(DB, "org_A", expect.anything());
    expect(withTenant).not.toHaveBeenCalledWith(
      DB,
      "org_VICTIM",
      expect.anything()
    );
    // repo received the tx from withTenant (scoped to org_A), not victim.
    expect(buatPesertaDidik).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({ nama: "Budi" })
    );
  });
});

// ===========================================================================
// E. Validation failures (manual — no zod). Thrown BEFORE any DB/repo call.
// ===========================================================================

describe("E. manual validation failures", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("15. simpanPesertaDidikBaru + empty nama -> /Nama wajib diisi/i; buatPesertaDidik NOT called", async () => {
    await expect(
      simpanPesertaDidikBaruAction(
        formData({ nama: "   ", tanggalLahir: "2010-01-01", jenisKelamin: "L" })
      )
    ).rejects.toThrow(/Nama wajib diisi/i);
    expect(buatPesertaDidik).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("16. simpanPesertaDidikBaru + invalid jenisKelamin -> /Jenis kelamin tidak valid/i", async () => {
    await expect(
      simpanPesertaDidikBaruAction(
        formData({
          nama: "Budi",
          tanggalLahir: "2010-01-01",
          jenisKelamin: "X",
        })
      )
    ).rejects.toThrow(/Jenis kelamin tidak valid/i);
    expect(buatPesertaDidik).not.toHaveBeenCalled();
  });

  it("17. simpanPesertaDidikBaru + nisn not 8 digits -> /NISN harus 8 digit/i", async () => {
    await expect(
      simpanPesertaDidikBaruAction(
        formData({
          nama: "Budi",
          nisn: "123",
          tanggalLahir: "2010-01-01",
          jenisKelamin: "L",
        })
      )
    ).rejects.toThrow(/NISN harus 8 digit/i);
    expect(buatPesertaDidik).not.toHaveBeenCalled();
  });

  it("18. simpanPesertaDidikBaru + missing/invalid tanggalLahir -> /Tanggal lahir wajib berformat YYYY-MM-DD/i", async () => {
    await expect(
      simpanPesertaDidikBaruAction(
        formData({ nama: "Budi", jenisKelamin: "L" })
      )
    ).rejects.toThrow(/Tanggal lahir wajib berformat YYYY-MM-DD/i);
    expect(buatPesertaDidik).not.toHaveBeenCalled();
  });

  it("19. ubahStatus + invalid status -> /Status tidak valid/i; ubahStatus NOT called", async () => {
    await expect(
      ubahStatusPesertaDidikAction(formData({ id: "pd_1", status: "berhenti" }))
    ).rejects.toThrow(/Status tidak valid/i);
    expect(ubahStatus).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F. Non-active context (denied / choose).
// ===========================================================================

describe("F. non-active akses context", () => {
  it("20. getAksesSaya denied -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);

    await expect(
      simpanPesertaDidikBaruAction(
        formData({ nama: "Budi", tanggalLahir: "2010-01-01", jenisKelamin: "L" })
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("21. getAksesSaya choose -> any action throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);

    await expect(
      tambahWaliAction(formData({ pesertaDidikId: "pd_1", nama: "Ayah" }))
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. dev role is admin-equivalent (scoped to seeded tenants — NOT a superuser).
// ===========================================================================

describe("G. dev role behaves like admin", () => {
  it("22. simpanPesertaDidikBaru with dev role -> succeeds (buatPesertaDidik + audit)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("dev"));

    await simpanPesertaDidikBaruAction(
      formData({
        nama: "Citra",
        tanggalLahir: "2011-05-05",
        jenisKelamin: "P",
      })
    );

    expect(buatPesertaDidik).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({ nama: "Citra", jenisKelamin: "P" })
    );
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/peserta-didik");
  });
});

// ===========================================================================
// H. catatMutasi atomic composition — mutasi repo + status repo in one tx,
// with correct arah → status mapping.
// ===========================================================================

describe("H. catatMutasi composition + arah mapping", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
  });

  it("23. catatMutasi arah='masuk' -> ubahStatus called with status='aktif'", async () => {
    await catatMutasiPesertaDidikAction(
      formData({
        id: "pd_23",
        arah: "masuk",
        asalSekolah: "SD Asal",
        tanggal: "2026-01-15",
      })
    );
    expect(tambahMutasi).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({ arah: "masuk" })
    );
    expect(ubahStatus).toHaveBeenCalledWith(
      fakeTxRef,
      "pd_23",
      expect.objectContaining({ status: "aktif" })
    );
  });

  it("24. catatMutasi arah='keluar' -> ubahStatus called with status='pindah'", async () => {
    await catatMutasiPesertaDidikAction(
      formData({
        id: "pd_24",
        arah: "keluar",
        tujuanSekolah: "SMP Tujuan",
        tanggal: "2026-03-01",
      })
    );
    expect(ubahStatus).toHaveBeenCalledWith(
      fakeTxRef,
      "pd_24",
      expect.objectContaining({ status: "pindah" })
    );
  });

  it("25. catatMutasi missing tanggal -> /Tanggal mutasi wajib diisi/i; repos NOT called", async () => {
    await expect(
      catatMutasiPesertaDidikAction(
        formData({ id: "pd_25", arah: "keluar" })
      )
    ).rejects.toThrow(/Tanggal mutasi wajib diisi/i);
    expect(tambahMutasi).not.toHaveBeenCalled();
    expect(ubahStatus).not.toHaveBeenCalled();
  });

  it("26. catatMutasi invalid arah -> /Arah mutasi tidak valid/i; repos NOT called", async () => {
    await expect(
      catatMutasiPesertaDidikAction(
        formData({ id: "pd_26", arah: "nyasar", tanggal: "2026-01-01" })
      )
    ).rejects.toThrow(/Arah mutasi tidak valid/i);
    expect(tambahMutasi).not.toHaveBeenCalled();
    expect(ubahStatus).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// I. P1-5 — tenant-scoped existence check. A missing or cross-tenant id must
// produce a clear error BEFORE any write/audit runs. RLS makes cariPesertaDidikById
// return null for a cross-tenant id; the action must throw on that null.
// ===========================================================================

describe("I. P1-5 existence check — missing/cross-tenant id rejected pre-write", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    cariPesertaDidikById.mockResolvedValue(null);
  });

  it("27. ubahStatus + unknown id -> /tidak ditemukan/i; ubahStatus + audit NOT called", async () => {
    await expect(
      ubahStatusPesertaDidikAction(formData({ id: "pd_X", status: "lulus" }))
    ).rejects.toThrow(/tidak ditemukan/i);
    expect(ubahStatus).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("28. tambahWali + unknown pesertaDidikId -> /tidak ditemukan/i; tambahWali NOT called", async () => {
    await expect(
      tambahWaliAction(formData({ pesertaDidikId: "pd_X", nama: "Ayah" }))
    ).rejects.toThrow(/tidak ditemukan/i);
    expect(tambahWali).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});
