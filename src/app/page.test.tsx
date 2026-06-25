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

  it("menyediakan aksi Tur Awal dan Bantuan", () => {
    render(<BerandaPage />);
    expect(
      screen.getByRole("link", { name: /Mulai Tur Awal/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Buka Bantuan/i })
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
