import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DaftarModul } from "./daftar-modul";
import type { IzinReachability } from "./izin-reachability";

const SEMUA_MODUL: IzinReachability = {
  bolehAtur: true,
  bolehLihatAbsensi: true,
  bolehLihatAkses: true,
  bolehLihatArsip: true,
  bolehLihatBankSoal: true,
  bolehLihatBebanMengajar: true,
  bolehLihatCetak: true,
  bolehLihatEraport: true,
  bolehLihatImporPesertaDidik: true,
  bolehLihatKurikulum: true,
  bolehLihatNotifikasi: true,
  bolehLihatPenilaian: true,
  bolehLihatPerangkatAjar: true,
  bolehLihatPermintaanAi: true,
  bolehLihatPesertaDidik: true,
  bolehLihatRombonganBelajar: true,
  bolehLihatSinkronisasi: true,
  bolehLihatTahunAjaran: true,
};

describe("DaftarModul", () => {
  it("groups visible modules into operational sections", () => {
    render(<DaftarModul reachability={SEMUA_MODUL} />);

    expect(
      screen.getByRole("heading", { name: "Operasional harian" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Akademik" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dokumen & AI" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Akses & tata kelola" })
    ).toBeInTheDocument();
  });

  it("preserves existing module link labels and hrefs", () => {
    render(<DaftarModul reachability={SEMUA_MODUL} />);

    expect(screen.getByRole("link", { name: "Buka Cetak" })).toHaveAttribute(
      "href",
      "/dashboard/cetak"
    );
    expect(screen.getByRole("link", { name: "Buka Impor/Ekspor" }))
      .toHaveAttribute("href", "/dashboard/impor-peserta-didik");
  });

  it("hides restricted modules and skips empty section headings", () => {
    const izinTerbatas: IzinReachability = {
      ...SEMUA_MODUL,
      bolehLihatAbsensi: false,
      bolehLihatCetak: false,
      bolehLihatNotifikasi: false,
      bolehLihatSinkronisasi: false,
    };

    render(<DaftarModul reachability={izinTerbatas} />);

    expect(
      screen.queryByRole("heading", { name: "Operasional harian" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Buka Sinkronisasi Data" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Buka Absensi Harian" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Buka Notifikasi" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Buka Cetak" }))
      .not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Dokumen & AI" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka Penilaian" }))
      .toBeInTheDocument();
  });
});
