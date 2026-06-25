import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarCapaianPembelajaran } from "./daftar-capaian-pembelajaran";
import type { CapaianPembelajaran } from "@/db/schema";

function cp(over: Partial<CapaianPembelajaran> = {}): CapaianPembelajaran {
  return {
    id: "cp_1",
    kurikulumId: "kur_1",
    mataPelajaranId: "mp_1",
    faseId: "fase_A",
    kode: "CP-1",
    elemen: "Bilangan",
    deskripsi: "Peserta didik dapat memahami bilangan cacah.",
    sumber: "Capaian Pembelajaran Kemdikbudristek",
    catatan: null,
    ...over,
  };
}

describe("DaftarCapaianPembelajaran (#9 / T6)", () => {
  it("renders kode, elemen, full deskripsi, and sumber", () => {
    render(
      <DaftarCapaianPembelajaran
        items={[cp()]}
        kurikulumId="kur_1"
        mapelId="mp_1"
      />
    );

    expect(screen.getByText(/Bilangan/)).toBeInTheDocument();
    expect(
      screen.getByText("Peserta didik dapat memahami bilangan cacah.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Capaian Pembelajaran Kemdikbudristek/)
    ).toBeInTheDocument();
  });

  it("renders a drill link preserving kurikulumId+mapelId and adding cpId", () => {
    render(
      <DaftarCapaianPembelajaran
        items={[cp()]}
        kurikulumId="kur_1"
        mapelId="mp_1"
      />
    );

    const link = screen.getByRole("link", { name: /Bilangan/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("kurikulumId=kur_1");
    expect(href).toContain("mapelId=mp_1");
    expect(href).toContain("cpId=cp_1");
    // No faseId set -> not in the query.
    expect(href).not.toContain("faseId");
    // Picking a CP clears tp/atp.
    expect(href).not.toContain("tpId");
  });

  it("includes faseId in the drill link when provided", () => {
    render(
      <DaftarCapaianPembelajaran
        items={[cp()]}
        kurikulumId="kur_1"
        mapelId="mp_1"
        faseId="fase_A"
      />
    );

    const link = screen.getByRole("link", { name: /Bilangan/i });
    expect(link.getAttribute("href") ?? "").toContain("faseId=fase_A");
  });

  it("marks the selected item via aria-current", () => {
    render(
      <DaftarCapaianPembelajaran
        items={[
          cp({ id: "cp_1" }),
          cp({
            id: "cp_2",
            elemen: "Pengukuran",
            deskripsi: "Peserta didik dapat mengukur panjang.",
          }),
        ]}
        selectedId="cp_1"
        kurikulumId="kur_1"
        mapelId="mp_1"
      />
    );

    expect(
      screen.getByRole("link", { name: /Bilangan/i })
    ).toHaveAttribute("aria-current", "true");
  });

  it("empty list renders the 'Belum ada Capaian Pembelajaran.' empty state", () => {
    render(
      <DaftarCapaianPembelajaran
        items={[]}
        kurikulumId="kur_1"
        mapelId="mp_1"
      />
    );
    expect(
      screen.getByText(/Belum ada Capaian Pembelajaran/i)
    ).toBeInTheDocument();
  });
});
