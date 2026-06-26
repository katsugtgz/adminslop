import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarKomponenNilai } from "./daftar-komponen-nilai";
import type { KomponenNilai } from "@/db/schema";

const komponen: KomponenNilai[] = [
  {
    id: "kn_1",
    tenantId: "org_A",
    bebanMengajarId: "beban_1",
    nama: "UTS",
    bobot: "30",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "kn_2",
    tenantId: "org_A",
    bebanMengajarId: "beban_1",
    nama: "UAS",
    bobot: "70",
    dibuatPada: new Date("2026-01-02T00:00:00Z"),
  },
];

describe("DaftarKomponenNilai (#11 / T7 / T6)", () => {
  it("bolehTulis=true renders nama + bobot per row, a Hapus form per row, and drill Links", () => {
    render(
      <DaftarKomponenNilai
        komponen={komponen}
        bolehTulis={true}
        bebanId="beban_1"
        hapusAction={vi.fn()}
      />
    );

    expect(screen.getByText("UTS")).toBeInTheDocument();
    expect(screen.getByText("UAS")).toBeInTheDocument();
    expect(screen.getByText("Bobot: 30")).toBeInTheDocument();
    expect(screen.getByText("Bobot: 70")).toBeInTheDocument();

    // Each row drills into its Penilaian list (clears deeper penilaianId).
    expect(screen.getByRole("link", { name: /UTS/i })).toHaveAttribute(
      "href",
      "/dashboard/penilaian?bebanId=beban_1&komponenId=kn_1"
    );
    expect(screen.getByRole("link", { name: /UAS/i })).toHaveAttribute(
      "href",
      "/dashboard/penilaian?bebanId=beban_1&komponenId=kn_2"
    );

    // One destructive Hapus form per row, each carrying the komponen id.
    expect(screen.getAllByRole("button", { name: /Hapus/i })).toHaveLength(2);
    expect(screen.getAllByDisplayValue(/kn_/)).toHaveLength(2);
  });

  it("marks the row matching selectedId with aria-current", () => {
    render(
      <DaftarKomponenNilai
        komponen={komponen}
        bolehTulis={false}
        selectedId="kn_2"
        bebanId="beban_1"
        hapusAction={vi.fn()}
      />
    );

    const uts = screen.getByText("UTS").closest("li");
    const uas = screen.getByText("UAS").closest("li");
    expect(uts).not.toHaveAttribute("aria-current", "true");
    expect(uas).toHaveAttribute("aria-current", "true");
  });

  it("bolehTulis=false renders the list read-only (no Hapus forms)", () => {
    render(
      <DaftarKomponenNilai
        komponen={komponen}
        bolehTulis={false}
        bebanId="beban_1"
        hapusAction={vi.fn()}
      />
    );

    expect(screen.getByText("UTS")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hapus/i })).toBeNull();
    expect(screen.queryByDisplayValue(/kn_/)).toBeNull();
  });

  it("empty list renders the 'Belum ada Komponen Nilai.' empty state", () => {
    render(
      <DaftarKomponenNilai
        komponen={[]}
        bolehTulis={true}
        bebanId="beban_1"
        hapusAction={vi.fn()}
      />
    );
    expect(screen.getByText(/Belum ada Komponen Nilai/i)).toBeInTheDocument();
  });
});
