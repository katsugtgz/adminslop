import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { DrafEraport } from "@/db/schema";

import { DetailEraport } from "./detail-eraport";

// Audit-mandated konten contract — the expanded detail must render this shape
// as structured Bahasa fields, not `<pre>{JSON.stringify(eraport.konten)}</pre>`.
function kontenEraportRealistis() {
  return {
    peserta_didik: {
      nama: "Ahmad Budi Santoso",
      nisn: "0012345678",
      kelas: "VIII-A",
    },
    mata_pelajaran: [
      { nama: "Matematika", nilai: 92.5, predikat: "A", catatan: "Sangat baik" },
      { nama: "Bahasa Indonesia", nilai: 88.0, predikat: "B+", catatan: "Baik" },
    ],
    ekstrakurikuler: "Pramuka (Penegak)",
    kehadiran: { sakit: 1, izin: 0, alpa: 0 },
    catatan_wali_kelas: "Menunjukkan kemajuan yang konsisten semester ini.",
  };
}

function eraport(over: Partial<DrafEraport> = {}): DrafEraport {
  return {
    id: "er_001",
    tenantId: "org_A",
    pesertaDidikId: "pd_1",
    tahunAjaranId: "ta_1",
    semester: "ganjil",
    status: "draf",
    konten: kontenEraportRealistis(),
    drafAiId: null,
    catatan: null,
    dibuatOleh: "workos_u_1",
    dibuatPada: new Date("2026-06-01T00:00:00Z"),
    diterbitkanPada: null,
    ...over,
  };
}

const noopAction = vi.fn(async () => {});

describe("DetailEraport — expanded body is a structured report, not JSON", () => {
  it("toggles open to reveal the konten body (Lihat Detail → Sembunyikan Detail)", () => {
    render(
      <DetailEraport
        eraport={eraport()}
        revisiList={[]}
        bolehRevisi={false}
        revisiAction={noopAction}
      />
    );
    const tombol = screen.getByRole("button", { name: /Lihat Detail/i });
    expect(tombol).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(tombol);
    expect(
      screen.getByRole("button", { name: /Sembunyikan Detail/i })
    ).toBeInTheDocument();
  });

  it("renders student identity (nama, nisn, kelas) as readable fields when expanded", () => {
    render(
      <DetailEraport
        eraport={eraport()}
        revisiList={[]}
        bolehRevisi={false}
        revisiAction={noopAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Lihat Detail/i }));
    const body = document.body;
    expect(body.textContent).toMatch(/Ahmad Budi Santoso/);
    expect(body.textContent).toMatch(/0012345678/);
    expect(body.textContent).toMatch(/VIII-A/);
    expect(body.textContent).toMatch(/Nama/i);
    expect(body.textContent).toMatch(/NISN/i);
    expect(body.textContent).toMatch(/Kelas/i);
  });

  it("renders mata_pelajaran rows (nama + nilai + predikat) when expanded", () => {
    render(
      <DetailEraport
        eraport={eraport()}
        revisiList={[]}
        bolehRevisi={false}
        revisiAction={noopAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Lihat Detail/i }));
    const body = document.body;
    expect(body.textContent).toMatch(/Matematika/);
    expect(body.textContent).toMatch(/Bahasa Indonesia/);
    expect(body.textContent).toMatch(/92\.5/);
    expect(body.textContent).toMatch(/Predikat/i);
  });

  it("renders kehadiran labels (Sakit/Izin/Alpa) + catatan_wali_kelas when expanded", () => {
    render(
      <DetailEraport
        eraport={eraport()}
        revisiList={[]}
        bolehRevisi={false}
        revisiAction={noopAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Lihat Detail/i }));
    const body = document.body;
    expect(body.textContent).toMatch(/Sakit/i);
    expect(body.textContent).toMatch(/Izin/i);
    expect(body.textContent).toMatch(/Alpa/i);
    expect(body.textContent).toMatch(/Menunjukkan kemajuan yang konsisten/);
  });

  it("does NOT render a <pre> element in the expanded detail body", () => {
    const { container } = render(
      <DetailEraport
        eraport={eraport()}
        revisiList={[]}
        bolehRevisi={false}
        revisiAction={noopAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Lihat Detail/i }));
    expect(container.querySelector("pre")).toBeNull();
  });

  it("does NOT leak raw JSON syntax (quoted keys, braces) into the expanded body text", () => {
    const { container } = render(
      <DetailEraport
        eraport={eraport()}
        revisiList={[]}
        bolehRevisi={false}
        revisiAction={noopAction}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Lihat Detail/i }));
    const teks = container.textContent ?? "";
    // JSON-stringify leaks `"peserta_didik":`, `"nama":`, `{`, `}` — none belong
    // in the structured E-Raport detail view. Parens are fine (ekstrakurikuler
    // text like "Pramuka (Penegak)" may legitimately contain them).
    expect(teks).not.toMatch(/"peserta_didik":/);
    expect(teks).not.toMatch(/"mata_pelajaran":/);
    expect(teks).not.toMatch(/"nama":/);
    expect(teks).not.toMatch(/"catatan_wali_kelas":/);
    expect(teks).not.toMatch(/"kehadiran":/);
    expect(teks).not.toMatch(/[{}]/);
  });
});
