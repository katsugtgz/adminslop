import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Semester } from "@/db/queries/beban-mengajar";

import type { BarisBebanMengajar } from "./daftar-beban-mengajar";
import type { BarisWaliKelas } from "./daftar-wali-kelas";
import { KonteksGuru } from "./konteks-guru";

const beban: BarisBebanMengajar[] = [
  {
    id: "beban_1",
    ptkNama: "Anda",
    mataPelajaranNama: "Matematika",
    targetNama: "Kelas 1A",
    semester: "ganjil" as Semester,
  },
];
const wali: BarisWaliKelas[] = [
  { id: "wali_1", ptkNama: "Anda", rombonganBelajarNama: "Kelas 1A" },
];

describe("KonteksGuru (#10 / T6 / AC#4)", () => {
  it("renders read-only 'Beban Mengajar Saya' + 'Wali Kelas Saya' lists", () => {
    render(<KonteksGuru beban={beban} wali={wali} />);

    expect(
      screen.getByRole("heading", { name: "Beban Mengajar Saya" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Wali Kelas Saya" })
    ).toBeInTheDocument();

    // beban content (sub-fields render inline in the detail line — regex match)
    expect(screen.getByText(/Matematika/)).toBeInTheDocument();
    // "Kelas 1A" appears in both the beban detail line and the wali row.
    expect(screen.getAllByText(/Kelas 1A/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders NO management forms (read-only context)", () => {
    render(<KonteksGuru beban={beban} wali={wali} />);

    expect(
      screen.queryByRole("button", { name: /Tambah Beban Mengajar/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Tetapkan Wali Kelas/i })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Hapus/i })).toBeNull();
  });

  it("renders empty notes when both lists are empty", () => {
    render(<KonteksGuru beban={[]} wali={[]} />);

    expect(screen.getAllByText(/Belum ada/i).length).toBe(2);
  });
});
