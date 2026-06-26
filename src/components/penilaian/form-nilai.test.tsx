import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FormNilai } from "./form-nilai";
import type { PesertaDidik } from "@/db/schema";

const peserta: PesertaDidik[] = [
  {
    id: "pd_1",
    tenantId: "org_A",
    nama: "Andi",
    nisn: null,
    nis: null,
    tanggalLahir: "2015-01-01",
    jenisKelamin: "L",
    status: "aktif",
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
    diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
  },
];

describe("FormNilai (#11 / T7 / T6)", () => {
  it("renders the peserta nama, nilai(0-100) + catatan inputs, hidden ids, and a 'Simpan Nilai' submit per row", () => {
    render(
      <FormNilai
        action={vi.fn()}
        penilaianId="pen_1"
        peserta={peserta}
        nilaiMap={new Map()}
      />
    );

    expect(screen.getByText("Andi")).toBeInTheDocument();

    const nilai = screen.getByLabelText("Nilai");
    expect(nilai).toHaveAttribute("name", "nilai");
    expect(nilai).toHaveAttribute("type", "number");
    expect(nilai).toHaveAttribute("min", "0");
    expect(nilai).toHaveAttribute("max", "100");

    expect(screen.getByLabelText("Catatan")).toHaveAttribute("name", "catatan");

    // Both ids are carried as hidden fields per row.
    expect(screen.getByDisplayValue("pen_1")).toHaveAttribute(
      "name",
      "penilaianId"
    );
    expect(screen.getByDisplayValue("pd_1")).toHaveAttribute(
      "name",
      "pesertaDidikId"
    );

    expect(
      screen.getByRole("button", { name: /Simpan Nilai/i })
    ).toHaveAttribute("type", "submit");
  });

  it("prefills nilai + catatan from the nilaiMap when an existing row is present", () => {
    const nilaiMap = new Map([
      ["pd_1", { nilai: "85", catatan: "Bagus" }],
    ]);
    render(
      <FormNilai
        action={vi.fn()}
        penilaianId="pen_1"
        peserta={peserta}
        nilaiMap={nilaiMap}
      />
    );

    expect(screen.getByLabelText("Nilai")).toHaveDisplayValue("85");
    expect(screen.getByLabelText("Catatan")).toHaveDisplayValue("Bagus");
  });

  it("posts to the provided server action on submit, carrying penilaianId + pesertaDidikId", () => {
    const action = vi.fn<(fd: FormData) => Promise<void>>(async () => {});
    const { container } = render(
      <FormNilai
        action={action}
        penilaianId="pen_1"
        peserta={peserta}
        nilaiMap={new Map()}
      />
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
    const fd = action.mock.calls[0][0] as FormData;
    expect(fd.get("penilaianId")).toBe("pen_1");
    expect(fd.get("pesertaDidikId")).toBe("pd_1");
  });

  it("empty peserta list renders the 'Belum ada Peserta Didik.' empty state", () => {
    render(
      <FormNilai
        action={vi.fn()}
        penilaianId="pen_1"
        peserta={[]}
        nilaiMap={new Map()}
      />
    );
    expect(screen.getByText(/Belum ada Peserta Didik/i)).toBeInTheDocument();
  });
});
