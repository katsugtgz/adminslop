import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarKurikulum } from "./daftar-kurikulum";
import type { Kurikulum } from "@/db/schema";

function kurikulum(over: Partial<Kurikulum> = {}): Kurikulum {
  return {
    id: "kur_1",
    nama: "Kurikulum Merdeka",
    versi: "2022",
    deskripsi: null,
    sumber: "Kemdikbudristek",
    sumberUrl: null,
    tanggalAmbil: "2024-01-01",
    disetujuiOleh: null,
    statusPersetujuan: "memerlukan_tinjauan",
    dibuatPada: new Date("2024-01-01T00:00:00Z"),
    ...over,
  };
}

describe("DaftarKurikulum (#9 / T6)", () => {
  it("renders each kurikulum with nama and versi", () => {
    render(
      <DaftarKurikulum
        items={[
          kurikulum({ id: "kur_1", nama: "Kurikulum Merdeka", versi: "2022" }),
          kurikulum({ id: "kur_2", nama: "Kurikulum 2013", versi: "2013" }),
        ]}
      />
    );

    expect(screen.getByText("Kurikulum Merdeka")).toBeInTheDocument();
    expect(screen.getByText("Kurikulum 2013")).toBeInTheDocument();
    expect(screen.getByText(/Versi 2022/)).toBeInTheDocument();
  });

  it("renders a drill link per item that adds kurikulumId to the query", () => {
    render(
      <DaftarKurikulum
        items={[kurikulum({ id: "kur_1", nama: "Kurikulum Merdeka" })]}
      />
    );

    const link = screen.getByRole("link", { name: /Kurikulum Merdeka/i });
    expect(link.getAttribute("href")).toContain("kurikulumId=kur_1");
    // Picking a kurikulum resets deeper levels — no mapel/fase/cp/tp params.
    expect(link.getAttribute("href")).not.toContain("mapelId");
  });

  it("renders the status badge text for each approval state", () => {
    render(
      <DaftarKurikulum
        items={[
          kurikulum({ id: "a", statusPersetujuan: "disetujui" }),
          kurikulum({
            id: "b",
            nama: "Kurikulum B",
            statusPersetujuan: "memerlukan_tinjauan",
          }),
          kurikulum({
            id: "c",
            nama: "Kurikulum C",
            statusPersetujuan: "ditolak",
          }),
        ]}
      />
    );

    expect(screen.getByText("Disetujui")).toBeInTheDocument();
    expect(screen.getByText("Memerlukan Tinjauan")).toBeInTheDocument();
    expect(screen.getByText("Ditolak")).toBeInTheDocument();
  });

  it("marks the selected item via aria-current", () => {
    render(
      <DaftarKurikulum
        items={[
          kurikulum({ id: "kur_1", nama: "Kurikulum Merdeka" }),
          kurikulum({ id: "kur_2", nama: "Kurikulum 2013" }),
        ]}
        selectedId="kur_1"
      />
    );

    const merdeka = screen.getByRole("link", { name: /Kurikulum Merdeka/i });
    expect(merdeka).toHaveAttribute("aria-current", "true");
    const k13 = screen.getByRole("link", { name: /Kurikulum 2013/i });
    expect(k13).not.toHaveAttribute("aria-current");
  });

  it("empty list renders the 'Belum ada Kurikulum.' empty state", () => {
    render(<DaftarKurikulum items={[]} />);
    expect(screen.getByText(/Belum ada Kurikulum/i)).toBeInTheDocument();
  });
});
