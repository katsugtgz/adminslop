import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarNilaiAkhir } from "./daftar-nilai-akhir";
import type { NilaiAkhirPesertaDidik } from "@/db/queries/nilai-peserta-didik";

const nilaiAkhir: NilaiAkhirPesertaDidik[] = [
  {
    pesertaDidikId: "pd_1",
    // Σ(avg×bobot)/Σ(bobot) = (80×30 + 90×70)/100 = 87
    nilaiAkhir: 87,
    rincian: [
      {
        komponenNilaiId: "kn_1",
        nama: "UTS",
        bobot: 30,
        rataRata: 80,
      },
      {
        komponenNilaiId: "kn_2",
        nama: "UAS",
        bobot: 70,
        rataRata: 90,
      },
    ],
  },
];

const pesertaNama = new Map([["pd_1", "Andi"]]);

describe("DaftarNilaiAkhir (#11 / T7 / T6 — AC#3 derivation display)", () => {
  it("renders each student's name + derived nilaiAkhir + an expandable rincian", () => {
    render(<DaftarNilaiAkhir nilaiAkhir={nilaiAkhir} pesertaNama={pesertaNama} />);

    // Name resolved from the pesertaNama map.
    expect(screen.getByText("Andi")).toBeInTheDocument();
    // Derived Nilai Akhir (AC#3 — never stored).
    expect(screen.getByText("87")).toBeInTheDocument();

    // Expandable rincian exposes every contributing component with its bobot
    // (AC#3: visible & auditable weights) + rata-rata.
    expect(
      screen.getByRole("columnheader", { name: "Rincian" })
    ).toBeInTheDocument();
    expect(screen.getByText("Rincian (2 komponen)")).toBeInTheDocument();
    expect(screen.getByText("UTS · Bobot: 30 · Rata-rata: 80")).toBeInTheDocument();
    expect(screen.getByText("UAS · Bobot: 70 · Rata-rata: 90")).toBeInTheDocument();
  });

  it("falls back to '—' when the peserta name is absent", () => {
    render(
      <DaftarNilaiAkhir
        nilaiAkhir={nilaiAkhir}
        pesertaNama={new Map()}
      />
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders '—' for a rincian rata-rata when the student was absent (null)", () => {
    const absent: NilaiAkhirPesertaDidik[] = [
      {
        pesertaDidikId: "pd_2",
        nilaiAkhir: 0,
        rincian: [
          {
            komponenNilaiId: "kn_1",
            nama: "UTS",
            bobot: 30,
            rataRata: null,
          },
        ],
      },
    ];
    render(<DaftarNilaiAkhir nilaiAkhir={absent} pesertaNama={new Map()} />);
    expect(screen.getByText("UTS · Bobot: 30 · Rata-rata: —")).toBeInTheDocument();
  });

  it("empty list renders the 'Belum ada Nilai Akhir.' empty state", () => {
    render(<DaftarNilaiAkhir nilaiAkhir={[]} pesertaNama={pesertaNama} />);
    expect(screen.getByText(/Belum ada Nilai Akhir/i)).toBeInTheDocument();
  });
});
