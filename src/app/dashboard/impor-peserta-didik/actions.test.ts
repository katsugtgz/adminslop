import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";

// --- hoisted mocks ---------------------------------------------------------

const mocks = vi.hoisted(() => {
  // BUGS-06: the dedup probe now runs as an inline
  // `tx.select({nisn,nis}).from(pesertaDidik).where(inArray(...))` instead of
  // the mocked listPesertaDidik(tx, 100000) full scan. `dedupRows.current` is
  // the configurable result set returned by the mocked select chain.
  const dedupRows: {
    current: { nisn: string | null; nis: string | null }[];
  } = { current: [] };
  const fakeTx = {
    __tx: true,
    select: vi.fn(() => ({
      from: () => ({
        where: () => Promise.resolve(dedupRows.current),
      }),
    })),
  };
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTx)
    ),
    catatAudit: vi.fn(async () => undefined),
    buatPesertaDidikBatch: vi.fn(
      async (
        _tx: unknown,
        inputs: readonly {
          nama: string;
          nisn?: string | null;
          nis?: string | null;
          tanggalLahir: string;
          jenisKelamin: string;
        }[]
      ) =>
        inputs.map((input) => ({
          id: `pd_${input.nama}`,
          tenantId: "org_A",
          nama: input.nama,
          nisn: input.nisn ?? null,
          nis: input.nis ?? null,
          tanggalLahir: input.tanggalLahir,
          jenisKelamin: input.jenisKelamin,
          status: "aktif",
          dibuatPada: new Date("2026-01-01T00:00:00Z"),
          diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
        }))
    ),
    revalidatePath: vi.fn(),
    fakeTx,
    dedupRows,
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  buatPesertaDidikBatch,
  revalidatePath,
  fakeTx: fakeTxRef,
  dedupRows,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
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
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/peserta-didik", () => ({
  buatPesertaDidikBatch: mocks.buatPesertaDidikBatch,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { imporPesertaDidikAction } from "./actions";

// --- helpers ---------------------------------------------------------------

function formDataCsv(csv: string, extra?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.append("file", csv);
  if (extra) for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
}

const TX = expect.anything();
const DB = expect.anything();

