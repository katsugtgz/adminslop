import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { WaliPesertaDidik } from "@/db/schema";

import { DaftarWali } from "./daftar-wali";
import { FormWali } from "./form-wali";

const WALI: WaliPesertaDidik = {
  id: "wali_1",
  tenantId: "org_A",
  pesertaDidikId: "pd_1",
  nama: "Ayah Siti",
  hubungan: "Ayah",
  telepon: "08123456789",
  email: "ayah@example.com",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

describe("FormWali (#7 / T8)", () => {
  it("renders nama/hubungan/telepon/email fields + hidden pesertaDidikId + submit", () => {
    render(<FormWali action={vi.fn()} pesertaDidikId="pd_1" />);

    expect(screen.getByLabelText("Nama")).toHaveAttribute("name", "nama");
    expect(screen.getByLabelText("Hubungan")).toHaveAttribute("name", "hubungan");
    expect(screen.getByLabelText("Telepon")).toHaveAttribute("name", "telepon");
    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");

    const idInput = screen.getByDisplayValue("pd_1");
    expect(idInput).toHaveAttribute("name", "pesertaDidikId");
    expect(idInput).toHaveAttribute("type", "hidden");

    expect(
      screen.getByRole("button", { name: /Tambah Wali/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <FormWali action={action} pesertaDidikId="pd_1" />
    );
    fireEvent.submit(container.querySelector("form")!);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});

describe("DaftarWali (#7 / T8)", () => {
  it("renders empty state", () => {
    render(<DaftarWali wali={[]} bolehTulis={false} hapusAction={vi.fn()} />);
    expect(screen.getByText("Belum ada Wali.")).toBeInTheDocument();
  });

  it("with bolehTulis=true renders a hapus form per row", () => {
    render(<DaftarWali wali={[WALI]} bolehTulis={true} hapusAction={vi.fn()} />);
    expect(screen.getByText("Ayah Siti")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Hapus/i })).toHaveLength(1);
    expect(screen.getByDisplayValue("wali_1")).toHaveAttribute("name", "id");
  });

  it("with bolehTulis=false renders the list without any hapus form", () => {
    render(<DaftarWali wali={[WALI]} bolehTulis={false} hapusAction={vi.fn()} />);
    expect(screen.getByText("Ayah Siti")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hapus/i })).toBeNull();
  });
});
