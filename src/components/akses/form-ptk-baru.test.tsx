import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FormPtkBaru } from "./form-ptk-baru";

describe("FormPtkBaru (#6 / T6)", () => {
  it("renders nama, nip, jenis fields + the 'Tambah PTK' submit", () => {
    render(<FormPtkBaru action={vi.fn()} />);

    expect(screen.getByLabelText("Nama")).toHaveAttribute("name", "nama");
    expect(screen.getByLabelText("Nama")).toBeRequired();

    expect(screen.getByLabelText("NIP")).toHaveAttribute("name", "nip");
    expect(screen.getByLabelText("NIP")).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText("NIP")).not.toBeRequired();

    const jenis = screen.getByLabelText("Jenis");
    expect(jenis).toHaveAttribute("name", "jenis");
    expect(screen.getByRole("option", { name: "Pendidik" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Tenaga Kependidikan" })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /Tambah PTK/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(<FormPtkBaru action={action} />);

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
