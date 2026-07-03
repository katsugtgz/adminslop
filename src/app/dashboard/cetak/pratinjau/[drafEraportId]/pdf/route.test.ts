import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { KontenCetak } from "@/db/queries/cetak";

const mocks = vi.hoisted(() => {
  const fakeTxLocal = { __tx: true };
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTxLocal)
    ),
    getKontenCetak: vi.fn(),
    fakeTx: fakeTxLocal,
  };
});

const { getAksesSaya, getDb, withTenant, getKontenCetak, fakeTx: fakeTxRef } =
  mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
}));
vi.mock("@/db/queries/cetak", async () => {
  // Keep the real KontenCetak type + the pure helpers exported by the route
  // file under test; only the DB-touching function is mocked.
  const actual = await vi.importActual<typeof import("@/db/queries/cetak")>(
    "@/db/queries/cetak"
  );
  return { ...actual, getKontenCetak: mocks.getKontenCetak };
});

import { GET } from "./route";
import { kontenKeBarisPdf, namaFilePdf } from "./helpers";

// ---------------------------------------------------------------------------
// Helpers — mirror actions.test.ts: role defaults reflect #14 Cetak defaults
// (admin/dev: cetak:baca+buat+ubah · kepala_sekolah: cetak:baca+buat ·
// guru/wali_kelas: cetak:baca only).
// ---------------------------------------------------------------------------

function aksesAktif(
  roleSlug: RoleSlug,
  opts?: { izin?: IzinSlug[]; pembatasan?: IzinSlug[] }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: ["cetak:baca", "cetak:buat", "cetak:ubah"],
    dev: ["cetak:baca", "cetak:buat", "cetak:ubah"],
    kepala_sekolah: ["cetak:baca", "cetak:buat"],
    guru: ["cetak:baca"],
    wali_kelas: ["cetak:baca"],
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

const KONTEN_A: KontenCetak = {
  eraportId: "er_001",
  semester: "2024/1 (Ganjil)",
  status: "terbit",
  konten: {
    peserta_didik: {
      nama: "Ahmad Budi Santoso",
      nisn: "0012345678",
      kelas: "VIII-A",
    },
    mata_pelajaran: [
      { nama: "Matematika", nilai: 92.5, predikat: "A", catatan: "Sangat baik" },
      { nama: "Bahasa Indonesia", nilai: 88.0, predikat: "B+", catatan: "Baik" },
      { nama: "IPA Terpadu", nilai: 90.0, predikat: "A", catatan: "Sangat baik" },
      { nama: "IPS Terpadu", nilai: 85.5, predikat: "B+", catatan: "Baik" },
    ],
    ekstrakurikuler: "Pramuka (Penegak)",
    kehadiran: { sakit: 1, izin: 0, alpa: 0 },
    catatan_wali_kelas: "Menunjukkan kemajuan yang konsisten semester ini.",
  },
  namaSatuanPendidikan: "SMP Negeri 1 Contoh",
  npsn: "12345678",
  alamat: "Jl. Contoh No. 1, Jakarta",
  logoUrl: null,
  formatPreferensi: "a4",
  tampilkanLogoDefault: true,
  tampilkanHeaderDefault: true,
  template: null,
};

function makeReq(): Request {
  return new Request(
    "http://localhost/dashboard/cetak/pratinjau/er_001/pdf"
  );
}
function makeCtx() {
  return { params: Promise.resolve({ drafEraportId: "er_001" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAksesSaya.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  getKontenCetak.mockReset();
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(
    async (
      _db: unknown,
      _tenantId: unknown,
      fn: (tx: unknown) => Promise<unknown>
    ) => fn(fakeTxRef)
  );
});

// ===========================================================================
// A. Authz boundary (identity doc §12): UI is convenience; route is the gate.
// ===========================================================================

describe("A. authz boundary — GET /dashboard/cetak/pratinjau/[id]/pdf", () => {
  it("1. non-active akses (denied) -> 401; DB NOT touched", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(401);
    expect(withTenant).not.toHaveBeenCalled();
    expect(getKontenCetak).not.toHaveBeenCalled();
  });

  it("2. non-active akses (choose) -> 401", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(401);
  });

  it("3. active akses WITHOUT cetak:baca (pembatasan wins) -> 403; DB NOT touched", async () => {
    // admin whose cetak:baca is restricted — proves the route enforces the
    // izin even when the role would normally allow it.
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", { pembatasan: ["cetak:baca"] })
    );
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(403);
    expect(withTenant).not.toHaveBeenCalled();
    expect(getKontenCetak).not.toHaveBeenCalled();
  });

  it("4. konten absent / cross-tenant id -> 404 (RLS hides it)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    getKontenCetak.mockResolvedValue(null);
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(404);
    // Verify tenant scoping came from membership.orgId, not the route param.
    expect(withTenant).toHaveBeenCalledWith(
      expect.anything(),
      "org_A",
      expect.anything()
    );
  });
});

// ===========================================================================
// B. Happy path — 200 application/pdf with Content-Disposition + RLS scoping.
// ===========================================================================

