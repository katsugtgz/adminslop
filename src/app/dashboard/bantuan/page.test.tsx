import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import DashboardBantuanPage from "./page";

describe("Dashboard /bantuan page — Pusat Bantuan", () => {
  it("renders the page title 'Pusat Bantuan' and FAQ heading in Bahasa", () => {
    render(<DashboardBantuanPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Pusat Bantuan/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /Pertanyaan yang sering diajukan/i,
      }),
    ).toBeInTheDocument();
  });

  it("lists the four core FAQ topics (Satuan Pendidikan, Peserta Didik, Nilai, E-Raport)", () => {
    render(<DashboardBantuanPage />);
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: /Bagaimana cara memilih Satuan Pendidikan/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: /Bagaimana cara menambah Peserta Didik/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: /Bagaimana cara mencatat nilai/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: /Bagaimana cara mencetak E-Raport/i,
      }),
    ).toBeInTheDocument();
  });

  it("documents the MVP scope boundary in the batasan FAQ", () => {
    render(<DashboardBantuanPage />);
    expect(
      screen.getByText(/portal wali murid/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/docs\/POST-MVP\.md/i),
    ).toBeInTheDocument();
  });
});
