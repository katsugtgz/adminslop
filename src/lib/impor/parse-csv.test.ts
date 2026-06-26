import { describe, expect, it } from "vitest";

import { parseCsv } from "./parse-csv";

describe("parseCsv (#18) — basic parsing", () => {
  it("parses a header + rows into BarisCsv[] using canonical header names", () => {
    const csv = [
      "nama,nisn,nis,tanggalLahir,jenisKelamin",
      "Budi Santoso,12345678,NIS-1,2010-05-15,L",
      "Siti Aminah,,NIS-2,2011-03-20,P",
    ].join("\n");

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      nama: "Budi Santoso",
      nisn: "12345678",
      nis: "NIS-1",
      tanggalLahir: "2010-05-15",
      jenisKelamin: "L",
    });
    // empty NISN field -> undefined (optional)
    expect(rows[1]).toEqual({
      nama: "Siti Aminah",
      nisn: undefined,
      nis: "NIS-2",
      tanggalLahir: "2011-03-20",
      jenisKelamin: "P",
    });
  });

  it("trims whitespace around fields and headers", () => {
    const csv = " nama , nisn , nis , tanggalLahir , jenisKelamin \n Budi , 12345678 , N1 , 2010-05-15 , L ";

    const [row] = parseCsv(csv);

    expect(row).toEqual({
      nama: "Budi",
      nisn: "12345678",
      nis: "N1",
      tanggalLahir: "2010-05-15",
      jenisKelamin: "L",
    });
  });

  it("maps flexible header names via headerMap (e.g. 'Nama' -> nama)", () => {
    const csv = "Nama,NISN,NIS,Tanggal Lahir,Jenis Kelamin\nBudi,12345678,N1,2010-05-15,L";

    const [row] = parseCsv(csv, {
      Nama: "nama",
      NISN: "nisn",
      NIS: "nis",
      "Tanggal Lahir": "tanggalLahir",
      "Jenis Kelamin": "jenisKelamin",
    });

    expect(row.nama).toBe("Budi");
    expect(row.nisn).toBe("12345678");
    expect(row.jenisKelamin).toBe("L");
  });

  it("skips unknown header columns (extra columns ignored, not an error)", () => {
    const csv = "nama,nisn,nis,tanggalLahir,jenisKelamin,catatan\nBudi,12345678,N1,2010-05-15,L,haha";

    const [row] = parseCsv(csv);

    expect(row.nama).toBe("Budi");
  });

  it("returns [] for content with only a header (no data rows)", () => {
    const csv = "nama,nisn,nis,tanggalLahir,jenisKelamin";
    expect(parseCsv(csv)).toEqual([]);
  });
});

describe("parseCsv (#18) — quoted fields", () => {
  it("preserves commas inside double-quoted fields", () => {
    const csv = [
      'nama,nisn,nis,tanggalLahir,jenisKelamin',
      '"Santoso, Budi",12345678,N1,2010-05-15,L',
    ].join("\n");

    const [row] = parseCsv(csv);

    expect(row.nama).toBe("Santoso, Budi");
  });

  it("preserves newlines inside double-quoted fields", () => {
    const csv = [
      'nama,nisn,nis,tanggalLahir,jenisKelamin',
      '"Budi\nJr.",12345678,N1,2010-05-15,L',
    ].join("\n");

    const [row] = parseCsv(csv);

    expect(row.nama).toBe("Budi\nJr.");
  });

  it("handles escaped double-quotes (\"\") inside a quoted field", () => {
    const csv = [
      'nama,nisn,nis,tanggalLahir,jenisKelamin',
      '"Budi ""The Man"" S.",12345678,N1,2010-05-15,L',
    ].join("\n");

    const [row] = parseCsv(csv);

    expect(row.nama).toBe('Budi "The Man" S.');
  });
});

describe("parseCsv (#18) — empty / malformed input", () => {
  it("skips empty lines and blank rows (no BarisCsv emitted)", () => {
    const csv = "nama,nisn,nis,tanggalLahir,jenisKelamin\n\nBudi,12345678,N1,2010-05-15,L\n\n";

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].nama).toBe("Budi");
  });

  it("keeps a row whose nama is blank but has other data (validator flags it)", () => {
    const csv = "nama,nisn,nis,tanggalLahir,jenisKelamin\n ,12345678,N1,2010-05-15,L\nBudi,,N2,2011-01-01,P";

    const rows = parseCsv(csv);

    // both rows emitted; the blank-nama row is NOT dropped — validation owns that.
    expect(rows).toHaveLength(2);
    expect(rows[0].nama).toBe("");
    expect(rows[0].nisn).toBe("12345678");
    expect(rows[1].nama).toBe("Budi");
  });

  it("throws on malformed CSV (unclosed quote)", () => {
    const csv = 'nama,nisn,nis,tanggalLahir,jenisKelamin\n"Unclosed quote here,12345678,N1,2010-05-15,L';

    expect(() => parseCsv(csv)).toThrow(/tidak valid/i);
  });

  it("throws when the header row is absent (empty content)", () => {
    expect(() => parseCsv("")).toThrow(/tidak valid/i);
  });

  it("throws when the header is missing the required 'nama' column", () => {
    const csv = "nisn,nis,tanggalLahir,jenisKelamin\n12345678,N1,2010-05-15,L";
    expect(() => parseCsv(csv)).toThrow(/nama/i);
  });
});
