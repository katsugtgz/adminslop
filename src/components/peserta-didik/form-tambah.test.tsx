import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FormTambah } from "./form-tambah";

describe("FormTambah (#7 / T7)", () => {
  it("renders nama, nisn, nis, tanggalLahir, jenisKelamin fields + the 'Tambah Peserta Didik' submit", () => {
    render(<FormTambah action={vi.fn()} />);

    // nama — required text
    expect(screen.getByLabelText("Nama")).toHaveAttribute("name", "nama");
    expect(screen.getByLabelText("Nama")).toBeRequired();

    // nisn — optional, numeric inputMode, maxLength 8
    const nisn = screen.getByLabelText("NISN");
    expect(nisn).toHaveAttribute("name", "nisn");
    expect(nisn).toHaveAttribute("inputmode", "numeric");
    expect(nisn).toHaveAttribute("maxlength", "8");
    expect(nisn).not.toBeRequired();

    // nis — optional text
    const nis = screen.getByLabelText("NIS");
    expect(nis).toHaveAttribute("name", "nis");
    expect(nis).not.toBeRequired();

    // tanggalLahir — required date
    const tanggalLahir = screen.getByLabelText("Tanggal Lahir");
    expect(tanggalLahir).toHaveAttribute("name", "tanggalLahir");
    expect(tanggalLahir).toHaveAttribute("type", "date");
    expect(tanggalLahir).toBeRequired();

    // jenisKelamin — select L/P
    const jenisKelamin = screen.getByLabelText("Jenis Kelamin");
    expect(jenisKelamin).toHaveAttribute("name", "jenisKelamin");
    expect(
      screen.getByRole("option", { name: "Laki-laki" })
    ).toHaveAttribute("value", "L");
    expect(
      screen.getByRole("option", { name: "Perempuan" })
    ).toHaveAttribute("value", "P");

    // submit
    expect(
      screen.getByRole("button", { name: /Tambah Peserta Didik/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(<FormTambah action={action} />);

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
