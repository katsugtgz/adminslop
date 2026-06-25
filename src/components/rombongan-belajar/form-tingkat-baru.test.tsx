import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FormTingkatBaru } from "./form-tingkat-baru";

describe("FormTingkatBaru (#8 / T11)", () => {
  it("renders nama + urutan fields and the 'Tambah Tingkat' submit", () => {
    render(<FormTingkatBaru action={vi.fn()} />);

    expect(screen.getByLabelText("Nama")).toHaveAttribute("name", "nama");
    expect(screen.getByLabelText("Nama")).toBeRequired();

    const urutan = screen.getByLabelText("Urutan");
    expect(urutan).toHaveAttribute("name", "urutan");
    expect(urutan).toHaveAttribute("type", "number");
    expect(urutan).toBeRequired();

    expect(
      screen.getByRole("button", { name: /Tambah Tingkat/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(<FormTingkatBaru action={action} />);

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
