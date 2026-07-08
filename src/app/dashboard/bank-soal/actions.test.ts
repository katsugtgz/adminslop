import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors src/app/dashboard/permintaan-ai/actions.test.ts: hoist all mocks,
// mock the modules to wire them in, then import the actions. No ownership
// chain (unlike penilaian) — the action delegates everything to the mocked
// repo fns, so fakeTx is a plain sentinel.

const mocks = vi.hoisted(() => {
  // fakeTxLocal models a Drizzle tx handle. The `.transaction(fn)` method
  // mirrors Drizzle's nested-transaction SAVEPOINT semantics: it invokes `fn`
  // with a (fake) savepoint handle, and if `fn` throws, the throw propagates
  // (the action's try/catch then records the failure). The savepoint handle is
  // fakeTxLocal itself so `buatButirSoal(fakeTxRef, ...)` assertions still hold.
  const fakeTxLocal: {
    __tx: true;
    transaction: (fn: (sp: unknown) => Promise<unknown>) => Promise<unknown>;
  } = {
    __tx: true,
    transaction: async (fn) => fn(fakeTxLocal),
  };
  return {
    getAksesSaya: vi.fn(),
    requireAksesAktif: vi.fn(),
    requireAuth: vi.fn(async () => ({ userId: "workos_u_1" })),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTxLocal)
    ),
    catatAudit: vi.fn(async () => undefined),
    // bank-soal repos
    buatButirSoal: vi.fn(async () => ({ id: "bs_new" })),
    ubahButirSoal: vi.fn(async () => ({ id: "bs_1" })),
    arsipkanButirSoal: vi.fn(async () => ({ id: "bs_1", status: "arsip" })),
    buatPaketSoal: vi.fn(async () => ({ id: "ps_new" })),
    tambahButirKePaket: vi.fn(async () => ({ id: "psb_new" })),
    hapusButirDariPaket: vi.fn(async () => undefined),
    revalidatePath: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const {
  getAksesSaya,
  requireAksesAktif,
  requireAuth,
  getDb,
  withTenant,
  catatAudit,
  buatButirSoal,
  ubahButirSoal,
  arsipkanButirSoal,
  buatPaketSoal,
  tambahButirKePaket,
  hapusButirDariPaket,
  revalidatePath,
  fakeTx: fakeTxRef,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
  requireAksesAktif: mocks.requireAksesAktif,
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: mocks.requireAuth,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/bank-soal", () => ({
  buatButirSoal: mocks.buatButirSoal,
  ubahButirSoal: mocks.ubahButirSoal,
  arsipkanButirSoal: mocks.arsipkanButirSoal,
  buatPaketSoal: mocks.buatPaketSoal,
  tambahButirKePaket: mocks.tambahButirKePaket,
  hapusButirDariPaket: mocks.hapusButirDariPaket,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  arsipkanButirSoalAction,
  buatButirSoalAction,
  buatPaketSoalAction,
  hapusButirDariPaketAction,
  imporButirSoalJsonAction,
  tambahButirKePaketAction,
  ubahButirSoalAction,
} from "./actions";

// --- helpers ---------------------------------------------------------------

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

const TX = expect.anything();

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default).
 *
 * Role defaults for the Bank Soal domain (#16):
 *   admin / dev           — full CRUD on butir + paket
 *   guru                  — full CRUD on butir + paket (authors + assembles)
 *   wali_kelas            — read only (NO writes)
 *   kepala_sekolah        — read only (NO writes)
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "bank_soal:baca",
      "bank_soal:buat",
      "bank_soal:ubah",
      "paket_soal:baca",
      "paket_soal:buat",
      "paket_soal:ubah",
    ],
    dev: [
      "bank_soal:baca",
      "bank_soal:buat",
      "bank_soal:ubah",
      "paket_soal:baca",
      "paket_soal:buat",
      "paket_soal:ubah",
    ],
    kepala_sekolah: ["bank_soal:baca", "paket_soal:baca"],
    guru: [
      "bank_soal:baca",
      "bank_soal:buat",
      "bank_soal:ubah",
      "paket_soal:baca",
      "paket_soal:buat",
      "paket_soal:ubah",
    ],
    wali_kelas: ["bank_soal:baca", "paket_soal:baca"],
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
  requireAksesAktif.mockReset();
  requireAuth.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  buatButirSoal.mockReset();
  ubahButirSoal.mockReset();
  arsipkanButirSoal.mockReset();
  buatPaketSoal.mockReset();
  tambahButirKePaket.mockReset();
  hapusButirDariPaket.mockReset();
  revalidatePath.mockReset();
  requireAuth.mockResolvedValue({ userId: "workos_u_1" });
  requireAksesAktif.mockImplementation(
    async (izin: string, pesanTolak?: string) => {
      const akses = await getAksesSaya();
      if (!akses || akses.status !== "active") {
        throw new Error("Satuan Pendidikan Aktif belum dipilih.");
      }
      if (!akses.boleh(izin).diizinkan) {
        throw new Error(
          pesanTolak ?? "Anda tidak memiliki izin untuk aksi ini."
        );
      }
      return akses;
    }
  );
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(
    async (
      _db: unknown,
      _tenantId: unknown,
      fn: (tx: unknown) => Promise<unknown>
    ) => fn(fakeTxRef)
  );
  buatButirSoal.mockResolvedValue({ id: "bs_new" });
  ubahButirSoal.mockResolvedValue({ id: "bs_1" });
  arsipkanButirSoal.mockResolvedValue({ id: "bs_1", status: "arsip" });
  buatPaketSoal.mockResolvedValue({ id: "ps_new" });
  tambahButirKePaket.mockResolvedValue({ id: "psb_new" });
  hapusButirDariPaket.mockResolvedValue(undefined);
  catatAudit.mockResolvedValue(undefined);
});

