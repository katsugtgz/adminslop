import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { RombonganBelajar } from "@/db/schema";

import { DaftarRombonganBelajar } from "./daftar-rombongan-belajar";

const rombel: RombonganBelajar[] = [
  {
    id: "rb_1",
    tenantId: "org_A",
    nama: "1A",
    tingkatId: "tk_1",
    tahunAjaranId: "ta_1",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "rb_2",
    tenantId: "org_A",
    nama: "2A",
    tingkatId: "tk_2",
    tahunAjaranId: "ta_1",
    dibuatPada: new Date("2026-01-02T00:00:00Z"),
  },
];

describe("DaftarRombonganBelajar (#8 / T11)", () => {
  it("renders nama for each rombongan belajar", () => {
    render(<DaftarRombonganBelajar rombel={rombel} bolehBuat={true} />);

    expect(screen.getByText("1A")).toBeInTheDocument();
    expect(screen.getByText("2A")).toBeInTheDocument();
  });

  it("renders identically for read-only viewers (bolehBuat=false)", () => {
    render(<DaftarRombonganBelajar rombel={rombel} bolehBuat={false} />);

    expect(screen.getByText("1A")).toBeInTheDocument();
    expect(screen.getByText("2A")).toBeInTheDocument();
  });

  it("empty list renders the 'Belum ada Rombongan Belajar.' empty state", () => {
    render(<DaftarRombonganBelajar rombel={[]} bolehBuat={true} />);
    expect(
      screen.getByText(/Belum ada Rombongan Belajar/i)
    ).toBeInTheDocument();
  });
});
