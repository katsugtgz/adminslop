import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { KartuDraf } from "./kartu-draf";
import type { DrafAi } from "@/db/schema";

function draf(over: Partial<DrafAi> = {}): DrafAi {
  return {
    id: "draf_1",
    tenantId: "org_A",
    permintaanAiId: "permintaan_1",
    konten: "Konten contoh dari AI.",
    provenance: "mock-model-v1@2026-01-01T00:00:00.000Z",
    statusVerifikasi: "menunggu",
    diverifikasiOleh: null,
    diverifikasiPada: null,
    dibuatPada: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

describe("KartuDraf (#12 / T7 — AC#2 provenance, AC#3 gate)", () => {
  it("marks AI content clearly with [DRAF AI] and renders the konten", () => {
    render(<KartuDraf draf={draf()} bolehVerifikasi={false} action={vi.fn()} />);

    expect(screen.getByText(/\[DRAF AI\]/i)).toBeInTheDocument();
    expect(screen.getByText("Konten contoh dari AI.")).toBeInTheDocument();
  });

  it("renders the provenance (AC#2 — traceable, never anonymous)", () => {
    render(<KartuDraf draf={draf()} bolehVerifikasi={false} action={vi.fn()} />);

    expect(screen.getByText(/Provenance/i)).toBeInTheDocument();
    expect(
      screen.getByText(/mock-model-v1@2026-01-01T00:00:00\.000Z/)
    ).toBeInTheDocument();
  });

  it("menunggu -> shows 'Menunggu Verifikasi' badge", () => {
    render(<KartuDraf draf={draf()} bolehVerifikasi={false} action={vi.fn()} />);
    expect(screen.getByText(/Menunggu Verifikasi/i)).toBeInTheDocument();
  });

  it("menunggu + bolehVerifikasi -> renders Setujui + Tolak forms posting the draf id", () => {
    const action = vi.fn(async () => {});
    render(
      <KartuDraf draf={draf()} bolehVerifikasi action={action} />
    );

    const setujui = screen.getByRole("button", { name: /Setujui/i });
    const tolak = screen.getByRole("button", { name: /Tolak/i });
    expect(setujui).toBeInTheDocument();
    expect(tolak).toBeInTheDocument();

    const formSetujui = setujui.closest("form")!;
    const formTolak = tolak.closest("form")!;

    expect(formSetujui.querySelector('input[name="drafId"]')).toHaveValue(
      "draf_1"
    );
    expect(formSetujui.querySelector('input[name="status"]')).toHaveValue(
      "disetujui"
    );
    expect(formTolak.querySelector('input[name="drafId"]')).toHaveValue("draf_1");
    expect(formTolak.querySelector('input[name="status"]')).toHaveValue(
      "ditolak"
    );
  });

  it("menunggu + !bolehVerifikasi -> no Setujui / Tolak buttons", () => {
    render(<KartuDraf draf={draf()} bolehVerifikasi={false} action={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /Setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tolak/i })).toBeNull();
  });

  it("disetujui -> shows 'Draf AI Terverifikasi' / Disetujui badge and no buttons", () => {
    render(
      <KartuDraf
        draf={draf({ statusVerifikasi: "disetujui" })}
        bolehVerifikasi
        action={vi.fn()}
      />
    );

    expect(screen.getByText(/Disetujui/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Draf AI Terverifikasi/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tolak/i })).toBeNull();
  });

  it("ditolak -> shows Ditolak badge and no buttons", () => {
    render(
      <KartuDraf
        draf={draf({ statusVerifikasi: "ditolak" })}
        bolehVerifikasi
        action={vi.fn()}
      />
    );

    expect(screen.getByText(/Ditolak/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tolak/i })).toBeNull();
  });
});