/**
 * Build an "active" AksesSaya whose `boleh()` mirrors the REAL evaluasiAkses
 * precedence, scoped to the impor/ekspor izin vocabulary.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: [
      "impor_peserta_didik:baca",
      "impor_peserta_didik:kelola",
      "ekspor_peserta_didik:baca",
    ],
    dev: [
      "impor_peserta_didik:baca",
      "impor_peserta_didik:kelola",
      "ekspor_peserta_didik:baca",
    ],
    kepala_sekolah: ["impor_peserta_didik:baca", "ekspor_peserta_didik:baca"],
    guru: [],
    wali_kelas: [],
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

const CSV_HEADER = "nama,nisn,nis,tanggalLahir,jenisKelamin";

beforeEach(() => {
  getAksesSaya.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  buatPesertaDidikBatch.mockReset();
  revalidatePath.mockReset();
  dedupRows.current = [];
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(async (_db, _t, fn) => fn(fakeTxRef));
  catatAudit.mockResolvedValue(undefined);
  buatPesertaDidikBatch.mockImplementation(async (_tx, inputs) =>
    inputs.map((input: { nama: string; nisn?: string | null; nis?: string | null; tanggalLahir: string; jenisKelamin: string }) => ({
      id: `pd_${input.nama}`,
      tenantId: "org_A",
      nama: input.nama,
      nisn: input.nisn ?? null,
      nis: input.nis ?? null,
      tanggalLahir: input.tanggalLahir,
      jenisKelamin: input.jenisKelamin,
      status: "aktif",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
      diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
    }))
  );
});

// ===========================================================================
// A. Authorization denial — guru has no impor_peserta_didik:kelola.
// ===========================================================================

describe("A. authorization denial — guru (no impor izin)", () => {
  it("imporPesertaDidikAction -> throws /izin/i; buatPesertaDidikBatch + audit + withTenant NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));

    await expect(
      imporPesertaDidikAction(
        formDataCsv(`${CSV_HEADER}\nBudi,12345678,N1,2010-05-15,L`)
      )
    ).rejects.toThrow(/izin/i);

    expect(buatPesertaDidikBatch).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("kepala_sekolah (impor:baca only, NOT kelola) -> throws /izin/i", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("kepala_sekolah"));

    await expect(
      imporPesertaDidikAction(
        formDataCsv(`${CSV_HEADER}\nBudi,12345678,N1,2010-05-15,L`)
      )
    ).rejects.toThrow(/izin/i);

    expect(buatPesertaDidikBatch).not.toHaveBeenCalled();
  });

  it("admin WITH pembatasan['impor_peserta_didik:kelola'] -> DENIED (no superuser)", async () => {
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", {
        pembatasan: ["impor_peserta_didik:kelola"],
      })
    );

    await expect(
      imporPesertaDidikAction(
        formDataCsv(`${CSV_HEADER}\nBudi,12345678,N1,2010-05-15,L`)
      )
    ).rejects.toThrow(/izin/i);

    expect(buatPesertaDidikBatch).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. Authorization success — admin imports a clean file.
// ===========================================================================

describe("B. authorization success — admin clean import", () => {
  it("2 valid rows -> buatPesertaDidikBatch x1 (batch) + audit(impor_peserta_didik) + revalidatePath", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await imporPesertaDidikAction(
      formDataCsv(
        [
          CSV_HEADER,
          "Budi Santoso,12345678,N1,2010-05-15,L",
          "Siti Aminah,87654321,N2,2011-03-20,P",
        ].join("\n")
      )
    );

    expect(buatPesertaDidikBatch).toHaveBeenCalledTimes(1);
    expect(buatPesertaDidikBatch).toHaveBeenCalledWith(fakeTxRef, [
      {
        nama: "Budi Santoso",
        nisn: "12345678",
        nis: "N1",
        tanggalLahir: "2010-05-15",
        jenisKelamin: "L",
      },
      {
        nama: "Siti Aminah",
        nisn: "87654321",
        nis: "N2",
        tanggalLahir: "2011-03-20",
        jenisKelamin: "P",
      },
    ]);
    expect(catatAudit).toHaveBeenCalledTimes(1);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "impor_peserta_didik",
        beban: expect.objectContaining({ total: 2, berhasil: 2 }),
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/impor-peserta-didik");
  });

  it("rows without nisn/nis still insert (optional fields)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await imporPesertaDidikAction(
      formDataCsv(`${CSV_HEADER}\nBudi,,,2010-05-15,L`)
    );

    expect(buatPesertaDidikBatch).toHaveBeenCalledTimes(1);
    expect(buatPesertaDidikBatch).toHaveBeenCalledWith(fakeTxRef, [
      {
        nama: "Budi",
        nisn: null,
        nis: null,
        tanggalLahir: "2010-05-15",
        jenisKelamin: "L",
      },
    ]);
  });
});

// ===========================================================================
// C. Validation errors — hard-invalid rows throw a summary (valid rows persist).
// ===========================================================================

describe("C. validation errors — tidak_valid rows", () => {
  it("1 valid + 1 tidak_valid (missing nama) -> valid inserted, audit, then throws summary", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    // Row 2 valid; Row 3 missing nama -> tidak_valid.
    await expect(
      imporPesertaDidikAction(
        formDataCsv(
          [
            CSV_HEADER,
            "Budi,12345678,N1,2010-05-15,L",
            ",99999999,N2,2011-01-01,P",
          ].join("\n")
        )
      )
    ).rejects.toThrow(/tidak valid|gagal/i);

    // the one valid row WAS inserted before the summary throw
    expect(buatPesertaDidikBatch).toHaveBeenCalledTimes(1);
    expect(buatPesertaDidikBatch).toHaveBeenCalledWith(fakeTxRef, [
      {
        nama: "Budi",
        nisn: "12345678",
        nis: "N1",
        tanggalLahir: "2010-05-15",
        jenisKelamin: "L",
      },
    ]);
    // audit captured the summary including the failure count
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        beban: expect.objectContaining({ berhasil: 1, tidak_valid: 1 }),
      })
    );
  });
});

// ===========================================================================
// D. AC#5 — no silent overwrite: duplicate NISN against existing -> perlu_koreksi, NOT inserted.
// ===========================================================================

describe("D. duplicate handling (AC#5 — no silent overwrite)", () => {
  it("NISN already in tenant -> row 'perlu_koreksi', NOT inserted; does NOT throw (softer)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));
    // BUGS-06: the dedup probe returns only the colliding NISN projection.
    dedupRows.current = [{ nisn: "12345678", nis: null }];

    // The duplicate row is skipped (perlu_koreksi); a second fresh row inserts.
    await imporPesertaDidikAction(
      formDataCsv(
        [
          CSV_HEADER,
          "Budi,12345678,N1,2010-05-15,L", // dup NISN -> perlu_koreksi
          "Siti,87654321,N2,2011-03-20,P", // fresh -> valid
        ].join("\n")
      )
    );

    // only the fresh row inserted
    expect(buatPesertaDidikBatch).toHaveBeenCalledTimes(1);
    expect(buatPesertaDidikBatch).toHaveBeenCalledWith(fakeTxRef, [
      {
        nama: "Siti",
        nisn: "87654321",
        nis: "N2",
        tanggalLahir: "2011-03-20",
        jenisKelamin: "P",
      },
    ]);
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        beban: expect.objectContaining({ berhasil: 1, perlu_koreksi: 1 }),
      })
    );
  });
});

// ===========================================================================
// E. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("E. tenant tamper-proofing", () => {
  it("bogus formData tenantId is IGNORED; withTenant uses membership.orgId", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await imporPesertaDidikAction(
      formDataCsv(`${CSV_HEADER}\nBudi,,,2010-05-15,L`, {
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

// ===========================================================================
// F. Input failures.
// ===========================================================================

describe("F. input failures", () => {
  it("missing file field -> throws /berkas/i; no DB", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    const fd = new FormData();
    await expect(imporPesertaDidikAction(fd)).rejects.toThrow(/berkas/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("malformed CSV (unclosed quote) -> throws; no DB write", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await expect(
      imporPesertaDidikAction(
        formDataCsv(`${CSV_HEADER}\n"Unclosed,12345678,N1,2010-05-15,L`)
      )
    ).rejects.toThrow(/tidak valid/i);

    expect(buatPesertaDidikBatch).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("CSV missing 'nama' header -> throws /nama/i; no DB write", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    await expect(
      imporPesertaDidikAction(
        formDataCsv(`nisn,nis,tanggalLahir,jenisKelamin\n12345678,N1,2010-05-15,L`)
      )
    ).rejects.toThrow(/nama/i);

    expect(buatPesertaDidikBatch).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. Non-active context.
// ===========================================================================

describe("G. non-active akses context", () => {
  it("getAksesSaya denied -> throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);

    await expect(
      imporPesertaDidikAction(
        formDataCsv(`${CSV_HEADER}\nBudi,,,2010-05-15,L`)
      )
    ).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// H. CSV size cap (MAX_CSV_BYTES = 2 MB). Two independent guards exist in the
// action: (1) File `.size` pre-check, (2) decoded `content.length` check that
// also covers string entries (which bypass the .size check). Both must reject
// BEFORE any tenant DB work (withTenant / batch / audit) touches the database.
// ===========================================================================

describe("H. CSV size cap (2 MB)", () => {
  const MAX_BYTES = 2 * 1024 * 1024;

  it("File with .size > MAX -> throws /2 MB/i before any DB write", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    const fd = new FormData();
    fd.append(
      "file",
      new File(["x".repeat(MAX_BYTES + 1)], "besar.csv", {
        type: "text/csv",
      })
    );

    await expect(imporPesertaDidikAction(fd)).rejects.toThrow(/melebihi batas ukuran/i);

    expect(withTenant).not.toHaveBeenCalled();
    expect(buatPesertaDidikBatch).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("string field with content.length > MAX -> throws /2 MB/i (size pre-check skipped for strings)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    // String entry: `typeof fileField === "string"` skips the `.size` guard, so
    // the content-length guard is the only protection. Pad well past 2 MB.
    const fd = new FormData();
    const padding = "x".repeat(MAX_BYTES + 1);
    fd.append("file", `${CSV_HEADER}\n${padding}`);

    await expect(imporPesertaDidikAction(fd)).rejects.toThrow(/melebihi batas ukuran/i);

    expect(withTenant).not.toHaveBeenCalled();
    expect(buatPesertaDidikBatch).not.toHaveBeenCalled();
  });

  it("File at exactly MAX bytes -> size cap admits it (reaches DB layer)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("admin_satuan_pendidikan"));

    // Build a CSV whose total byte length is exactly MAX_BYTES so both the
    // `.size` and `content.length` guards see size === MAX (not > MAX). The
    // nama is padded to land on the exact boundary.
    const prefix = `${CSV_HEADER}\nBudi,,,2010-05-15,`;
    const pad = MAX_BYTES - prefix.length - "L".length;
    const exact = `${prefix}${"a".repeat(pad)}L`;
    expect(exact.length).toBe(MAX_BYTES);

    const fd = new FormData();
    fd.append("file", new File([exact], "batas.csv", { type: "text/csv" }));

    // The size cap uses strict `>`, so exactly MAX is admitted. The padded
    // nama may trip the row validator and throw a summary — that is a separate
    // concern. The signal we lock here is that withTenant ran, proving the
    // size cap did not reject the boundary-size file.
    await imporPesertaDidikAction(fd).catch((e: Error) => {
      expect(e.message).not.toMatch(/melebihi batas ukuran/i);
    });
    expect(withTenant).toHaveBeenCalledTimes(1);
  });
});