// ===========================================================================
// A. Role denial — wali_kelas + kepala_sekolah hold read-only slugs. Any
// write action MUST throw BEFORE any DB work (gate 1).
// ===========================================================================

describe("A. role denial — wali_kelas + kepala_sekolah (read-only)", () => {
  it.each<[RoleSlug]>([["wali_kelas"], ["kepala_sekolah"]])(
    "%s calling buatButirSoalAction -> throws /izin/i; buatButirSoal + audit NOT called",
    async (role) => {
      getAksesSaya.mockResolvedValue(aksesAktif(role));
      await expect(
        buatButirSoalAction(
          formData({
            mataPelajaranId: "mp_1",
            jenis: "pg",
            pertanyaan: "Q?",
            kunciJawaban: "A",
          })
        )
      ).rejects.toThrow(/izin/i);
      expect(buatButirSoal).not.toHaveBeenCalled();
      expect(catatAudit).not.toHaveBeenCalled();
      expect(withTenant).not.toHaveBeenCalled();
    }
  );

  it("wali_kelas calling buatPaketSoalAction -> throws /izin/i; buatPaketSoal NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await expect(
      buatPaketSoalAction(
        formData({
          nama: "Paket",
          mataPelajaranId: "mp_1",
          tahunAjaranId: "ta_1",
        })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatPaketSoal).not.toHaveBeenCalled();
  });

  it("kepala_sekolah calling tambahButirKePaketAction -> throws /izin/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));
    await expect(
      tambahButirKePaketAction(
        formData({
          paketSoalId: "ps_1",
          butirSoalId: "bs_1",
          urutan: "1",
        })
      )
    ).rejects.toThrow(/izin/i);
    expect(tambahButirKePaket).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Guru success — has all six Bank Soal slugs. Asserts the repo + audit
// are called with the parsed formData + the active userId.
// ===========================================================================

describe("B. guru success — full Bank Soal CRUD", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("buatButirSoalAction -> buatButirSoal(dibuatOleh) + audit(buat_butir_soal)", async () => {
    await buatButirSoalAction(
      formData({
        mataPelajaranId: "mp_1",
        jenis: "pg",
        pertanyaan: "Berapakah 2+2?",
        kunciJawaban: "B",
        pembahasan: "2+2=4.",
        pilihan: '{"A":"3","B":"4"}',
      })
    );
    expect(buatButirSoal).toHaveBeenCalledWith(fakeTxRef, {
      mataPelajaranId: "mp_1",
      tingkatId: null,
      jenis: "pg",
      pertanyaan: "Berapakah 2+2?",
      pilihan: { A: "3", B: "4" },
      kunciJawaban: "B",
      pembahasan: "2+2=4.",
      drafAiId: null,
      dibuatOleh: "workos_u_1",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "buat_butir_soal",
        target: "butir_soal:bs_new",
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/bank-soal");
  });

  it("ubahButirSoalAction -> ubahButirSoal(patch) + audit(ubah_butir_soal)", async () => {
    await ubahButirSoalAction(
      formData({ id: "bs_1", pertanyaan: "Pertanyaan baru." })
    );
    expect(ubahButirSoal).toHaveBeenCalledWith(
      fakeTxRef,
      "bs_1",
      expect.objectContaining({ pertanyaan: "Pertanyaan baru." })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "ubah_butir_soal",
        target: "butir_soal:bs_1",
      })
    );
  });

  it("arsipkanButirSoalAction -> arsipkanButirSoal + audit(arsipkan_butir_soal)", async () => {
    await arsipkanButirSoalAction(formData({ id: "bs_1" }));
    expect(arsipkanButirSoal).toHaveBeenCalledWith(fakeTxRef, "bs_1");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "arsipkan_butir_soal",
        target: "butir_soal:bs_1",
      })
    );
  });

  it("buatPaketSoalAction -> buatPaketSoal(dibuatOleh) + audit(buat_paket_soal)", async () => {
    await buatPaketSoalAction(
      formData({
        nama: "Paket UTS",
        mataPelajaranId: "mp_1",
        tahunAjaranId: "ta_1",
        semester: "ganjil",
      })
    );
    expect(buatPaketSoal).toHaveBeenCalledWith(fakeTxRef, {
      nama: "Paket UTS",
      mataPelajaranId: "mp_1",
      tingkatId: null,
      tahunAjaranId: "ta_1",
      semester: "ganjil",
      dibuatOleh: "workos_u_1",
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "buat_paket_soal",
        target: "paket_soal:ps_new",
      })
    );
  });

  it("tambahButirKePaketAction -> tambahButirKePaket(urutan parsed as number, bobot default undefined)", async () => {
    await tambahButirKePaketAction(
      formData({
        paketSoalId: "ps_1",
        butirSoalId: "bs_1",
        urutan: "3",
      })
    );
    expect(tambahButirKePaket).toHaveBeenCalledWith(fakeTxRef, {
      paketSoalId: "ps_1",
      butirSoalId: "bs_1",
      urutan: 3,
      bobot: undefined,
    });
  });

  it("tambahButirKePaketAction with bobot -> bobot passed as string", async () => {
    await tambahButirKePaketAction(
      formData({
        paketSoalId: "ps_1",
        butirSoalId: "bs_1",
        urutan: "1",
        bobot: "2.5",
      })
    );
    expect(tambahButirKePaket).toHaveBeenCalledWith(fakeTxRef, {
      paketSoalId: "ps_1",
      butirSoalId: "bs_1",
      urutan: 1,
      bobot: "2.5",
    });
  });

  it("hapusButirDariPaketAction -> hapusButirDariPaket(pair) + audit", async () => {
    await hapusButirDariPaketAction(
      formData({ paketSoalId: "ps_1", butirSoalId: "bs_1" })
    );
    expect(hapusButirDariPaket).toHaveBeenCalledWith(
      fakeTxRef,
      "ps_1",
      "bs_1"
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "hapus_butir_dari_paket",
        target: "paket_soal:ps_1",
      })
    );
  });
});

