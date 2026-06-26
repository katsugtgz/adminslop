import { describe, expect, it } from "vitest";

import type { PesertaDidik } from "@/db/schema";

import {
  formatEksporCsv,
  generateTemplateCsv,
  validasiBaris,
  validasiBatch,
  type BarisCsv,
} from "./validasi-peserta-didik";

function baris(over: Partial<BarisCsv>): BarisCsv {
  return {
    nama: "Budi Santoso",
    tanggalLahir: "2010-05-15",
    jenisKelamin: "L",
    ...over,
  };
}

// ===========================================================================
// validasiBaris — per-row field validation (pure).
// ===========================================================================

describe("validasiBaris (#18) — field validation", () => {
  it("valid row -> { valid: true, errors: [] }", () => {
    expect(validasiBaris(baris({}))).toEqual({ valid: true, errors: [] });
  });

  it("row with optional nisn/nis present and valid -> valid", () => {
    expect(
      validasiBaris(baris({ nisn: "12345678", nis: "NIS-9" }))
    ).toEqual({ valid: true, errors: [] });
  });

  it("missing nama -> invalid, error mentions Nama", () => {
    const r = validasiBaris(baris({ nama: "" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /nama/i.test(e))).toBe(true);
  });

  it("whitespace-only nama -> invalid (trim-first)", () => {
    const r = validasiBaris(baris({ nama: "   " }));
    expect(r.valid).toBe(false);
  });

  it("invalid tanggalLahir (not a date) -> invalid", () => {
    const r = validasiBaris(baris({ tanggalLahir: "bukan-tanggal" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /tanggal/i.test(e))).toBe(true);
  });

  it("empty tanggalLahir -> invalid", () => {
    const r = validasiBaris(baris({ tanggalLahir: "" }));
    expect(r.valid).toBe(false);
  });

  it("invalid jenisKelamin (not L/P) -> invalid", () => {
    const r = validasiBaris(baris({ jenisKelamin: "X" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /kelamin/i.test(e))).toBe(true);
  });

  it("lowercase 'l' jenisKelamin is NOT accepted (strict L/P)", () => {
    const r = validasiBaris(baris({ jenisKelamin: "l" }));
    expect(r.valid).toBe(false);
  });

  it("nisn present but wrong length (not 8 digits) -> invalid", () => {
    const r = validasiBaris(baris({ nisn: "12345" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /nisn/i.test(e))).toBe(true);
  });

  it("nisn present but non-numeric -> invalid", () => {
    const r = validasiBaris(baris({ nisn: "1234abcd" }));
    expect(r.valid).toBe(false);
  });

  it("nis is free text — any non-empty value is accepted", () => {
    expect(validasiBaris(baris({ nis: "abc-123 !@#" }))).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("collects multiple errors at once (nama + date + kelamin)", () => {
    const r = validasiBaris(baris({ nama: "", tanggalLahir: "x", jenisKelamin: "Z" }));
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ===========================================================================
// validasiBatch — per-row validation + duplicate detection.
// ===========================================================================

describe("validasiBatch (#18) — duplicate detection", () => {
  it("all valid + no duplicates -> every row status 'valid'", () => {
    const rows = [
      baris({ nisn: "11111111" }),
      baris({ nama: "Siti", nisn: "22222222" }),
    ];
    const hasil = validasiBatch(rows, [], []);
    expect(hasil).toHaveLength(2);
    expect(hasil.every((h) => h.status === "valid")).toBe(true);
    expect(hasil.every((h) => h.errors.length === 0)).toBe(true);
  });

  it("baris reflects CSV line number (header=1, first data row=2)", () => {
    const rows = [baris({}), baris({ nama: "Siti" })];
    const hasil = validasiBatch(rows, [], []);
    expect(hasil[0].baris).toBe(2);
    expect(hasil[1].baris).toBe(3);
  });

  it("a field-invalid row -> status 'tidak_valid'", () => {
    const rows = [baris({ nama: "" })];
    const [h] = validasiBatch(rows, [], []);
    expect(h.status).toBe("tidak_valid");
    expect(h.errors.length).toBeGreaterThan(0);
  });

  it("NISN duplicated WITHIN the file -> both rows 'perlu_koreksi'", () => {
    const rows = [
      baris({ nama: "Budi", nisn: "11111111" }),
      baris({ nama: "Budi Dua", nisn: "11111111" }),
    ];
    const hasil = validasiBatch(rows, [], []);
    expect(hasil[0].status).toBe("perlu_koreksi");
    expect(hasil[1].status).toBe("perlu_koreksi");
    expect(hasil[0].errors.some((e) => /nisn/i.test(e))).toBe(true);
  });

  it("NISN matching an existingNisn -> row 'perlu_koreksi'", () => {
    const rows = [baris({ nama: "Budi", nisn: "99999999" })];
    const [h] = validasiBatch(rows, ["99999999"], []);
    expect(h.status).toBe("perlu_koreksi");
    expect(h.errors.some((e) => /nisn/i.test(e))).toBe(true);
  });

  it("NIS duplicated WITHIN the file -> both rows 'perlu_koreksi'", () => {
    const rows = [
      baris({ nama: "A", nis: "NIS-X" }),
      baris({ nama: "B", nis: "NIS-X" }),
    ];
    const hasil = validasiBatch(rows, [], []);
    expect(hasil[0].status).toBe("perlu_koreksi");
    expect(hasil[1].status).toBe("perlu_koreksi");
  });

  it("NIS matching an existingNis -> row 'perlu_koreksi'", () => {
    const rows = [baris({ nama: "A", nis: "OLD-NIS" })];
    const [h] = validasiBatch(rows, [], ["OLD-NIS"]);
    expect(h.status).toBe("perlu_koreksi");
  });

  it("a row that is BOTH field-invalid AND duplicate -> 'tidak_valid' wins (hard error first)", () => {
    const rows = [
      baris({ nama: "", nisn: "11111111" }),
      baris({ nama: "B", nisn: "11111111" }),
    ];
    const hasil = validasiBatch(rows, [], []);
    // the empty-nama row is hard-invalid; the duplicate is a softer correction
    expect(hasil[0].status).toBe("tidak_valid");
    expect(hasil[1].status).toBe("perlu_koreksi");
  });

  it("rows with no nisn/nis never collide on absence (undefined ignored)", () => {
    const rows = [
      baris({ nama: "A", nisn: undefined, nis: undefined }),
      baris({ nama: "B", nisn: undefined, nis: undefined }),
    ];
    const hasil = validasiBatch(rows, [], []);
    expect(hasil.every((h) => h.status === "valid")).toBe(true);
  });

  it("duplicate detection is case-sensitive on NISN/NIS values", () => {
    const rows = [
      baris({ nama: "A", nis: "ABC" }),
      baris({ nama: "B", nis: "abc" }),
    ];
    const hasil = validasiBatch(rows, [], []);
    expect(hasil.every((h) => h.status === "valid")).toBe(true);
  });
});

// ===========================================================================
// generateTemplateCsv — AC#1 template download.
// ===========================================================================

describe("generateTemplateCsv (#18) — template format", () => {
  it("header row is the canonical column order", () => {
    const csv = generateTemplateCsv();
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe("nama,nisn,nis,tanggalLahir,jenisKelamin");
  });

  it("includes exactly 2 example data rows", () => {
    const csv = generateTemplateCsv();
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    // 1 header + 2 examples
    expect(lines).toHaveLength(3);
  });

  it("round-trips through parseCsv (template parses to 2 valid rows)", async () => {
    const { parseCsv } = await import("./parse-csv");
    const rows = parseCsv(generateTemplateCsv());
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.nama.length > 0)).toBe(true);
  });
});

// ===========================================================================
// formatEksporCsv — AC#4 tenant-scoped export.
// ===========================================================================

describe("formatEksporCsv (#18) — export format", () => {
  const PDS: PesertaDidik[] = [
    {
      id: "pd_1",
      tenantId: "org_A",
      nama: "Budi Santoso",
      nisn: "12345678",
      nis: "NIS-1",
      tanggalLahir: "2010-05-15",
      jenisKelamin: "L",
      status: "aktif",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
      diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "pd_2",
      tenantId: "org_A",
      nama: "Siti, Aminah", // comma -> must be quoted
      nisn: null,
      nis: null,
      tanggalLahir: "2011-03-20",
      jenisKelamin: "P",
      status: "aktif",
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
      diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
    },
  ];

  it("emits the canonical header first", () => {
    const firstLine = formatEksporCsv(PDS).split("\n")[0];
    expect(firstLine).toBe("nama,nisn,nis,tanggalLahir,jenisKelamin");
  });

  it("one data line per peserta", () => {
    const lines = formatEksporCsv(PDS).split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(1 + PDS.length);
  });

  it("quotes fields containing commas", () => {
    const csv = formatEksporCsv(PDS);
    expect(csv).toContain('"Siti, Aminah"');
  });

  it("leaves null nisn/nis as empty fields (not 'null')", () => {
    const csv = formatEksporCsv(PDS);
    // second data row: nama quoted, then empty nisn, empty nis, date, P
    expect(csv).toContain('"Siti, Aminah",,,2011-03-20,P');
  });

  it("empty peserta list -> header only", () => {
    const csv = formatEksporCsv([]);
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toEqual(["nama,nisn,nis,tanggalLahir,jenisKelamin"]);
  });
});
