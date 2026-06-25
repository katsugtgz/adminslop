import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarTujuanPembelajaran } from "./daftar-tujuan-pembelajaran";
import type { TujuanPembelajaran } from "@/db/schema";

function tp(over: Partial<TujuanPembelajaran> = {}): TujuanPembelajaran {
  return {
    id: "tp_1",
    capaianPembelajaranId: "cp_1",
    urutan: 1,
    deskripsi: "Menjumlahkan bilangan cacah.",
    sumber: "TP Kemdikbudristek",
    catatan: null,
    ...over,
  };
}

describe("DaftarTujuanPembelajaran (#9 / T6)", () => {
  it("renders urutan, deskripsi, and sumber", () => {
    render(
      <DaftarTujuanPembelajaran
        items={[tp(), tp({ id: "tp_2", urutan: 2, deskripsi: "Mengurangkan." })]}
        kurikulumId="kur_1"
        mapelId="mp_1"
        cpId="cp_1"
      />
    );

    expect(screen.getByText("Menjumlahkan bilangan cacah.")).toBeInTheDocument();
    expect(screen.getByText("Mengurangkan.")).toBeInTheDocument();
    expect(screen.getAllByText(/TP Kemdikbudristek/)).toHaveLength(2);
  });

  it("renders a drill link preserving ancestors + cpId, adding tpId", () => {
    render(
      <DaftarTujuanPembelajaran
        items={[tp()]}
        kurikulumId="kur_1"
        mapelId="mp_1"
        cpId="cp_1"
      />
    );

    const link = screen.getByRole("link", { name: /Menjumlahkan/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("kurikulumId=kur_1");
    expect(href).toContain("mapelId=mp_1");
    expect(href).toContain("cpId=cp_1");
    expect(href).toContain("tpId=tp_1");
  });

  it("marks the selected item via aria-current", () => {
    render(
      <DaftarTujuanPembelajaran
        items={[tp({ id: "tp_1" }), tp({ id: "tp_2", urutan: 2, deskripsi: "Lain." })]}
        selectedId="tp_1"
        kurikulumId="kur_1"
        mapelId="mp_1"
        cpId="cp_1"
      />
    );

    expect(
      screen.getByRole("link", { name: /Menjumlahkan/i })
    ).toHaveAttribute("aria-current", "true");
  });

  it("empty list renders the 'Belum ada Tujuan Pembelajaran.' empty state", () => {
    render(
      <DaftarTujuanPembelajaran
        items={[]}
        kurikulumId="kur_1"
        mapelId="mp_1"
        cpId="cp_1"
      />
    );
    expect(
      screen.getByText(/Belum ada Tujuan Pembelajaran/i)
    ).toBeInTheDocument();
  });
});
