import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { MataPelajaran } from "@/db/schema";
import type { Ptk } from "@/db/schema";
import type { RombonganBelajar } from "@/db/schema";
import type { Tingkat } from "@/db/schema";

import { FormBebanMengajarBaru } from "./form-beban-mengajar-baru";

const ptks: Ptk[] = [
  {
    id: "ptk_1",
    tenantId: "org_A",
    nama: "Budi",
    nip: null,
    jenis: "pendidik",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
    arsipPada: null,
    arsipOleh: null,
  },
];
const mapel: MataPelajaran[] = [
  { id: "mapel_1", kode: "MTK", nama: "Matematika" },
  { id: "mapel_2", kode: null, nama: "Bahasa Indonesia" },
];
const rombels: RombonganBelajar[] = [
  {
    id: "rombel_1",
    tenantId: "org_A",
    nama: "Kelas 1A",
    tingkatId: "tingkat_1",
    tahunAjaranId: "ta_1",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
];
const tingkats: Tingkat[] = [
  {
    id: "tingkat_1",
    tenantId: "org_A",
    nama: "Kelas 1",
    urutan: 1,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
  },
];

describe("FormBebanMengajarBaru (#10 / T6)", () => {
  it("renders Guru/PTK, Mata Pelajaran, Rombongan Belajar, Tingkat selects + helper + submit", () => {
    render(
      <FormBebanMengajarBaru
        action={vi.fn()}
        ptks={ptks}
        mapel={mapel}
        rombels={rombels}
        tingkats={tingkats}
      />
    );

    // Guru/PTK select
    const ptkSelect = screen.getByLabelText("Guru/PTK");
    expect(ptkSelect).toHaveAttribute("name", "ptkId");
    expect(screen.getByRole("option", { name: "Budi" })).toBeInTheDocument();

    // Mata Pelajaran select
    const mapelSelect = screen.getByLabelText("Mata Pelajaran");
    expect(mapelSelect).toHaveAttribute("name", "mataPelajaranId");
    expect(
      screen.getByRole("option", { name: "Matematika" })
    ).toBeInTheDocument();

    // Rombongan Belajar select (optional — XOR target)
    const rombelSelect = screen.getByLabelText("Rombongan Belajar");
    expect(rombelSelect).toHaveAttribute("name", "rombonganBelajarId");

    // Tingkat select (optional — XOR target)
    const tingkatSelect = screen.getByLabelText("Tingkat");
    expect(tingkatSelect).toHaveAttribute("name", "tingkatId");

    // XOR helper text
    expect(
      screen.getByText(/Pilih salah satu: Rombongan Belajar atau Tingkat/i)
    ).toBeInTheDocument();

    // Submit
    const submit = screen.getByRole("button", {
      name: /Tambah Beban Mengajar/i,
    });
    expect(submit).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <FormBebanMengajarBaru
        action={action}
        ptks={ptks}
        mapel={mapel}
        rombels={rombels}
        tingkats={tingkats}
      />
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
