import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { RiwayatStatusPesertaDidik } from "@/db/schema";

import { DaftarRiwayatStatus } from "./daftar-riwayat-status";

function riwayat(partial: Partial<RiwayatStatusPesertaDidik>): RiwayatStatusPesertaDidik {
  return {
    id: "rw_1",
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    status: "aktif",
    catatan: null,
    dibuatOleh: null,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
    ...partial,
  };
}

describe("DaftarRiwayatStatus (#7 / T8)", () => {
  it("renders empty state when no entries", () => {
    render(<DaftarRiwayatStatus riwayat={[]} />);
    expect(screen.getByText("Belum ada Riwayat Status.")).toBeInTheDocument();
  });

  it("renders chronological entries with Bahasa status + catatan", () => {
    render(
      <DaftarRiwayatStatus
        riwayat={[
          riwayat({ id: "rw_1", status: "aktif", catatan: null }),
          riwayat({
            id: "rw_2",
            status: "pindah",
            catatan: "Pindahan dari SD lain",
            dibuatOleh: "workos_u_1",
            dibuatPada: new Date("2026-02-01T00:00:00Z"),
          }),
        ]}
      />
    );

    // Bahasa status labels
    expect(screen.getByText("Aktif")).toBeInTheDocument();
    expect(screen.getByText("Pindah")).toBeInTheDocument();
    // catatan appears
    expect(screen.getByText("Pindahan dari SD lain")).toBeInTheDocument();
  });
});
