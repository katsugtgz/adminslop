import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarTahunAjaran } from "./daftar-tahun-ajaran";
import type { TahunAjaran } from "@/db/schema";

const TA_2024: TahunAjaran = {
  id: "ta_2024",
  tenantId: "org_A",
  nama: "2024/2025",
  aktif: false,
  dibuatPada: new Date("2024-07-01T00:00:00Z"),
};

const TA_2025: TahunAjaran = {
  id: "ta_2025",
  tenantId: "org_A",
  nama: "2025/2026",
  aktif: true,
  dibuatPada: new Date("2025-07-01T00:00:00Z"),
};

describe("DaftarTahunAjaran (#8 / T10)", () => {
  it("bolehKelola=true renders an 'Aktifkan' form per non-active row; active row shows 'Sedang Aktif'", () => {
    render(
      <DaftarTahunAjaran
        tahunAjaran={[TA_2024, TA_2025]}
        bolehKelola={true}
        action={vi.fn()}
      />
    );

    expect(screen.getByText("2024/2025")).toBeInTheDocument();
    expect(screen.getByText("2025/2026")).toBeInTheDocument();

    // Only the inactive row gets an Aktifkan button.
    expect(
      screen.getAllByRole("button", { name: /Aktifkan/i })
    ).toHaveLength(1);
    // The active row carries the "Sedang Aktif" label (no button).
    expect(screen.getByText("Sedang Aktif")).toBeInTheDocument();
    // Hidden id field present on the activate form.
    expect(screen.getByDisplayValue("ta_2024")).toHaveAttribute("name", "id");
  });

  it("bolehKelola=false renders the list read-only (no Aktifkan forms, no hidden ids)", () => {
    render(
      <DaftarTahunAjaran
        tahunAjaran={[TA_2024, TA_2025]}
        bolehKelola={false}
        action={vi.fn()}
      />
    );

    expect(screen.getByText("2024/2025")).toBeInTheDocument();
    expect(screen.getByText("2025/2026")).toBeInTheDocument();
    // The active row still shows its label, but no management UI for either row.
    expect(screen.getByText("Sedang Aktif")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Aktifkan/i })).toBeNull();
    expect(screen.queryByDisplayValue(/ta_/)).toBeNull();
  });

  it("empty list renders the 'Belum ada Tahun Ajaran.' empty state", () => {
    render(
      <DaftarTahunAjaran
        tahunAjaran={[]}
        bolehKelola={true}
        action={vi.fn()}
      />
    );
    expect(screen.getByText(/Belum ada Tahun Ajaran/i)).toBeInTheDocument();
  });

  it("renders an 'Aktif' status badge on the active row", () => {
    render(
      <DaftarTahunAjaran
        tahunAjaran={[TA_2025]}
        bolehKelola={true}
        action={vi.fn()}
      />
    );
    expect(screen.getByText("Aktif")).toBeInTheDocument();
  });
});
