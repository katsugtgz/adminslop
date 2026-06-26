import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { simpanPengaturanSatuanPendidikanAction } = vi.hoisted(() => ({
  simpanPengaturanSatuanPendidikanAction: vi.fn(),
}));

vi.mock("@/app/dashboard/pengaturan/actions", () => ({
  simpanPengaturanSatuanPendidikanAction,
}));

import { FormPengaturan } from "./form-pengaturan";
import type { ProfilDanPengaturanRow } from "@/db/queries/satuan-pendidikan";

function fakeRow(
  overrides: Partial<ProfilDanPengaturanRow> = {},
): ProfilDanPengaturanRow {
  return {
    id: "org_123",
    nama: "SMP Negeri 1 Contoh",
    npsn: "12345678",
    jenjang: "SMP",
    alamat: "Jl. Pendidikan No. 1",
    namaKepala: "Drs. Budi, M.Pd.",
    logoUrl: null,
    tahunAjaranAktif: "2026/2027",
    semesterAktif: "Ganjil",
    zonaWaktu: "Asia/Jakarta",
    cetakPaperSize: "A4",
    cetakTampilkanLogo: true,
    cetakTampilkanHeader: true,
    ...overrides,
  };
}

beforeEach(() => simpanPengaturanSatuanPendidikanAction.mockReset());

describe("FormPengaturan (#5)", () => {
  it("renders all six fields with Bahasa labels", () => {
    render(<FormPengaturan values={fakeRow()} />);
    expect(screen.getByLabelText(/Tahun Ajaran Aktif/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Semester Aktif/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Zona Waktu/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Ukuran Kertas Cetak/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Tampilkan Logo di Cetak/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Tampilkan Kop Surat di Cetak/i),
    ).toBeInTheDocument();
  });

  it("prefills tahunAjaran from values", () => {
    render(
      <FormPengaturan
        values={fakeRow({ tahunAjaranAktif: "2025/2026" })}
      />,
    );
    const input = screen.getByLabelText(
      /Tahun Ajaran Aktif/i,
    ) as HTMLInputElement;
    expect(input.defaultValue).toBe("2025/2026");
  });

  it("renders semester select with Ganjil/Genap options", () => {
    render(<FormPengaturan values={fakeRow()} />);
    const select = screen.getByLabelText(
      /Semester Aktif/i,
    ) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["Ganjil", "Genap"]);
  });

  it("renders cetakPaperSize select with A4/F4 options", () => {
    render(<FormPengaturan values={fakeRow()} />);
    const select = screen.getByLabelText(
      /Ukuran Kertas Cetak/i,
    ) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["A4", "F4"]);
  });

  it("cetakTampilkanLogo checkbox defaultChecked when values true", () => {
    render(<FormPengaturan values={fakeRow({ cetakTampilkanLogo: true })} />);
    const cb = screen.getByLabelText(
      /Tampilkan Logo di Cetak/i,
    ) as HTMLInputElement;
    expect(cb.type).toBe("checkbox");
    expect(cb.defaultChecked).toBe(true);
  });

  it("cetakTampilkanLogo checkbox unchecked when values false", () => {
    render(<FormPengaturan values={fakeRow({ cetakTampilkanLogo: false })} />);
    const cb = screen.getByLabelText(
      /Tampilkan Logo di Cetak/i,
    ) as HTMLInputElement;
    expect(cb.defaultChecked).toBe(false);
  });

  it("cetakTampilkanHeader checkbox reflects values", () => {
    render(
      <FormPengaturan values={fakeRow({ cetakTampilkanHeader: false })} />,
    );
    const cb = screen.getByLabelText(
      /Tampilkan Kop Surat di Cetak/i,
    ) as HTMLInputElement;
    expect(cb.defaultChecked).toBe(false);
  });

  it("checkboxes use name attr matching zod keys", () => {
    render(<FormPengaturan values={fakeRow()} />);
    const logo = screen.getByLabelText(
      /Tampilkan Logo di Cetak/i,
    ) as HTMLInputElement;
    const header = screen.getByLabelText(
      /Tampilkan Kop Surat di Cetak/i,
    ) as HTMLInputElement;
    expect(logo.name).toBe("cetakTampilkanLogo");
    expect(header.name).toBe("cetakTampilkanHeader");
  });

  it("zonaWaktu defaults to Asia/Jakarta when value empty", () => {
    render(<FormPengaturan values={fakeRow({ zonaWaktu: "Asia/Jakarta" })} />);
    const input = screen.getByLabelText(/Zona Waktu/i) as HTMLInputElement;
    expect(input.defaultValue).toBe("Asia/Jakarta");
  });

  it("readOnly=true disables all fields, hides submit", () => {
    render(<FormPengaturan values={fakeRow()} readOnly={true} />);
    const labels = [
      /Tahun Ajaran Aktif/i,
      /Semester Aktif/i,
      /Zona Waktu/i,
      /Ukuran Kertas Cetak/i,
      /Tampilkan Logo di Cetak/i,
      /Tampilkan Kop Surat di Cetak/i,
    ];
    for (const re of labels) {
      const el = screen.getByLabelText(re) as
        | HTMLInputElement
        | HTMLSelectElement;
      expect(el).toBeDisabled();
    }
    expect(
      screen.queryByRole("button", { name: /Simpan Pengaturan/i }),
    ).not.toBeInTheDocument();
  });

  it("readOnly=false shows submit button bound to the server action form", () => {
    const { container } = render(
      <FormPengaturan values={fakeRow()} readOnly={false} />,
    );
    const submit = screen.getByRole("button", {
      name: /Simpan Pengaturan/i,
    });
    const form = submit.closest("form") as HTMLFormElement;
    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(container.querySelector("form")).toBe(form);
    expect(simpanPengaturanSatuanPendidikanAction).toBeDefined();
  });
});
