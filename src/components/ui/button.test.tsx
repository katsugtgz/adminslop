import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

  it("prevents disabled slotted links from activating by pointer input", () => {
    const onClick = vi.fn();

    render(
      <Button asChild disabled>
        <a href="/dashboard" onClick={onClick}>Dashboard</a>
      </Button>
    );

    const link = screen.getByRole("link", { name: "Dashboard" });
    const propagated = fireEvent.click(link);

    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(propagated).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });
});
