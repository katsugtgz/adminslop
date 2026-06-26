import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Semester } from "@/db/queries/beban-mengajar";

import { DaftarBebanMengajar, type BarisBebanMengajar } from "./daftar-beban-mengajar";

const baris: BarisBebanMengajar[] = [
  {
    id: "beban_1",
    ptkNama: "Budi",
    mataPelajaranNama: "Matematika",
    targetNama: "Kelas 1A",
    semester: "ganjil" as Semester,
  },
  {
    id: "beban_2",
    ptkNama: "Siti",
    mataPelajaranNama: "Bahasa Indonesia",
    targetNama: "Kelas 2",
    semester: "genap" as Semester,
  },
];

describe("DaftarBebanMengajar (#10 / T6)", () => {
  it("renders one row per beban with PTK, Mata Pelajaran, Target, Period", () => {
    render(
      <DaftarBebanMengajar
        beban={baris}
        bolehKelola={true}
        hapusAction={vi.fn()}
      />
    );

    // ptkNama renders in its own span (exact match); sub-fields (Mata Pelajaran,
    // Target, semester) render inline in the detail line, so match by regex.
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByText(/Matematika/)).toBeInTheDocument();
    expect(screen.getByText(/Kelas 1A/)).toBeInTheDocument();
    expect(screen.getByText("Siti")).toBeInTheDocument();
    expect(screen.getByText(/Bahasa Indonesia/)).toBeInTheDocument();
    expect(screen.getByText(/Kelas 2/)).toBeInTheDocument();
  });

  it("bolehKelola=true renders a Hapus form per row carrying the beban id", () => {
    render(
      <DaftarBebanMengajar
        beban={baris}
        bolehKelola={true}
        hapusAction={vi.fn()}
      />
    );

    const hapus = screen.getAllByRole("button", { name: /Hapus/i });
    expect(hapus).toHaveLength(2);
    // each delete form carries the beban id as a hidden field named `id`
    expect(screen.getAllByDisplayValue(/beban_/)).toHaveLength(2);
  });

  it("bolehKelola=false renders the table read-only (no Hapus forms)", () => {
    render(
      <DaftarBebanMengajar
        beban={baris}
        bolehKelola={false}
        hapusAction={vi.fn()}
      />
    );

    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hapus/i })).toBeNull();
    expect(screen.queryByDisplayValue(/beban_/)).toBeNull();
  });

  it("empty list renders the 'Belum ada Beban Mengajar.' empty state", () => {
    render(
      <DaftarBebanMengajar
        beban={[]}
        bolehKelola={true}
        hapusAction={vi.fn()}
      />
    );
    expect(screen.getByText(/Belum ada Beban Mengajar/i)).toBeInTheDocument();
  });
});
