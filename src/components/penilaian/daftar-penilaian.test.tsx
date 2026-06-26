import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarPenilaian } from "./daftar-penilaian";
import type { Penilaian } from "@/db/schema";

const penilaian: Penilaian[] = [
  {
    id: "pen_1",
    tenantId: "org_A",
    komponenNilaiId: "kn_1",
    nama: "Tugas 1",
    tanggal: "2026-01-10",
    dibuatOleh: null,
    dibuatPada: new Date("2026-01-10T00:00:00Z"),
    arsipPada: null,
    arsipOleh: null,
  },
  {
    id: "pen_2",
    tenantId: "org_A",
    komponenNilaiId: "kn_1",
    nama: "Tugas 2",
    tanggal: "2026-02-10",
    dibuatOleh: null,
    dibuatPada: new Date("2026-02-10T00:00:00Z"),
    arsipPada: null,
    arsipOleh: null,
  },
];

describe("DaftarPenilaian (#11 / T7 / T6)", () => {
  it("bolehTulis=true renders nama + tanggal per row, a Hapus form per row, and drill Links", () => {
    render(
      <DaftarPenilaian
        penilaian={penilaian}
        bolehTulis={true}
        bebanId="beban_1"
        komponenId="kn_1"
        hapusAction={vi.fn()}
      />
    );

    expect(screen.getByText("Tugas 1")).toBeInTheDocument();
    expect(screen.getByText("Tugas 2")).toBeInTheDocument();
    expect(screen.getByText("Tanggal: 2026-01-10")).toBeInTheDocument();

    // Each row drills into per-student Nilai entry, echoing parent context.
    expect(screen.getByRole("link", { name: /Tugas 1/i })).toHaveAttribute(
      "href",
      "/dashboard/penilaian?bebanId=beban_1&komponenId=kn_1&penilaianId=pen_1"
    );

    expect(screen.getAllByRole("button", { name: /Hapus/i })).toHaveLength(2);
    expect(screen.getAllByDisplayValue(/pen_/)).toHaveLength(2);
  });

  it("marks the row matching selectedId with aria-current", () => {
    render(
      <DaftarPenilaian
        penilaian={penilaian}
        bolehTulis={false}
        selectedId="pen_1"
        bebanId="beban_1"
        komponenId="kn_1"
        hapusAction={vi.fn()}
      />
    );

    const tugas1 = screen.getByText("Tugas 1").closest("li");
    const tugas2 = screen.getByText("Tugas 2").closest("li");
    expect(tugas1).toHaveAttribute("aria-current", "true");
    expect(tugas2).not.toHaveAttribute("aria-current", "true");
  });

  it("bolehTulis=false renders the list read-only (no Hapus forms)", () => {
    render(
      <DaftarPenilaian
        penilaian={penilaian}
        bolehTulis={false}
        bebanId="beban_1"
        komponenId="kn_1"
        hapusAction={vi.fn()}
      />
    );

    expect(screen.getByText("Tugas 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hapus/i })).toBeNull();
  });

  it("empty list renders the 'Belum ada Penilaian.' empty state", () => {
    render(
      <DaftarPenilaian
        penilaian={[]}
        bolehTulis={true}
        bebanId="beban_1"
        komponenId="kn_1"
        hapusAction={vi.fn()}
      />
    );
    expect(screen.getByText(/Belum ada Penilaian/i)).toBeInTheDocument();
  });
});
