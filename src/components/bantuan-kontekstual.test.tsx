import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { BantuanKontekstual } from "./bantuan-kontekstual";

describe("BantuanKontekstual — inline help tooltip", () => {
  it("renders a focusable help button with an accessible name", () => {
    render(<BantuanKontekstual teks="Keterangan bantuan" />);
    const btn = screen.getByRole("button", { name: /Bantuan/i });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("reveals the tooltip text on focus and links via aria-describedby", () => {
    render(<BantuanKontekstual teks="Tips memilih Satuan Pendidikan" />);
    const btn = screen.getByRole("button", { name: /Bantuan/i });

    expect(screen.queryByText(/Tips memilih Satuan Pendidikan/i)).toBeNull();
    fireEvent.focus(btn);

    const tooltip = screen.getByText(/Tips memilih Satuan Pendidikan/i);
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveAttribute("role", "tooltip");

    // aria-describedby points at the visible tooltip id
    const describedById = btn.getAttribute("aria-describedby");
    expect(describedById).toBe(tooltip.getAttribute("id"));
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("hides the tooltip on blur", () => {
    render(<BantuanKontekstual teks="Tips singkat" />);
    const btn = screen.getByRole("button", { name: /Bantuan/i });

    fireEvent.focus(btn);
    expect(screen.getByText(/Tips singkat/i)).toBeInTheDocument();

    fireEvent.blur(btn);
    expect(screen.queryByText(/Tips singkat/i)).toBeNull();
    expect(btn).not.toHaveAttribute("aria-describedby");
  });

  it("honours a custom label for screen-reader users", () => {
    render(
      <BantuanKontekstual
        teks="Hanya admin yang dapat mengubah bidang ini."
        label="Bantuan izin"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Bantuan izin/i }),
    ).toBeInTheDocument();
  });
});
