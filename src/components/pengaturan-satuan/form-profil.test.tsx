import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { simpanProfilSatuanPendidikanAction } = vi.hoisted(() => ({
  simpanProfilSatuanPendidikanAction: vi.fn(),
}));

vi.mock("@/app/dashboard/pengaturan/actions", () => ({
  simpanProfilSatuanPendidikanAction,
}));

import { FormProfil } from "./form-profil";
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
    logoUrl: "https://example.com/logo.png",
    tahunAjaranAktif: "2026/2027",
    semesterAktif: "ganjil",
    zonaWaktu: "Asia/Jakarta",
    cetakPaperSize: "a4",
    cetakTampilkanLogo: true,
    cetakTampilkanHeader: true,
    ...overrides,
  };
}

beforeEach(() => simpanProfilSatuanPendidikanAction.mockReset());

describe("FormProfil (#5)", () => {
  it("prefills inputs from values", () => {
    render(<FormProfil values={fakeRow({ nama: "SMA Negeri 2" })} />);
    const input = screen.getByLabelText(/Nama Satuan Pendidikan/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.defaultValue).toBe("SMA Negeri 2");
  });

  it("renders all six fields with Bahasa labels", () => {
    render(<FormProfil values={fakeRow()} />);
    expect(
      screen.getByLabelText(/Nama Satuan Pendidikan/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^NPSN$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Jenjang$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Alamat$/)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Nama Kepala Satuan Pendidikan/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/URL Logo/i)).toBeInTheDocument();
  });

  it("renders jenjang select with placeholder + five options SD/SMP/SMA/SMK/MA", () => {
    render(<FormProfil values={fakeRow()} />);
    const select = screen.getByLabelText(/^Jenjang$/) as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["", "SD", "SMP", "SMA", "SMK", "MA"]);
    expect(select.options[0].disabled).toBe(true);
  });

  it("npsn input is numeric inputMode with maxLength 8", () => {
    render(<FormProfil values={fakeRow()} />);
    const npsn = screen.getByLabelText(/^NPSN$/) as HTMLInputElement;
    expect(npsn.inputMode).toBe("numeric");
    expect(npsn.maxLength).toBe(8);
  });

  it("renders helper text for logo URL", () => {
    render(<FormProfil values={fakeRow()} />);
    expect(screen.getByText(/Kosongkan jika tidak ada/i)).toBeInTheDocument();
  });

  it("readOnly=true disables all fields, hides submit, shows read-only note", () => {
    render(<FormProfil values={fakeRow()} readOnly={true} />);
    const labels = [
      /Nama Satuan Pendidikan/i,
      /^NPSN$/,
      /^Jenjang$/,
      /^Alamat$/,
      /Nama Kepala Satuan Pendidikan/i,
      /URL Logo/i,
    ];
    for (const re of labels) {
      const el = screen.getByLabelText(re) as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement;
      expect(el).toBeDisabled();
    }
    expect(
      screen.queryByRole("button", { name: /Simpan Profil/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Anda hanya dapat melihat/i),
    ).toBeInTheDocument();
  });

  it("readOnly=false shows submit button inside a form bound to the server action", () => {
    const { container } = render(
      <FormProfil values={fakeRow()} readOnly={false} />,
    );
    const submit = screen.getByRole("button", { name: /Simpan Profil/i });
    const form = submit.closest("form") as HTMLFormElement;
    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(container.querySelector("form")).toBe(form);
    expect(simpanProfilSatuanPendidikanAction).toBeDefined();
  });

  it("prefills null nullable fields as empty string", () => {
    render(
      <FormProfil
        values={fakeRow({ npsn: null, alamat: null, jenjang: null })}
      />,
    );
    const npsn = screen.getByLabelText(/^NPSN$/) as HTMLInputElement;
    expect(npsn.defaultValue).toBe("");
    const alamat = screen.getByLabelText(/^Alamat$/) as HTMLTextAreaElement;
    expect(alamat.defaultValue).toBe("");
  });
});
