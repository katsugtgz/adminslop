import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarPengguna } from "./daftar-pengguna";
import type { PenggunaDenganPtk } from "@/db/queries/akses";
import type { Ptk } from "@/db/schema";

const ptk: Ptk = {
  id: "ptk_1",
  tenantId: "org_A",
  nama: "Budi",
  nip: "123",
  jenis: "pendidik",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
};

const pengguna: PenggunaDenganPtk = {
  id: "pg_1",
  tenantId: "org_A",
  userId: "workos_u_1",
  peranAkses: "guru",
  ptkId: "ptk_1",
  nama: "Pengguna Satu",
  dibuatPada: new Date("2026-01-01T00:00:00Z"),
  ptk,
};

describe("DaftarPengguna (#6 / T6)", () => {
  it("bolehKelola=true renders link form + 35 izin + 35 pembatasan checkboxes reflecting aksesMap", () => {
    const aksesMap = new Map([
      ["pg_1", { izin: ["ptk:baca"], pembatasan: ["akses:kelola"] }],
    ]);

    render(
      <DaftarPengguna
        penggunas={[pengguna]}
        bolehKelola={true}
        linkAction={vi.fn()}
        ptks={[ptk]}
        aksesMap={aksesMap}
        aturIzinAction={vi.fn()}
        aturPembatasanAction={vi.fn()}
      />
    );

    // user info
    expect(screen.getByText(/Pengguna Satu/)).toBeInTheDocument();
    expect(screen.getByText(/Peran Akses: guru/i)).toBeInTheDocument();
    expect(screen.getByText(/Tautan PTK: Budi/i)).toBeInTheDocument(); // linked ptk name

    // link form
    expect(
      screen.getByRole("form", { name: "Tautan PTK" })
    ).toBeInTheDocument();

    expect(screen.getAllByRole("checkbox")).toHaveLength(70);

    // defaultChecked reflects aksesMap
    expect(
      screen.getByRole("checkbox", { name: "izin-ptk:baca" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "izin-akses:kelola" })
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "pembatasan-akses:kelola" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "pembatasan-ptk:baca" })
    ).not.toBeChecked();
  });

  it("bolehKelola=false renders read-only: user info shown, no management forms", () => {
    const penggunaUnlinked: PenggunaDenganPtk = {
      ...pengguna,
      id: "pg_2",
      ptkId: null,
      ptk: null,
      userId: "workos_u_2",
      nama: null,
      peranAkses: "guru",
    };

    render(
      <DaftarPengguna
        penggunas={[penggunaUnlinked]}
        bolehKelola={false}
        linkAction={vi.fn()}
        ptks={[ptk]}
        aksesMap={new Map()}
        aturIzinAction={vi.fn()}
        aturPembatasanAction={vi.fn()}
      />
    );

    // read-only info present
    expect(screen.getByText("workos_u_2")).toBeInTheDocument();
    expect(screen.getByText(/Peran Akses: guru/i)).toBeInTheDocument();
    expect(screen.getByText(/Tidak terhubung/i)).toBeInTheDocument();

    // no management forms / checkboxes
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.queryByRole("form", { name: "Tautan PTK" })
    ).toBeNull();
  });

  it("empty list renders the 'Belum ada Pengguna.' empty state", () => {
    render(
      <DaftarPengguna
        penggunas={[]}
        bolehKelola={true}
        linkAction={vi.fn()}
        ptks={[]}
        aksesMap={new Map()}
        aturIzinAction={vi.fn()}
        aturPembatasanAction={vi.fn()}
      />
    );
    expect(screen.getByText(/Belum ada Pengguna/i)).toBeInTheDocument();
  });
});
