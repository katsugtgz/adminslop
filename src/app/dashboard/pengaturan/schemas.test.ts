import { describe, expect, it } from "vitest";
import {
  ProfilSatuanPendidikanSchema,
  PengaturanSatuanPendidikanSchema,
} from "./schemas";

describe("ProfilSatuanPendidikanSchema (#5)", () => {
  it("accepts minimal valid profil", () => {
    const parsed = ProfilSatuanPendidikanSchema.parse({
      nama: "SMP Negeri 1",
      jenjang: "SMP",
    });
    expect(parsed.nama).toBe("SMP Negeri 1");
    expect(parsed.jenjang).toBe("SMP");
  });

  it("rejects missing nama", () => {
    expect(() =>
      ProfilSatuanPendidikanSchema.parse({ jenjang: "SMP" }),
    ).toThrow();
  });

  it("rejects empty nama", () => {
    expect(() =>
      ProfilSatuanPendidikanSchema.parse({ nama: "   ", jenjang: "SMP" }),
    ).toThrow();
  });

  it("rejects invalid jenjang", () => {
    expect(() =>
      ProfilSatuanPendidikanSchema.parse({ nama: "TK Cahaya", jenjang: "TK" }),
    ).toThrow();
  });

  it("rejects non-digit npsn", () => {
    expect(() =>
      ProfilSatuanPendidikanSchema.parse({
        nama: "SMP Negeri 1",
        jenjang: "SMP",
        npsn: "abc",
      }),
    ).toThrow();
  });

  it("rejects too-long npsn", () => {
    expect(() =>
      ProfilSatuanPendidikanSchema.parse({
        nama: "SMP Negeri 1",
        jenjang: "SMP",
        npsn: "123456789",
      }),
    ).toThrow();
  });
});

describe("PengaturanSatuanPendidikanSchema (#5)", () => {
  it("accepts minimal valid pengaturan with defaults", () => {
    const parsed = PengaturanSatuanPendidikanSchema.parse({
      tahunAjaran: "2026/2027",
      semester: "Ganjil",
    });
    expect(parsed.tahunAjaran).toBe("2026/2027");
    expect(parsed.semester).toBe("Ganjil");
    expect(parsed.zonaWaktu).toBe("Asia/Jakarta");
    expect(parsed.cetakPaperSize).toBe("A4");
    expect(parsed.cetakTampilkanLogo).toBe(true);
    expect(parsed.cetakTampilkanHeader).toBe(true);
  });

  it("rejects tahunAjaran without slash", () => {
    expect(() =>
      PengaturanSatuanPendidikanSchema.parse({
        tahunAjaran: "2026",
        semester: "Ganjil",
      }),
    ).toThrow();
  });

  it("rejects non-digit tahunAjaran", () => {
    expect(() =>
      PengaturanSatuanPendidikanSchema.parse({
        tahunAjaran: "abcd/efgh",
        semester: "Ganjil",
      }),
    ).toThrow();
  });

  it("rejects invalid semester", () => {
    expect(() =>
      PengaturanSatuanPendidikanSchema.parse({
        tahunAjaran: "2026/2027",
        semester: "Fall",
      }),
    ).toThrow();
  });

  it("rejects invalid cetakPaperSize (MVP allows only A4/F4)", () => {
    expect(() =>
      PengaturanSatuanPendidikanSchema.parse({
        tahunAjaran: "2026/2027",
        semester: "Ganjil",
        cetakPaperSize: "Letter",
      }),
    ).toThrow();
  });
});
