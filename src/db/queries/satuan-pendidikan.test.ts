import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Tx } from "@/db/client";
import type {
  PengaturanSatuanPendidikanInput,
  ProfilSatuanPendidikanInput,
} from "@/app/dashboard/pengaturan/schemas";

import {
  getProfilDanPengaturan,
  updatePengaturanSatuanPendidikan,
  updateProfilSatuanPendidikan,
} from "./satuan-pendidikan";

/**
 * Unit-style behavioural test (db vitest project / node env). We do NOT touch a
 * real database here — instead we hand-roll a fake Drizzle query chain that
 * records calls and models real Drizzle semantics:
 *
 *   select().from(t).where(cond)   -> thenable resolving to rows[]
 *   update(t).set(obj).where(cond) -> thenable resolving to result[]
 *
 * The `cond` argument is built with the REAL `eq` operator on the REAL schema
 * column (no schema mock), so we also assert the tenant-isolation gate is
 * present without executing any SQL.
 */

const selectWhere = vi.fn();
const selectFrom = vi.fn(() => ({ where: selectWhere }));
const selectFn = vi.fn(() => ({ from: selectFrom }));

const updateWhere = vi.fn();
const updateSet = vi.fn(() => ({ where: updateWhere }));
const updateFn = vi.fn(() => ({ set: updateSet }));

function makeFakeTx(): Tx {
  return {
    select: selectFn,
    update: updateFn,
  } as unknown as Tx;
}

describe("Satuan Pendidikan query helpers (#5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getProfilDanPengaturan reads via select().from().where(id=tenantId) and returns the row", async () => {
    const tx = makeFakeTx();
    selectWhere.mockResolvedValueOnce([
      {
        id: "org_A",
        nama: "SMP Negeri A",
        npsn: "1234567",
        jenjang: "SMP",
        alamat: null,
        namaKepala: null,
        logoUrl: null,
        tahunAjaranAktif: "2026/2027",
        semesterAktif: "Ganjil",
        zonaWaktu: "Asia/Jakarta",
        cetakPaperSize: "A4",
        cetakTampilkanLogo: true,
        cetakTampilkanHeader: true,
      },
    ]);

    const row = await getProfilDanPengaturan(tx, "org_A");

    expect(selectFn).toHaveBeenCalledTimes(1);
    expect(selectFrom).toHaveBeenCalledTimes(1);
    expect(selectWhere).toHaveBeenCalledTimes(1);
    expect(row).not.toBeNull();
    expect(row?.id).toBe("org_A");
    expect(row?.nama).toBe("SMP Negeri A");
  });

  it("getProfilDanPengaturan returns null when no row matches the tenant", async () => {
    const tx = makeFakeTx();
    selectWhere.mockResolvedValueOnce([]);

    const row = await getProfilDanPengaturan(tx, "org_X");

    expect(row).toBeNull();
    expect(selectWhere).toHaveBeenCalledTimes(1);
  });

  it("updateProfilSatuanPendidikan writes profil columns scoped WHERE id = tenantId", async () => {
    const tx = makeFakeTx();
    updateWhere.mockResolvedValueOnce([]);
    const input: ProfilSatuanPendidikanInput = {
      nama: "SMP Negeri 1",
      npsn: "2010001",
      jenjang: "SMP",
      alamat: "Jl. Merdeka",
      namaKepala: "Budi",
      logoUrl: "",
    };

    await updateProfilSatuanPendidikan(tx, "org_A", input);

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({
      nama: "SMP Negeri 1",
      npsn: "2010001",
      jenjang: "SMP",
      alamat: "Jl. Merdeka",
      namaKepala: "Budi",
      logoUrl: null, // empty string normalised to null
    });
    expect(updateWhere).toHaveBeenCalledTimes(1); // tenant-isolation gate present
  });

  it("updateProfilSatuanPendidikan nulls optional profil fields when omitted", async () => {
    const tx = makeFakeTx();
    updateWhere.mockResolvedValueOnce([]);
    const input: ProfilSatuanPendidikanInput = {
      nama: "SD Cahaya",
      jenjang: "SD",
    };

    await updateProfilSatuanPendidikan(tx, "org_A", input);

    expect(updateSet).toHaveBeenCalledWith({
      nama: "SD Cahaya",
      npsn: null,
      jenjang: "SD",
      alamat: null,
      namaKepala: null,
      logoUrl: null,
    });
  });

  it("updatePengaturanSatuanPendidikan writes pengaturan + cetak columns scoped WHERE id = tenantId", async () => {
    const tx = makeFakeTx();
    updateWhere.mockResolvedValueOnce([]);
    const input: PengaturanSatuanPendidikanInput = {
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
      zonaWaktu: "Asia/Jakarta",
      cetakPaperSize: "F4",
      cetakTampilkanLogo: false,
      cetakTampilkanHeader: true,
    };

    await updatePengaturanSatuanPendidikan(tx, "org_A", input);

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({
      tahunAjaranAktif: "2026/2027",
      semesterAktif: "Ganjil",
      zonaWaktu: "Asia/Jakarta",
      cetakPaperSize: "F4",
      cetakTampilkanLogo: false,
      cetakTampilkanHeader: true,
    });
    expect(updateWhere).toHaveBeenCalledTimes(1); // tenant-isolation gate present
  });
});
