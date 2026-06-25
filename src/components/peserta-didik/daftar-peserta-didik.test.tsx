import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarPesertaDidik } from "./daftar-peserta-didik";
import type { PesertaDidik } from "@/db/schema";

const PD_AKTIF: PesertaDidik = {
  id: "pd_1",
  tenantId: "org_A",
  nama: "Budi Santoso",
  nisn: "12345678",
  nis: "NIS-001",
  tanggalLahir: "2010-05-15",
  jenisKelamin: "L",
  status: "aktif",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
  diperbaruiPada: new Date("2026-01-01T00:00:00Z"),
};

const PD_LULUS: PesertaDidik = {
  id: "pd_2",
  tenantId: "org_A",
  nama: "Siti Aminah",
  nisn: null,
  nis: null,
  tanggalLahir: "2009-11-20",
  jenisKelamin: "P",
  status: "lulus",
  dibuatPada: new Date("2026-01-02T00:00:00Z"),
  diperbaruiPada: new Date("2026-01-02T00:00:00Z"),
};

const peserta: PesertaDidik[] = [PD_AKTIF, PD_LULUS];

describe("DaftarPesertaDidik (#7 / T7)", () => {
  it("renders rows with student data + Bahasa status badges + detail links", () => {
    render(
      <DaftarPesertaDidik
        peserta={peserta}
        bolehTulis={false}
        ubahStatusAction={vi.fn()}
      />
    );

    // nama
    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.getByText("Siti Aminah")).toBeInTheDocument();

    // nisn / nis render (Budi has them, Siti shows em-dash placeholder)
    expect(screen.getByText("12345678")).toBeInTheDocument();
    expect(screen.getByText("NIS-001")).toBeInTheDocument();

    // tanggal lahir — deterministic Bahasa format (15 Mei 2010 / 20 November 2009)
    expect(screen.getByText("15 Mei 2010")).toBeInTheDocument();
    expect(screen.getByText("20 November 2009")).toBeInTheDocument();

    // jenis kelamin — Bahasa labels
    expect(screen.getByText("Laki-laki")).toBeInTheDocument();
    expect(screen.getByText("Perempuan")).toBeInTheDocument();

    // status badges — Bahasa labels
    expect(screen.getByText("Aktif")).toBeInTheDocument();
    expect(screen.getByText("Lulus")).toBeInTheDocument();

    // detail links point at T8 detail page
    expect(
      screen.getByRole("link", { name: "Budi Santoso" })
    ).toHaveAttribute("href", "/dashboard/peserta-didik/pd_1");
    expect(
      screen.getByRole("link", { name: "Siti Aminah" })
    ).toHaveAttribute("href", "/dashboard/peserta-didik/pd_2");
  });

  it("bolehTulis=true renders a 'Ubah Status' form per row", () => {
    render(
      <DaftarPesertaDidik
        peserta={peserta}
        bolehTulis={true}
        ubahStatusAction={vi.fn()}
      />
    );

    const ubah = screen.getAllByRole("button", { name: /Ubah Status/i });
    expect(ubah).toHaveLength(2);
    // each status form carries the pesertaId as a hidden field
    expect(screen.getByDisplayValue("pd_1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("pd_2")).toBeInTheDocument();
  });

  it("bolehTulis=false renders the list read-only (no Ubah Status forms)", () => {
    render(
      <DaftarPesertaDidik
        peserta={peserta}
        bolehTulis={false}
        ubahStatusAction={vi.fn()}
      />
    );

    expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ubah Status/i })).toBeNull();
    expect(screen.queryByDisplayValue(/pd_/)).toBeNull();
  });

  it("empty list renders the 'Belum ada Peserta Didik.' empty state", () => {
    render(
      <DaftarPesertaDidik
        peserta={[]}
        bolehTulis={true}
        ubahStatusAction={vi.fn()}
      />
    );
    expect(screen.getByText(/Belum ada Peserta Didik/i)).toBeInTheDocument();
  });
});
