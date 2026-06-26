import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FormKomponenNilai } from "./form-komponen-nilai";

describe("FormKomponenNilai (#11 / T7 / T6)", () => {
  it("renders nama + bobot fields, hidden bebanMengajarId, and the 'Tambah Komponen Nilai' submit", () => {
    render(<FormKomponenNilai action={vi.fn()} bebanMengajarId="beban_1" />);

    expect(screen.getByLabelText("Nama")).toHaveAttribute("name", "nama");
    expect(screen.getByLabelText("Nama")).toBeRequired();

    const bobot = screen.getByLabelText("Bobot");
    expect(bobot).toHaveAttribute("name", "bobot");
    expect(bobot).toHaveAttribute("type", "number");
    expect(bobot).toBeRequired();

    // bebanMengajarId is carried as a hidden field (server-resolved, §13).
    expect(screen.getByDisplayValue("beban_1")).toHaveAttribute(
      "name",
      "bebanMengajarId"
    );

    expect(
      screen.getByRole("button", { name: /Tambah Komponen Nilai/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit, carrying the hidden bebanMengajarId", () => {
    const action = vi.fn<(fd: FormData) => Promise<void>>(async () => {});
    const { container } = render(
      <FormKomponenNilai action={action} bebanMengajarId="beban_1" />
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
    const fd = action.mock.calls[0][0] as FormData;
    expect(fd.get("bebanMengajarId")).toBe("beban_1");
  });
});
