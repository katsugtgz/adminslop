import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { PesertaDidik, RombonganBelajar } from "@/db/schema";

import { FormTempatkanPesertaDidik } from "./form-tempatkan-peserta-didik";

const peserta: PesertaDidik[] = [
  {
    id: "pd_1",
    tenantId: "org_A",
    nama: "Budi Santoso",
    nisn: "0001",
    nis: "N-1",
    tanggalLahir: "2012-01-01",
    jenisKelamin: "L",
    status: "aktif",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
    diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
  },
];
const rombel: RombonganBelajar[] = [
  {
    id: "rb_1",
    tenantId: "org_A",
    nama: "1A",
    tingkatId: "tk_1",
    tahunAjaranId: "ta_1",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
];

describe("FormTempatkanPesertaDidik (#8 / T11)", () => {
  it("renders pesertaDidikId + rombonganBelajarId selects and the 'Tempatkan Peserta Didik' submit", () => {
    render(
      <FormTempatkanPesertaDidik
        action={vi.fn()}
        peserta={peserta}
        rombel={rombel}
      />
    );

    const pesertaSelect = screen.getByLabelText("Peserta Didik");
    expect(pesertaSelect).toHaveAttribute("name", "pesertaDidikId");
    expect(pesertaSelect).toBeRequired();
    expect(
      screen.getByRole("option", { name: "Budi Santoso" })
    ).toHaveAttribute("value", "pd_1");

    const rombelSelect = screen.getByLabelText("Rombongan Belajar");
    expect(rombelSelect).toHaveAttribute("name", "rombonganBelajarId");
    expect(rombelSelect).toBeRequired();
    expect(
      screen.getByRole("option", { name: "1A" })
    ).toHaveAttribute("value", "rb_1");

    expect(
      screen.getByRole("button", { name: /Tempatkan Peserta Didik/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <FormTempatkanPesertaDidik
        action={action}
        peserta={peserta}
        rombel={rombel}
      />
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
