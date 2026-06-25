import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { PesertaDidik } from "@/db/schema";

import { FormUbahBiodata } from "./form-ubah-biodata";

const PESERTA: PesertaDidik = {
  id: "pd_1",
  tenantId: "org_A",
  nama: "Siti Aminah",
  nisn: "12345678",
  nis: "NIS-9",
  tanggalLahir: "2012-04-10",
  jenisKelamin: "P",
  status: "aktif",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
  diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
};

describe("FormUbahBiodata (#7 / T8)", () => {
  it("prefills nama/nisn/nis/tanggalLahir/jenisKelamin from values + hidden id", () => {
    render(<FormUbahBiodata action={vi.fn()} values={PESERTA} />);

    expect(screen.getByLabelText("Nama")).toHaveValue("Siti Aminah");
    expect(screen.getByLabelText("NISN")).toHaveValue("12345678");
    expect(screen.getByLabelText("NIS")).toHaveValue("NIS-9");
    expect(screen.getByLabelText("Tanggal Lahir")).toHaveValue("2012-04-10");

    const jenis = screen.getByLabelText("Jenis Kelamin") as HTMLSelectElement;
    expect(jenis).toHaveValue("P");
    expect(screen.getByRole("option", { name: "Perempuan" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Laki-laki" })).toBeInTheDocument();

    // hidden id carries the row id for the action
    const idInput = screen.getByDisplayValue("pd_1");
    expect(idInput).toHaveAttribute("name", "id");
    expect(idInput).toHaveAttribute("type", "hidden");
  });

  it("renders the 'Simpan Perubahan' submit", () => {
    render(<FormUbahBiodata action={vi.fn()} values={PESERTA} />);
    expect(
      screen.getByRole("button", { name: /Simpan Perubahan/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <FormUbahBiodata action={action} values={PESERTA} />
    );
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
