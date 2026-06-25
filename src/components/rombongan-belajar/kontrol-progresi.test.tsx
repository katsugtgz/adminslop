import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { PesertaDidik } from "@/db/schema";

import { KontrolProgresi } from "./kontrol-progresi";

const peserta: PesertaDidik[] = [
  {
    id: "pd_1",
    tenantId: "org_A",
    nama: "Budi Santoso",
    nisn: "0001",
    nis: "N-1",
    tanggalLahir: "2012-01-01",
    jenisKelamin: "L",
    status: "aktif",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
    diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
  },
];

describe("KontrolProgresi (#8 / T11)", () => {
  it("renders TWO forms: 'Kenaikan Tingkat' and 'Tinggal Tingkat'", () => {
    render(
      <KontrolProgresi
        kenaikanAction={vi.fn()}
        tinggalAction={vi.fn()}
        peserta={peserta}
      />
    );

    const naik = screen.getByRole("button", { name: /Kenaikan Tingkat/i });
    const tinggal = screen.getByRole("button", { name: /Tinggal Tingkat/i });
    expect(naik).toHaveAttribute("type", "submit");
    expect(tinggal).toHaveAttribute("type", "submit");
  });

  it("each form has a pesertaDidikId select (of the provided peserta)", () => {
    render(
      <KontrolProgresi
        kenaikanAction={vi.fn()}
        tinggalAction={vi.fn()}
        peserta={peserta}
      />
    );

    const selects = screen.getAllByLabelText("Peserta Didik");
    expect(selects).toHaveLength(2);
    for (const sel of selects) {
      expect(sel).toHaveAttribute("name", "pesertaDidikId");
    }
    // both forms surface the peserta option
    expect(screen.getAllByText("Budi Santoso")).toHaveLength(2);
  });

  it("each form has a 'Tahun Ajaran Baru' input named tahunAjaranBaruId", () => {
    render(
      <KontrolProgresi
        kenaikanAction={vi.fn()}
        tinggalAction={vi.fn()}
        peserta={peserta}
      />
    );

    const taBaru = screen.getAllByLabelText("Tahun Ajaran Baru");
    expect(taBaru).toHaveLength(2);
    for (const input of taBaru) {
      expect(input).toHaveAttribute("name", "tahunAjaranBaruId");
      expect(input).toBeRequired();
    }
  });

  it("Kenaikan Tingkat form posts to kenaikanAction", () => {
    const kenaikanAction = vi.fn(async () => {});
    const { container } = render(
      <KontrolProgresi
        kenaikanAction={kenaikanAction}
        tinggalAction={vi.fn()}
        peserta={peserta}
      />
    );

    const forms = container.querySelectorAll("form");
    expect(forms).toHaveLength(2);
    // First form is the Kenaikan Tingkat form.
    fireEvent.submit(forms[0]);
    expect(kenaikanAction).toHaveBeenCalledTimes(1);
    expect(kenaikanAction).toHaveBeenCalledWith(expect.any(FormData));
  });

  it("Tinggal Tingkat form posts to tinggalAction", () => {
    const tinggalAction = vi.fn(async () => {});
    const { container } = render(
      <KontrolProgresi
        kenaikanAction={vi.fn()}
        tinggalAction={tinggalAction}
        peserta={peserta}
      />
    );

    const forms = container.querySelectorAll("form");
    expect(forms).toHaveLength(2);
    // Second form is the Tinggal Tingkat form.
    fireEvent.submit(forms[1]);
    expect(tinggalAction).toHaveBeenCalledTimes(1);
    expect(tinggalAction).toHaveBeenCalledWith(expect.any(FormData));
  });
});
