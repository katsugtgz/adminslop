import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { KontakDarurat } from "@/db/schema";

import { DaftarKontakDarurat } from "./daftar-kontak-darurat";
import { FormKontakDarurat } from "./form-kontak-darurat";

const KONTAK: KontakDarurat = {
  id: "kontak_1",
  tenantId: "org_A",
  pesertaDidikId: "pd_1",
  nama: "Paman Budi",
  hubungan: "Paman",
  telepon: "08987654321",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

describe("FormKontakDarurat (#7 / T8)", () => {
  it("renders nama/hubungan/telepon (NO email) + hidden pesertaDidikId + submit", () => {
    render(<FormKontakDarurat action={vi.fn()} pesertaDidikId="pd_1" />);

    expect(screen.getByLabelText("Nama")).toHaveAttribute("name", "nama");
    expect(screen.getByLabelText("Hubungan")).toHaveAttribute("name", "hubungan");
    expect(screen.getByLabelText("Telepon")).toHaveAttribute("name", "telepon");
    // NO email field on kontak darurat
    expect(screen.queryByLabelText("Email")).toBeNull();

    expect(screen.getByDisplayValue("pd_1")).toHaveAttribute(
      "name",
      "pesertaDidikId"
    );

    expect(
      screen.getByRole("button", { name: /Tambah Kontak Darurat/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <FormKontakDarurat action={action} pesertaDidikId="pd_1" />
    );
    fireEvent.submit(container.querySelector("form")!);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});

describe("DaftarKontakDarurat (#7 / T8)", () => {
  it("renders empty state", () => {
    render(
      <DaftarKontakDarurat kontak={[]} bolehTulis={false} hapusAction={vi.fn()} />
    );
    expect(screen.getByText("Belum ada Kontak Darurat.")).toBeInTheDocument();
  });

  it("with bolehTulis=true renders a hapus form per row", () => {
    render(
      <DaftarKontakDarurat
        kontak={[KONTAK]}
        bolehTulis={true}
        hapusAction={vi.fn()}
      />
    );
    expect(screen.getByText("Paman Budi")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Hapus/i })).toHaveLength(1);
  });

  it("with bolehTulis=false renders the list without any hapus form", () => {
    render(
      <DaftarKontakDarurat
        kontak={[KONTAK]}
        bolehTulis={false}
        hapusAction={vi.fn()}
      />
    );
    expect(screen.getByText("Paman Budi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hapus/i })).toBeNull();
  });
});
