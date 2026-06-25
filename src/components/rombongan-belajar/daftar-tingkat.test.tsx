import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Tingkat } from "@/db/schema";

import { DaftarTingkat } from "./daftar-tingkat";

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

describe("DaftarTingkat (#8 / T11)", () => {
  it("renders nama + urutan for each tingkat", () => {
    render(<DaftarTingkat tingkat={tingkat} bolehBuat={true} />);

    expect(screen.getByText("Kelas 1")).toBeInTheDocument();
    expect(screen.getByText("Kelas 2")).toBeInTheDocument();
    // urutan surfaced as metadata
    expect(screen.getByText(/Urutan:\s*1/)).toBeInTheDocument();
    expect(screen.getByText(/Urutan:\s*2/)).toBeInTheDocument();
  });

  it("renders identically for read-only viewers (bolehBuat=false)", () => {
    render(<DaftarTingkat tingkat={tingkat} bolehBuat={false} />);

    expect(screen.getByText("Kelas 1")).toBeInTheDocument();
    expect(screen.getByText("Kelas 2")).toBeInTheDocument();
  });

  it("empty list renders the 'Belum ada Tingkat.' empty state", () => {
    render(<DaftarTingkat tingkat={[]} bolehBuat={true} />);
    expect(screen.getByText(/Belum ada Tingkat/i)).toBeInTheDocument();
  });
});
