import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import BerandaPage from "@/app/page";

describe("BerandaPage (product shell)", () => {
  it("menampilkan judul produk dalam Bahasa Indonesia", () => {
    render(<BerandaPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /EduAdmin Pro Premium/i })
    ).toBeInTheDocument();
  });

  it("menyediakan aksi Dashboard dan Tur Awal", () => {
    render(<BerandaPage />);
    expect(
      screen.getByRole("link", { name: /Masuk ke Dashboard/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Tur Awal$/i })
    ).toBeInTheDocument();
  });

  it("mendaftarkan modul MVP sebagai placeholder", () => {
    render(<BerandaPage />);
    expect(
      screen.getByRole("heading", { level: 2, name: /^Modul$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Input Nilai & E-Raport")
    ).toBeInTheDocument();
  });
});
