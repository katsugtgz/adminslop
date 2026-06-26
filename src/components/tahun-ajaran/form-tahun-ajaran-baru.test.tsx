import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FormTahunAjaranBaru } from "./form-tahun-ajaran-baru";

describe("FormTahunAjaranBaru (#8 / T10)", () => {
  it("renders the nama field + the 'Tambah Tahun Ajaran' submit", () => {
    render(<FormTahunAjaranBaru action={vi.fn()} />);

    const nama = screen.getByLabelText("Nama");
    expect(nama).toHaveAttribute("name", "nama");
    expect(nama).toBeRequired();
    expect(nama).toHaveAttribute("placeholder", "2025/2026");

    expect(
      screen.getByRole("button", { name: /Tambah Tahun Ajaran/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(<FormTahunAjaranBaru action={action} />);

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
