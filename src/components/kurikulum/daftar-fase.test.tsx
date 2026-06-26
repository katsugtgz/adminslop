import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarFase } from "./daftar-fase";
import type { Fase } from "@/db/schema";

const FASE_A: Fase = {
  id: "fase_A",
  kode: "A",
  nama: "Fase A",
  rentangKelas: "Kelas 1-2",
  jenjang: "SD",
};
const FASE_B: Fase = {
  id: "fase_B",
  kode: "B",
  nama: "Fase B",
  rentangKelas: "Kelas 3-4",
  jenjang: "SD",
};

describe("DaftarFase (#9 / T6)", () => {
  it("renders each fase with kode, nama, and rentang kelas", () => {
    render(
      <DaftarFase
        items={[FASE_A, FASE_B]}
        kurikulumId="kur_1"
        mapelId="mp_1"
      />
    );

    expect(screen.getByText("Fase A")).toBeInTheDocument();
    expect(screen.getByText("Fase B")).toBeInTheDocument();
    expect(screen.getByText(/Kelas 1-2/)).toBeInTheDocument();
  });

  it("renders a drill link that preserves kurikulumId+mapelId and adds faseId", () => {
    render(
      <DaftarFase
        items={[FASE_A]}
        kurikulumId="kur_1"
        mapelId="mp_1"
      />
    );

    const link = screen.getByRole("link", { name: /Fase A/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("kurikulumId=kur_1");
    expect(href).toContain("mapelId=mp_1");
    expect(href).toContain("faseId=fase_A");
    // Picking a fase narrows CP; clears cp/tp/atp.
    expect(href).not.toContain("cpId");
  });

  it("marks the selected item via aria-current", () => {
    render(
      <DaftarFase
        items={[FASE_A, FASE_B]}
        selectedId="fase_A"
        kurikulumId="kur_1"
        mapelId="mp_1"
      />
    );

    expect(
      screen.getByRole("link", { name: /Fase A/i })
    ).toHaveAttribute("aria-current", "true");
  });

  it("empty list renders the 'Belum ada Fase.' empty state", () => {
    render(
      <DaftarFase items={[]} kurikulumId="kur_1" mapelId="mp_1" />
    );
    expect(screen.getByText(/Belum ada Fase/i)).toBeInTheDocument();
  });
});
