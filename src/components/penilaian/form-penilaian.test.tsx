import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FormPenilaian } from "./form-penilaian";

describe("FormPenilaian (#11 / T7 / T6)", () => {
  it("renders nama + tanggal(date) fields, hidden komponenNilaiId, and the 'Tambah Penilaian' submit", () => {
    render(<FormPenilaian action={vi.fn()} komponenNilaiId="kn_1" />);

    expect(screen.getByLabelText("Nama")).toHaveAttribute("name", "nama");
    expect(screen.getByLabelText("Nama")).toBeRequired();

    const tanggal = screen.getByLabelText("Tanggal");
    expect(tanggal).toHaveAttribute("name", "tanggal");
    expect(tanggal).toHaveAttribute("type", "date");
    expect(tanggal).toBeRequired();

    expect(screen.getByDisplayValue("kn_1")).toHaveAttribute(
      "name",
      "komponenNilaiId"
    );

    expect(
      screen.getByRole("button", { name: /Tambah Penilaian/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit, carrying the hidden komponenNilaiId", () => {
    const action = vi.fn<(fd: FormData) => Promise<void>>(async () => {});
    const { container } = render(
      <FormPenilaian action={action} komponenNilaiId="kn_1" />
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
    const fd = action.mock.calls[0][0] as FormData;
    expect(fd.get("komponenNilaiId")).toBe("kn_1");
  });
});
