import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarMataPelajaran } from "./daftar-mata-pelajaran";
import type { MataPelajaran } from "@/db/schema";

const MAPEL_A: MataPelajaran = {
  id: "mp_1",
  kode: "MAT",
  nama: "Matematika",
};
const MAPEL_B: MataPelajaran = {
  id: "mp_2",
  kode: "BIN",
  nama: "Bahasa Indonesia",
};

describe("DaftarMataPelajaran (#9 / T6)", () => {
  it("renders each mata pelajaran with nama and kode", () => {
    render(
      <DaftarMataPelajaran
        items={[MAPEL_A, MAPEL_B]}
        kurikulumId="kur_1"
      />
    );

    expect(screen.getByText("Matematika")).toBeInTheDocument();
    expect(screen.getByText("Bahasa Indonesia")).toBeInTheDocument();
    expect(screen.getByText(/Kode:\s*MAT/)).toBeInTheDocument();
  });

  it("renders a drill link that preserves kurikulumId and adds mapelId", () => {
    render(
      <DaftarMataPelajaran items={[MAPEL_A]} kurikulumId="kur_1" />
    );

    const link = screen.getByRole("link", { name: /Matematika/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("kurikulumId=kur_1");
    expect(href).toContain("mapelId=mp_1");
    // Picking a mapel clears deeper levels.
    expect(href).not.toContain("faseId");
    expect(href).not.toContain("cpId");
  });

  it("marks the selected item via aria-current", () => {
    render(
      <DaftarMataPelajaran
        items={[MAPEL_A, MAPEL_B]}
        selectedId="mp_1"
        kurikulumId="kur_1"
      />
    );

    expect(
      screen.getByRole("link", { name: /Matematika/i })
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("link", { name: /Bahasa Indonesia/i })
    ).not.toHaveAttribute("aria-current");
  });

  it("empty list renders the 'Belum ada Mata Pelajaran.' empty state", () => {
    render(<DaftarMataPelajaran items={[]} kurikulumId="kur_1" />);
    expect(screen.getByText(/Belum ada Mata Pelajaran/i)).toBeInTheDocument();
  });
});
