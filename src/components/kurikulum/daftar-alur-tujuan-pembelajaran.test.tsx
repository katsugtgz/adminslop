import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarAlurTujuanPembelajaran } from "./daftar-alur-tujuan-pembelajaran";
import type { AlurTujuanPembelajaran } from "@/db/schema";

function atp(over: Partial<AlurTujuanPembelajaran> = {}): AlurTujuanPembelajaran {
  return {
    id: "atp_1",
    tujuanPembelajaranId: "tp_1",
    urutan: 1,
    deskripsi: "Alur: pengenalan bilangan.",
    sumber: "ATP GM",
    catatan: null,
    ...over,
  };
}

describe("DaftarAlurTujuanPembelajaran (#9 / T6)", () => {
  it("renders urutan, deskripsi, and sumber for each item", () => {
    render(
      <DaftarAlurTujuanPembelajaran
        items={[
          atp(),
          atp({ id: "atp_2", urutan: 2, deskripsi: "Alur: penjumlahan." }),
        ]}
      />
    );

    expect(screen.getByText("Alur: pengenalan bilangan.")).toBeInTheDocument();
    expect(screen.getByText("Alur: penjumlahan.")).toBeInTheDocument();
    expect(screen.getAllByText(/ATP GM/)).toHaveLength(2);
  });

  it("is a leaf level — renders NO drill links", () => {
    render(<DaftarAlurTujuanPembelajaran items={[atp()]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders the urutan index per row", () => {
    render(
      <DaftarAlurTujuanPembelajaran
        items={[atp({ urutan: 3 })]}
      />
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("empty list renders the 'Belum ada Alur Tujuan Pembelajaran.' empty state", () => {
    render(<DaftarAlurTujuanPembelajaran items={[]} />);
    expect(
      screen.getByText(/Belum ada Alur Tujuan Pembelajaran/i)
    ).toBeInTheDocument();
  });
});
