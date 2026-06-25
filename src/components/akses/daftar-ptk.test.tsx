import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarPtk } from "./daftar-ptk";
import type { Ptk } from "@/db/schema";

const ptks: Ptk[] = [
  {
    id: "ptk_1",
    tenantId: "org_A",
    nama: "Budi",
    nip: "123",
    jenis: "pendidik",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "ptk_2",
    tenantId: "org_A",
    nama: "Siti",
    nip: null,
    jenis: "tenaga_kependidikan",
    dibuatPada: new Date("2026-01-02T00:00:00Z"),
  },
];

describe("DaftarPtk (#6 / T6)", () => {
  it("bolehKelola=true renders a Hapus form per row", () => {
    render(
      <DaftarPtk ptks={ptks} bolehKelola={true} hapusAction={vi.fn()} />
    );

    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByText("Siti")).toBeInTheDocument();
    const hapus = screen.getAllByRole("button", { name: /Hapus/i });
    expect(hapus).toHaveLength(2);
    // each delete form carries the ptkId as a hidden field
    expect(screen.getAllByDisplayValue(/ptk_/)).toHaveLength(2);
  });

  it("bolehKelola=false renders the list read-only (no Hapus forms)", () => {
    render(
      <DaftarPtk ptks={ptks} bolehKelola={false} hapusAction={vi.fn()} />
    );

    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hapus/i })).toBeNull();
    expect(screen.queryByDisplayValue(/ptk_/)).toBeNull();
  });

  it("empty list renders the 'Belum ada PTK.' empty state", () => {
    render(<DaftarPtk ptks={[]} bolehKelola={true} hapusAction={vi.fn()} />);
    expect(screen.getByText(/Belum ada PTK/i)).toBeInTheDocument();
  });
});
