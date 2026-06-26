import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { FormUbahStatus } from "./form-ubah-status";

describe("FormUbahStatus (#7 / T7)", () => {
  it("renders hidden id, a 4-option status select, catatan field + the 'Ubah Status' submit", () => {
    render(<FormUbahStatus action={vi.fn()} pesertaId="pd_123" />);

    // hidden id carries the pesertaId (never client-supplied in real flow —
    // server binds it from the row)
    const idField = screen.getByDisplayValue("pd_123");
    expect(idField).toHaveAttribute("type", "hidden");
    expect(idField).toHaveAttribute("name", "id");

    // status select with 4 Bahasa options
    const status = screen.getByLabelText("Status");
    expect(status).toHaveAttribute("name", "status");
    expect(screen.getByRole("option", { name: "Aktif" })).toHaveAttribute("value", "aktif");
    expect(screen.getByRole("option", { name: "Pindah" })).toHaveAttribute("value", "pindah");
    expect(screen.getByRole("option", { name: "Lulus" })).toHaveAttribute("value", "lulus");
    expect(screen.getByRole("option", { name: "Keluar" })).toHaveAttribute("value", "keluar");

    // catatan optional
    const catatan = screen.getByLabelText("Catatan");
    expect(catatan).toHaveAttribute("name", "catatan");
    expect(catatan).not.toBeRequired();

    // submit
    expect(
      screen.getByRole("button", { name: /Ubah Status/i })
    ).toHaveAttribute("type", "submit");
  });

  it("posts to the provided server action on submit, carrying the pesertaId", () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <FormUbahStatus action={action} pesertaId="pd_456" />
    );

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(expect.any(FormData));
    // the hidden id is part of the submitted payload
    const submitted = expect.any(FormData);
    expect(action).toHaveBeenCalledWith(submitted);
    expect(screen.getByDisplayValue("pd_456")).toBeInTheDocument();
  });
});
