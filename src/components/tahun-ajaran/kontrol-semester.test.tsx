import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { KontrolSemester } from "./kontrol-semester";

describe("KontrolSemester (#8 / T10)", () => {
  it("renders the Semester Aktif select with Ganjil + Genap options", () => {
    render(<KontrolSemester action={vi.fn()} semesterAktif="ganjil" />);

    const select = screen.getByLabelText("Semester Aktif");
    expect(select).toHaveAttribute("name", "semester");
    expect(screen.getByRole("option", { name: "Ganjil" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Genap" })).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /Ubah Semester Aktif/i })
    ).toHaveAttribute("type", "submit");
  });

  it("prefills the select to the live semesterAktif (ganjil)", () => {
    render(<KontrolSemester action={vi.fn()} semesterAktif="ganjil" />);
    expect(screen.getByLabelText("Semester Aktif")).toHaveValue("ganjil");
  });

  it("prefills the select to the live semesterAktif (genap)", () => {
    render(<KontrolSemester action={vi.fn()} semesterAktif="genap" />);
    expect(screen.getByLabelText("Semester Aktif")).toHaveValue("genap");
  });

  it("defaults to 'ganjil' when semesterAktif is null (unset)", () => {
    render(<KontrolSemester action={vi.fn()} semesterAktif={null} />);
    expect(screen.getByLabelText("Semester Aktif")).toHaveValue("ganjil");
  });

  it("posts to the provided server action on submit", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <KontrolSemester action={action} semesterAktif="genap" />
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
  });
});
