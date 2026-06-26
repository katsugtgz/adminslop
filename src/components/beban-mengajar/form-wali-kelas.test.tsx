import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Ptk } from "@/db/schema";
import type { RombonganBelajar } from "@/db/schema";

import { FormWaliKelas } from "./form-wali-kelas";

const ptks: Ptk[] = [
  {
    id: "ptk_1",
    tenantId: "org_A",
    nama: "Budi",
    nip: null,
    jenis: "pendidik",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
    arsipPada: null,
    arsipOleh: null,
  },
];
const rombels: RombonganBelajar[] = [
  {
    id: "rombel_1",
    tenantId: "org_A",
    nama: "Kelas 1A",
    tingkatId: "tingkat_1",
    tahunAjaranId: "ta_1",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
];

describe("FormWaliKelas (#10 / T6)", () => {
  it("renders Guru/PTK + Rombongan Belajar selects + 'Tetapkan Wali Kelas' submit", () => {
    render(
      <FormWaliKelas action={vi.fn()} ptks={ptks} rombels={rombels} />
    );

    const ptkSelect = screen.getByLabelText("Guru/PTK");
    expect(ptkSelect).toHaveAttribute("name", "ptkId");
    expect(screen.getByRole("option", { name: "Budi" })).toBeInTheDocument();

    const rombelSelect = screen.getByLabelText("Rombongan Belajar");
    expect(rombelSelect).toHaveAttribute("name", "rombonganBelajarId");
    expect(
      screen.getByRole("option", { name: "Kelas 1A" })
    ).toBeInTheDocument();

    const submit = screen.getByRole("button", {
      name: /Tetapkan Wali Kelas/i,
    });
    expect(submit).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <FormWaliKelas action={action} ptks={ptks} rombels={rombels} />
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
