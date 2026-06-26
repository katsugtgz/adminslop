import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { KontenCetak } from "@/db/queries/cetak";

import {
  PratinjauEraport,
  hitungPengaturanEfektif,
} from "./pratinjau-eraport";

function fixture(over: Partial<KontenCetak> = {}): KontenCetak {
  return {
    eraportId: "er_1",
    semester: "ganjil",
    status: "terbit",
    konten: { nilaiAkhir: 87.5, sumber: "nilai_akhir" },
    namaSatuanPendidikan: "Sekolah Unggul Nusantara",
    npsn: "20100001",
    alamat: "Jl. Merdeka No. 17",
    logoUrl: "https://example.com/logo.png",
    formatPreferensi: "a4",
    tampilkanLogoDefault: true,
    tampilkanHeaderDefault: true,
    template: null,
    ...over,
  };
}

// AC#3 GOLDEN VISUAL CHECK — structural assertions on the print-ready preview.
// Not pixel-perfect; verifies the key print elements are present and the paper
// size + identity + signature areas render in the expected structure.
describe("PratinjauEraport — AC#3 golden visual check", () => {
  it("renders school identity header: nama (h1), NPSN, alamat, semester", () => {
    render(<PratinjauEraport konten={fixture()} />);
    expect(
      screen.getByRole("heading", { name: /Sekolah Unggul Nusantara/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/NPSN: 20100001/i)).toBeInTheDocument();
    expect(screen.getByText(/Jl\. Merdeka No\. 17/i)).toBeInTheDocument();
    expect(screen.getByText(/Semester: ganjil/i)).toBeInTheDocument();
  });

  it("carries the A4 paper-size hook (data-cetak-format) and the a4 class", () => {
    const { container } = render(<PratinjauEraport konten={fixture()} />);
    const kertas = container.querySelector("[data-cetak-format]");
    expect(kertas).not.toBeNull();
    expect(kertas!.getAttribute("data-cetak-format")).toBe("a4");
    expect(kertas!.className).toContain("cetak-a4");
  });

  it("switches to F4 layout when formatPreferensi is f4", () => {
    const { container } = render(
      <PratinjauEraport konten={fixture({ formatPreferensi: "f4" })} />
    );
    const kertas = container.querySelector("[data-cetak-format]");
    expect(kertas!.getAttribute("data-cetak-format")).toBe("f4");
    expect(kertas!.className).toContain("cetak-f4");
    expect(container.querySelector("style")?.textContent).toContain("F4");
  });

  it("renders the Tanda Tangan + Stempel print-element area (data-cetak-tanda-tangan)", () => {
    const { container } = render(<PratinjauEraport konten={fixture()} />);
    const tandaTangan = container.querySelector(
      "[data-cetak-tanda-tangan]"
    );
    expect(tandaTangan).not.toBeNull();
    // AC#4 PRINT ELEMENT labels present (formatting only, not legal signatures).
    expect(screen.getAllByText(/Tanda Tangan/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Stempel/i).length).toBeGreaterThan(0);
  });

  it("hides the identity header when showHeader is false (template override)", () => {
    const konten = fixture({
      template: {
        id: "tpl_1",
        nama: "Tpl",
        pengaturan: { showHeader: false },
      },
    });
    const { container } = render(<PratinjauEraport konten={konten} />);
    expect(container.querySelector("[data-cetak-header]")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /Sekolah Unggul Nusantara/i })
    ).toBeNull();
  });

  it("shows the logo image when showLogo true + logoUrl present", () => {
    render(<PratinjauEraport konten={fixture()} />);
    const logo = screen.getByAltText(/Logo Satuan Pendidikan/i);
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "https://example.com/logo.png");
  });

  it("hitungPengaturanEfektif layers template over preferensi defaults", () => {
    // Template showLogo=false overrides the true default.
    const k = fixture({
      template: {
        id: "tpl_1",
        nama: "Tpl",
        pengaturan: { showLogo: false, marginMm: 25 },
      },
    });
    const ef = hitungPengaturanEfektif(k);
    expect(ef.showLogo).toBe(false);
    expect(ef.showHeader).toBe(true); // default carried
    expect(ef.marginMm).toBe(25);
    expect(ef.format).toBe("a4");
  });

  it("renders the passed tandaTanganNama/Peran in the signature block", () => {
    render(
      <PratinjauEraport
        konten={fixture()}
        tandaTanganNama="Budi Santoso"
        tandaTanganPeran="Kepala Sekolah"
      />
    );
    expect(screen.getAllByText(/Budi Santoso/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Kepala Sekolah/i)).toBeInTheDocument();
  });
});
