import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FormPermintaan } from "./form-permintaan";
import { PILIHAN_JENIS } from "./jenis-permintaan";

describe("FormPermintaan (#12 / T7)", () => {
  it("renders the Jenis select with all four Bahasa options", () => {
    render(<FormPermintaan action={vi.fn()} />);

    const jenis = screen.getByLabelText("Jenis");
    expect(jenis).toHaveAttribute("name", "jenis");

    expect(
      screen.getByRole("option", { name: "Deskripsi Capaian Pembelajaran" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Deskripsi Tujuan Pembelajaran" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Deskripsi Alur Tujuan Pembelajaran" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Narasi Raport" })
    ).toBeInTheDocument();
  });

  it("each Jenis option value is the canonical slug", () => {
    render(<FormPermintaan action={vi.fn()} />);

    for (const { slug, label } of PILIHAN_JENIS) {
      const opt = screen.getByRole("option", { name: label }) as HTMLOptionElement;
      expect(opt.value).toBe(slug);
    }
  });

  it("renders the optional Konteks textarea", () => {
    render(<FormPermintaan action={vi.fn()} />);

    const konteks = screen.getByLabelText("Konteks");
    expect(konteks).toHaveAttribute("name", "konteks");
    // Konteks is optional (default {} server-side) — never required.
    expect(konteks).not.toBeRequired();
  });

  it("renders the 'Kirim Permintaan AI' submit button", () => {
    render(<FormPermintaan action={vi.fn()} />);

    const submit = screen.getByRole("button", { name: /Kirim Permintaan AI/i });
    expect(submit).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(<FormPermintaan action={action} />);

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
