import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("disables native buttons while busy", () => {
    render(<Button aria-busy>Simpan</Button>);

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("marks busy slotted links as unavailable to keyboard tab flow", () => {
    render(
      <Button asChild aria-busy>
        <a href="/dashboard">Dashboard</a>
      </Button>
    );

    const link = screen.getByRole("link", { name: "Dashboard" });

    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");
  });
});