// ===========================================================================
// C. AC#5 PROOF BLOCK — "hiding UI is not the authorization boundary". A
// client that bypasses the UI and POSTs raw FormData to the action fn is
// STILL decided correctly server-side: guru create succeeds, wali_kelas
// denied, admin with pembatasan denied (no superuser).
// ===========================================================================

describe("AC#5: hiding UI is not the authorization boundary", () => {
  it("guru (has bank_soal:buat) calling buatButirSoalAction DIRECTLY -> succeeds (repo called)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    await buatButirSoalAction(
      formData({
        mataPelajaranId: "mp_1",
        jenis: "essay",
        pertanyaan: "Q?",
        kunciJawaban: "A",
      })
    );
    expect(buatButirSoal).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledTimes(1);
  });

  it("wali_kelas (no bank_soal:buat) calling buatButirSoalAction DIRECTLY -> throws /izin/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));
    await expect(
      buatButirSoalAction(
        formData({
          mataPelajaranId: "mp_1",
          jenis: "essay",
          pertanyaan: "Q?",
          kunciJawaban: "A",
        })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatButirSoal).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("admin WITH pembatasan['bank_soal:buat'] calling buatButirSoalAction -> DENY (no superuser, §13)", async () => {
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", {
        pembatasan: ["bank_soal:buat"],
      })
    );
    await expect(
      buatButirSoalAction(
        formData({
          mataPelajaranId: "mp_1",
          jenis: "essay",
          pertanyaan: "Q?",
          kunciJawaban: "A",
        })
      )
    ).rejects.toThrow(/izin/i);
    expect(buatButirSoal).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. AC#2 PROOF — the action does NOT short-circuit on drafAiId; it passes
// the value through to the repo, which is the authoritative verification
// gate. The repo mock here is set up to THROW on a menunggu draft to prove
// the propagation path. A disetujui draft flows through normally.
// ===========================================================================

describe("AC#2: action propagates drafAiId to the repo verification gate", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("drafAiId disetujui -> buatButirSoal called with drafAiId (repo permits)", async () => {
    await buatButirSoalAction(
      formData({
        mataPelajaranId: "mp_1",
        jenis: "essay",
        pertanyaan: "[AI] ...",
        kunciJawaban: "A",
        drafAiId: "da_disetujui",
      })
    );
    expect(buatButirSoal).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({ drafAiId: "da_disetujui" })
    );
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        beban: expect.objectContaining({ drafAiId: "da_disetujui" }),
      })
    );
  });

  it("drafAiId menunggu -> repo throws 'belum diverifikasi' (action propagates, audit NOT called)", async () => {
    buatButirSoal.mockRejectedValueOnce(
      new Error("Konten AI belum diverifikasi tidak dapat digunakan.")
    );
    await expect(
      buatButirSoalAction(
        formData({
          mataPelajaranId: "mp_1",
          jenis: "essay",
          pertanyaan: "[AI] ...",
          kunciJawaban: "A",
          drafAiId: "da_menunggu",
        })
      )
    ).rejects.toThrow(/belum diverifikasi/i);
    expect(buatButirSoal).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({ drafAiId: "da_menunggu" })
    );
    // Audit NOT called: the repo threw BEFORE the action reached catatAudit.
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// E. Validation — manual checks throw BEFORE withTenant / repo.
// ===========================================================================

describe("E. validation — throws before any DB work", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
  });

  it("buatButirSoalAction missing pertanyaan -> throws /Pertanyaan wajib/i; repo NOT called", async () => {
    await expect(
      buatButirSoalAction(
        formData({
          mataPelajaranId: "mp_1",
          jenis: "pg",
          pertanyaan: "",
          kunciJawaban: "A",
        })
      )
    ).rejects.toThrow(/Pertanyaan wajib/i);
    expect(buatButirSoal).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("buatButirSoalAction invalid jenis -> throws /Jenis Butir Soal tidak valid/i", async () => {
    await expect(
      buatButirSoalAction(
        formData({
          mataPelajaranId: "mp_1",
          jenis: "invalid_type",
          pertanyaan: "Q?",
          kunciJawaban: "A",
        })
      )
    ).rejects.toThrow(/Jenis Butir Soal tidak valid/i);
    expect(buatButirSoal).not.toHaveBeenCalled();
  });

  it("buatPaketSoalAction missing nama -> throws /Nama Paket wajib/i", async () => {
    await expect(
      buatPaketSoalAction(
        formData({ nama: "", mataPelajaranId: "mp_1", tahunAjaranId: "ta_1" })
      )
    ).rejects.toThrow(/Nama Paket wajib/i);
    expect(buatPaketSoal).not.toHaveBeenCalled();
  });

  it("tambahButirKePaketAction non-numeric urutan -> throws /Urutan harus berupa angka/i", async () => {
    await expect(
      tambahButirKePaketAction(
        formData({
          paketSoalId: "ps_1",
          butirSoalId: "bs_1",
          urutan: "abc",
        })
      )
    ).rejects.toThrow(/Urutan harus berupa angka/i);
    expect(tambahButirKePaket).not.toHaveBeenCalled();
  });

  // BUGS-05: malformed pilihan JSON must throw a Bahasa validation error BEFORE
  // any DB work — not a raw SyntaxError ("Unexpected token...") that leaks
  // parser internals.
  it("buatButirSoalAction malformed pilihan JSON -> throws /Format pilihan tidak valid/i; repo NOT called", async () => {
    await expect(
      buatButirSoalAction(
        formData({
          mataPelajaranId: "mp_1",
          jenis: "pg",
          pertanyaan: "Q?",
          kunciJawaban: "A",
          pilihan: "{not json",
        })
      )
    ).rejects.toThrow(/Format pilihan tidak valid/i);
    expect(buatButirSoal).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("ubahButirSoalAction malformed pilihan JSON -> throws /Format pilihan tidak valid/i; repo NOT called", async () => {
    await expect(
      ubahButirSoalAction(
        formData({ id: "bs_1", pilihan: "[oops,]" })
      )
    ).rejects.toThrow(/Format pilihan tidak valid/i);
    expect(ubahButirSoal).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// F. Context — denied / choose branches.
// ===========================================================================

describe("F. context resolution — non-active branches throw", () => {
  it("denied -> throws /Satuan Pendidikan Aktif belum dipilih/i", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(
      buatButirSoalAction(
        formData({
          mataPelajaranId: "mp_1",
          jenis: "pg",
          pertanyaan: "Q?",
          kunciJawaban: "A",
        })
      )
    ).rejects.toThrow(/Satuan Pendidikan Aktif belum dipilih/i);
    expect(buatButirSoal).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("choose -> throws /Satuan Pendidikan Aktif belum dipilih/i", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [{ orgId: "org_A", orgName: "A", roleSlug: "guru" }],
    } as AksesSaya);
    await expect(
      buatPaketSoalAction(
        formData({
          nama: "Paket",
          mataPelajaranId: "mp_1",
          tahunAjaranId: "ta_1",
        })
      )
    ).rejects.toThrow(/Satuan Pendidikan Aktif belum dipilih/i);
    expect(buatPaketSoal).not.toHaveBeenCalled();
  });
});

describe("G. imporButirSoalJsonAction", () => {
  const validButir = {
    mataPelajaranId: "mp_1",
    tingkatId: "t_1",
    jenis: "pg",
    pertanyaan: "Berapakah 2+2?",
    pilihan: { A: "3", B: "4", C: "5", D: "6" },
    kunciJawaban: "B",
    pembahasan: "2+2=4.",
  };

  it("rejects when requireAksesAktif throws (prologue propagates, no DB work)", async () => {
    requireAksesAktif.mockRejectedValueOnce(new Error("Belum terautentikasi."));

    await expect(
      imporButirSoalJsonAction(null, formData({ jsonButir: "[]" }))
    ).rejects.toThrow(/Belum terautentikasi/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("rejects no active tenant", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);

    await expect(
      imporButirSoalJsonAction(null, formData({ jsonButir: "[]" }))
    ).rejects.toThrow(/Satuan Pendidikan Aktif belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("rejects without bank_soal:buat permission", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("wali_kelas"));

    await expect(
      imporButirSoalJsonAction(null, formData({ jsonButir: "[]" }))
    ).rejects.toThrow(/izin/i);
    expect(buatButirSoal).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));

    const hasil = await imporButirSoalJsonAction(
      null,
      formData({ jsonButir: "{" })
    );

    expect(hasil.ok).toBe(false);
    expect(hasil.errors[0]).toMatch(/JSON tidak valid/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("rejects non-array JSON", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));

    const hasil = await imporButirSoalJsonAction(
      null,
      formData({ jsonButir: JSON.stringify(validButir) })
    );

    expect(hasil).toEqual({
      ok: false,
      tersimpan: 0,
      gagal: 0,
      errors: ["JSON harus berupa array butir soal."],
    });
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("imports valid array successfully", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    buatButirSoal
      .mockResolvedValueOnce({ id: "bs_1" })
      .mockResolvedValueOnce({ id: "bs_2" });

    const hasil = await imporButirSoalJsonAction(
      null,
      formData({ jsonButir: JSON.stringify([validButir, validButir]) })
    );

    expect(hasil).toEqual({ ok: true, tersimpan: 2, gagal: 0, errors: [] });
    expect(buatButirSoal).toHaveBeenCalledTimes(2);
    expect(buatButirSoal).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({
        mataPelajaranId: "mp_1",
        tingkatId: "t_1",
        jenis: "pg",
        dibuatOleh: "workos_u_1",
      })
    );
    const calls = buatButirSoal.mock.calls as unknown as [
      unknown,
      Record<string, unknown>,
    ][];
    expect(calls[0][1]).not.toHaveProperty("drafAiId");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/bank-soal");
  });

  it("skips invalid items and still imports valid ones", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));

    const hasil = await imporButirSoalJsonAction(
      null,
      formData({
        jsonButir: JSON.stringify([
          { ...validButir, pertanyaan: "" },
          { ...validButir, jenis: "essay", pilihan: null },
        ]),
      })
    );

    expect(hasil.ok).toBe(true);
    expect(hasil.tersimpan).toBe(1);
    expect(hasil.gagal).toBe(1);
    expect(hasil.errors).toContain("Butir 1: pertanyaan wajib diisi.");
    expect(buatButirSoal).toHaveBeenCalledTimes(1);
    expect(buatButirSoal).toHaveBeenCalledWith(
      fakeTxRef,
      expect.objectContaining({ jenis: "essay", pilihan: null })
    );
  });

  it("records audit per import", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    buatButirSoal
      .mockResolvedValueOnce({ id: "bs_1" })
      .mockResolvedValueOnce({ id: "bs_2" });

    await imporButirSoalJsonAction(
      null,
      formData({ jsonButir: JSON.stringify([validButir, validButir]) })
    );

    expect(catatAudit).toHaveBeenCalledTimes(2);
    expect(catatAudit).toHaveBeenNthCalledWith(
      1,
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "impor-ai-eksternal",
        target: "butir_soal:bs_1",
        beban: {
          provenance: expect.stringMatching(
            /^eksternal-pengguna:workos_u_1:pg:/
          ),
        },
      })
    );
  });

  it("enforces tenant isolation through active membership orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));

    await imporButirSoalJsonAction(
      null,
      formData({
        tenantId: "org_B",
        jsonButir: JSON.stringify([{ ...validButir, tenantId: "org_B" }]),
      })
    );

    expect(withTenant).toHaveBeenCalledWith(
      expect.anything(),
      "org_A",
      expect.any(Function)
    );
    expect(buatButirSoal).toHaveBeenCalledWith(
      fakeTxRef,
      expect.not.objectContaining({ tenantId: "org_B" })
    );
  });

  // =========================================================================
  // BUGS-02 + SEC-02 — honest counts (no tx poisoning) + no raw DB leak.
  // =========================================================================

  it("BUGS-02: one failed insert among a batch reports honest tersimpan (not inflated)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    // First kandidat saves, second throws a DB-shaped error.
    buatButirSoal
      .mockResolvedValueOnce({ id: "bs_ok" })
      .mockRejectedValueOnce(
        new Error(
          'insert or update on table "butir_soal" violates foreign key constraint "butir_soal_mata_pelajaran_id_fkey"'
        )
      );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const hasil = await imporButirSoalJsonAction(
      null,
      formData({ jsonButir: JSON.stringify([validButir, validButir]) })
    );

    expect(hasil.ok).toBe(true); // ok = at least one saved (matches tersimpan>0)
    expect(hasil.tersimpan).toBe(1); // HONEST: only one row actually committed
    expect(hasil.gagal).toBe(1);
    expect(buatButirSoal).toHaveBeenCalledTimes(2);
    expect(catatAudit).toHaveBeenCalledTimes(1); // only the successful row's audit
    errSpy.mockRestore();
  });

  it("SEC-02: raw DB error text never reaches the client error message", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    const rawDbMessage =
      'duplicate key value violates unique constraint "butir_soal_pertanyaan_key"';
    buatButirSoal.mockRejectedValueOnce(new Error(rawDbMessage));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const hasil = await imporButirSoalJsonAction(
      null,
      formData({ jsonButir: JSON.stringify([validButir]) })
    );

    expect(hasil.tersimpan).toBe(0);
    expect(hasil.gagal).toBe(1);
    expect(hasil.errors).toHaveLength(1);
    const msg = hasil.errors[0];
    expect(msg).toMatch(/Butir 1: gagal disimpan\.$/);
    // The raw Postgres internals MUST NOT be present anywhere in the message.
    expect(msg).not.toMatch(/duplicate key/i);
    expect(msg).not.toMatch(/constraint/i);
    expect(msg).not.toMatch(/butir_soal_pertanyaan_key/);
    expect(msg).not.toContain(rawDbMessage);
    // Real error is logged server-side for operator triage.
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Butir 1 gagal disimpan/),
      expect.any(Error)
    );
    errSpy.mockRestore();
  });

  it("SEC-02: KepemilikanError message IS preserved (intentional user-facing denial)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    const { KepemilikanError } = await import("@/lib/auth/kepemilikan");
    buatButirSoal.mockRejectedValueOnce(
      new KepemilikanError("Anda tidak memiliki izin untuk sumber daya ini.")
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const hasil = await imporButirSoalJsonAction(
      null,
      formData({ jsonButir: JSON.stringify([validButir]) })
    );

    expect(hasil.tersimpan).toBe(0);
    expect(hasil.gagal).toBe(1);
    expect(hasil.errors).toEqual([
      "Butir 1: Anda tidak memiliki izin untuk sumber daya ini.",
    ]);
    // KepemilikanError is intentional — must NOT be logged as an unexpected error.
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
