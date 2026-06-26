import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { KartuKuota } from "./kartu-kuota";
import type { InfoKuotaAi } from "@/db/queries/kuota-ai";

function kuota(over: Partial<InfoKuotaAi> = {}): InfoKuotaAi {
  return { terpakai: 3, batas: 10, tersisa: 7, ...over };
}

describe("KartuKuota (#12 / T7 — AC#5)", () => {
  it("renders the 'Kuota AI' heading", () => {
    render(<KartuKuota kuota={kuota()} />);
    expect(
      screen.getByRole("heading", { name: /Kuota AI/i })
    ).toBeInTheDocument();
  });

  it("renders 'X dari Y (tersisa Z)' using terpakai/batas/tersisa", () => {
    render(<KartuKuota kuota={kuota({ terpakai: 3, batas: 10, tersisa: 7 })} />);
    expect(screen.getByText(/3 dari 10/i)).toBeInTheDocument();
    expect(screen.getByText(/tersisa 7/i)).toBeInTheDocument();
  });

  it("reflects updated counts", () => {
    render(
      <KartuKuota kuota={kuota({ terpakai: 8, batas: 10, tersisa: 2 })} />
    );
    expect(screen.getByText(/8 dari 10/i)).toBeInTheDocument();
    expect(screen.getByText(/tersisa 2/i)).toBeInTheDocument();
  });

  it("renders a progress bar reflecting the terpakai/batas ratio", () => {
    const { container } = render(
      <KartuKuota kuota={kuota({ terpakai: 5, batas: 10, tersisa: 5 })} />
    );
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    // 5/10 = 50%
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps the progress bar at 100% when terpakai exceeds batas", () => {
    const { container } = render(
      <KartuKuota kuota={kuota({ terpakai: 12, batas: 10, tersisa: -2 })} />
    );
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });
});
