import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarWaliKelas, type BarisWaliKelas } from "./daftar-wali-kelas";

const wali: BarisWaliKelas[] = [
  { id: "wali_1", ptkNama: "Budi", rombonganBelajarNama: "Kelas 1A" },
  { id: "wali_2", ptkNama: "Siti", rombonganBelajarNama: "Kelas 2B" },
];

describe("DaftarWaliKelas (#10 / T6)", () => {
  it("renders one row per wali with PTK + Rombongan Belajar", () => {
    render(
      <DaftarWaliKelas
        wali={wali}
        bolehKelola={true}
        hapusAction={vi.fn()}
      />
    );

    // ptkNama renders in its own span (exact match); Rombongan Belajar nama
    // renders inline in the "Wali: ..." detail line, so match by regex.
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByText(/Kelas 1A/)).toBeInTheDocument();
    expect(screen.getByText("Siti")).toBeInTheDocument();
    expect(screen.getByText(/Kelas 2B/)).toBeInTheDocument();
  });

  it("bolehKelola=true renders a Hapus form per row carrying the wali id", () => {
    render(
      <DaftarWaliKelas
        wali={wali}
        bolehKelola={true}
        hapusAction={vi.fn()}
      />
    );

    const hapus = screen.getAllByRole("button", { name: /Hapus/i });
    expect(hapus).toHaveLength(2);
    expect(screen.getAllByDisplayValue(/wali_/)).toHaveLength(2);
  });

  it("bolehKelola=false renders the list read-only (no Hapus forms)", () => {
    render(
      <DaftarWaliKelas
        wali={wali}
        bolehKelola={false}
        hapusAction={vi.fn()}
      />
    );

    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hapus/i })).toBeNull();
    expect(screen.queryByDisplayValue(/wali_/)).toBeNull();
  });

  it("empty list renders the 'Belum ada Wali Kelas.' empty state", () => {
    render(
      <DaftarWaliKelas wali={[]} bolehKelola={true} hapusAction={vi.fn()} />
    );
    expect(screen.getByText(/Belum ada Wali Kelas/i)).toBeInTheDocument();
  });
});
