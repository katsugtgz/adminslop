import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Tingkat } from "@/db/schema";

import { FormRombonganBelajarBaru } from "./form-rombongan-belajar-baru";

const tingkat: Tingkat[] = [
  {
    id: "tk_1",
    tenantId: "org_A",
    nama: "Kelas 1",
    urutan: 1,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "tk_2",
    tenantId: "org_A",
    nama: "Kelas 2",
    urutan: 2,
    dibuatPada: new Date("2026-01-02T00:00:00Z"),
  },
];

describe("FormRombonganBelajarBaru (#8 / T11)", () => {
  it("renders nama + tingkatId select (of the provided tingkat) + 'Tambah Rombongan Belajar' submit", () => {
    render(<FormRombonganBelajarBaru action={vi.fn()} tingkat={tingkat} />);

    expect(screen.getByLabelText("Nama")).toHaveAttribute("name", "nama");
    expect(screen.getByLabelText("Nama")).toBeRequired();

    const select = screen.getByLabelText("Tingkat");
    expect(select).toHaveAttribute("name", "tingkatId");
    expect(select).toBeRequired();
    expect(
      screen.getByRole("option", { name: "Kelas 1" })
    ).toHaveAttribute("value", "tk_1");
    expect(
      screen.getByRole("option", { name: "Kelas 2" })
    ).toHaveAttribute("value", "tk_2");

    expect(
      screen.getByRole("button", { name: /Tambah Rombongan Belajar/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <FormRombonganBelajarBaru action={action} tingkat={tingkat} />
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
