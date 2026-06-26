import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { MutasiPesertaDidik } from "@/db/schema";

import { DaftarMutasi } from "./daftar-mutasi";
import { FormMutasi } from "./form-mutasi";

const MUTASI: MutasiPesertaDidik = {
  id: "mutasi_1",
  tenantId: "org_A",
  pesertaDidikId: "pd_1",
  arah: "keluar",
  asalSekolah: null,
  tujuanSekolah: "SMP Harapan",
  tanggal: "2026-03-15",
  alasan: "Pindah domisili",
  dibuatOleh: "workos_u_1",
  dibuatPada: new Date("2026-03-15T00:00:00Z"),
};

describe("FormMutasi (#7 / T8)", () => {
  it("renders arah select (Masuk/Keluar) + fields + hidden id + submit", () => {
    render(<FormMutasi action={vi.fn()} pesertaDidikId="pd_1" />);

    const arah = screen.getByLabelText("Arah");
    expect(arah).toHaveAttribute("name", "arah");
    expect(screen.getByRole("option", { name: "Masuk" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Keluar" })).toBeInTheDocument();

    expect(screen.getByLabelText("Asal Sekolah")).toHaveAttribute(
      "name",
      "asalSekolah"
    );
    expect(screen.getByLabelText("Tujuan Sekolah")).toHaveAttribute(
      "name",
      "tujuanSekolah"
    );
    expect(screen.getByLabelText("Tanggal")).toHaveAttribute("name", "tanggal");
    expect(screen.getByLabelText("Tanggal")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Alasan")).toHaveAttribute("name", "alasan");

    // hidden id carries the peserta_didik id (action reads `id`)
    expect(screen.getByDisplayValue("pd_1")).toHaveAttribute("name", "id");

    expect(
      screen.getByRole("button", { name: /Catat Mutasi/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <FormMutasi action={action} pesertaDidikId="pd_1" />
    );
    fireEvent.submit(container.querySelector("form")!);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});

describe("DaftarMutasi (#7 / T8)", () => {
  it("renders empty state", () => {
    render(<DaftarMutasi mutasi={[]} />);
    expect(screen.getByText("Belum ada Mutasi.")).toBeInTheDocument();
  });

  it("renders mutasi records with Bahasa arah label", () => {
    render(<DaftarMutasi mutasi={[MUTASI]} />);
    // arah keluar -> "Keluar"
    expect(screen.getByText("Keluar")).toBeInTheDocument();
    expect(screen.getByText(/Tujuan Sekolah: SMP Harapan/)).toBeInTheDocument();
  });
});
