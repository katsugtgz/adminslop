import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import PanduanPage from "./page";

/**
 * ISSUE-005 regression — /panduan is the destination of the hero "Tur Awal"
 * CTA and the top/bottom nav "Panduan Penggunaan" link. It used to read as an
 * unfinished stub, with hero copy literally deferring its own content:
 * "Konten lengkap akan ditambahkan ketika modul mulai aktif."
 *
 * A user who follows the primary onboarding path must land on a page that is
 * useful *now*, not a promise of future content. The page should present the
 * real quick-start steps in present tense and route deeper questions to the
 * Pusat Bantuan.
 */
describe("PanduanPage (Tur Awal) — usable onboarding, not a deferred stub", () => {
  it("does not defer its own content to future work", () => {
    const { container } = render(<PanduanPage />);
    const text = container.textContent ?? "";

    // The old placeholder phrasing must be gone in every form.
    expect(text).not.toMatch(/akan ditambahkan/i);
    expect(text).not.toMatch(/ketika modul (mulai )?aktif/i);
    expect(text).not.toMatch(/coming soon|soon/i);
  });

  it("presents the quick-start steps as a numbered onboarding sequence", () => {
    render(<PanduanPage />);

    // Each onboarding step renders as a list item with a two-digit index.
    const steps = screen.getAllByRole("listitem");
    expect(steps.length).toBeGreaterThanOrEqual(3);

    // The core MVP onboarding arc must be covered: sign in, pick the active
    // Satuan Pendidikan, then manage Peserta Didik / Nilai.
    const body = document.body.textContent ?? "";
    expect(body).toMatch(/masuk/i);
    expect(body).toMatch(/Satuan Pendidikan/i);
    expect(body).toMatch(/Peserta Didik/i);
  });

  it("routes deeper questions to the Pusat Bantuan", () => {
    render(<PanduanPage />);
    // Both the hero CTA and the footer link point to /bantuan.
    const bantuanLinks = screen.getAllByRole("link", {
      name: /pusat bantuan/i,
    });
    expect(bantuanLinks.length).toBeGreaterThanOrEqual(1);
    bantuanLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/bantuan");
    });
  });
});