describe("B. happy path — 200 PDF", () => {
  beforeEach(() => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru"));
    getKontenCetak.mockResolvedValue(KONTEN_A);
  });

  it("5. returns 200 with application/pdf + Content-Disposition attachment .pdf", async () => {
    const res = await GET(makeReq(), makeCtx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toMatch(/^attachment;\s*filename=".+\.pdf"$/);
    expect(cd).toContain(".pdf");
  });

  it("6. body is a real PDF > 1000 bytes (%PDF-1.4 header + %%EOF trailer)", async () => {
    const res = await GET(makeReq(), makeCtx());
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(/%%EOF\s*$/.test(text)).toBe(true);
  });

  it("7. sets Cache-Control: private, no-store (no cross-tenant cache leak)", async () => {
    const res = await GET(makeReq(), makeCtx());
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("8. filename is the ASCII-slugged school name + semester", async () => {
    const res = await GET(makeReq(), makeCtx());
    const cd = res.headers.get("Content-Disposition") ?? "";
    // "SMP Negeri 1 Contoh" + "2024/1 (Ganjil)" → ascii-slugged.
    expect(cd).toContain('filename="smp-negeri-1-contoh-2024-1-ganjil.pdf"');
  });

  it("9. tenant scoping uses membership.orgId; route param NEVER passed as tenantId", async () => {
    await GET(makeReq(), makeCtx());
    expect(withTenant).toHaveBeenCalledTimes(1);
    const [, tenantArg, ,] = withTenant.mock.calls[0];
    expect(tenantArg).toBe("org_A");
    // drafEraportId flows to getKontenCetak as the SECOND arg (after tx).
    const [txArg, idArg] = getKontenCetak.mock.calls[0];
    expect(txArg).toBe(fakeTxRef);
    expect(idArg).toBe("er_001");
  });
});

// ===========================================================================
// C. Pure helpers — filename + line mapping (no DB / no auth).
// ===========================================================================

describe("C. namaFilePdf — ASCII filename derivation", () => {
  it("10. slugs the school name + appends semester", () => {
    expect(namaFilePdf(KONTEN_A)).toBe("smp-negeri-1-contoh-2024-1-ganjil.pdf");
  });

  it("11. strips diacritics + non-ASCII before slug", () => {
    expect(
      namaFilePdf({ ...KONTEN_A, namaSatuanPendidikan: "Sekolah Bérsepakat" })
    ).toBe("sekolah-bersepakat-2024-1-ganjil.pdf");
  });

  it("12. falls back to 'eraport' when school name is empty", () => {
    expect(
      namaFilePdf({ ...KONTEN_A, namaSatuanPendidikan: "", semester: "" })
    ).toBe("eraport.pdf");
  });

  it("13. clamps over-long school names to 40 chars", () => {
    const panjang = "Sekolah Dasar Negeri Dengan Nama Yang Sangat Panjang Sekali";
    const out = namaFilePdf({ ...KONTEN_A, namaSatuanPendidikan: panjang });
    const base = out.replace(/-2024-1-ganjil\.pdf$/, "");
    expect(base.length).toBeLessThanOrEqual(40);
  });
});

describe("D. kontenKeBarisPdf — payload → body lines", () => {
  it("14. emits header label, optional NPSN/alamat, semester, status, format, and polished report lines (NOT raw JSON)", () => {
    const baris = kontenKeBarisPdf(KONTEN_A);
    const joined = baris.map((b) => b.teks).join("\n");
    expect(joined).toContain("E-Raport (Pratinjau Cetak)");
    expect(joined).toContain("NPSN: 12345678");
    expect(joined).toContain("Alamat: Jl. Contoh No. 1, Jakarta");
    expect(joined).toContain("Semester: 2024/1 (Ganjil)");
    expect(joined).toContain("Status: terbit");
    expect(joined).toContain("Format: A4");
    // Polished report body — student identity, subjects, attendance, notes must
    // appear as readable Bahasa lines, NOT as `"key": value` JSON.
    expect(joined).toContain("Ahmad Budi Santoso");
    expect(joined).toContain("0012345678");
    expect(joined).toContain("VIII-A");
    expect(joined).toContain("Matematika");
    expect(joined).toContain("Bahasa Indonesia");
    expect(joined).toContain("Sakit");
    expect(joined).toContain("Izin");
    expect(joined).toContain("Alpa");
    expect(joined).toContain("Menunjukkan kemajuan yang konsisten");
    // Regression guards — raw JSON syntax MUST NOT leak into the PDF body.
    expect(joined).not.toMatch(/"peserta_didik":/);
    expect(joined).not.toMatch(/"mata_pelajaran":/);
    expect(joined).not.toMatch(/"nama":/);
    expect(joined).not.toMatch(/"catatan_wali_kelas":/);
    expect(joined).not.toMatch(/"kehadiran":/);
    expect(joined).not.toMatch(/^{/m);
    expect(joined).not.toMatch(/}$/m);
  });

  it("15. omits NPSN/Alamat lines when those fields are null", () => {
    const baris = kontenKeBarisPdf({ ...KONTEN_A, npsn: null, alamat: null });
    const joined = baris.map((b) => b.teks).join("\n");
    expect(joined).not.toMatch(/NPSN:/);
    expect(joined).not.toMatch(/Alamat:/);
  });
});
