import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * AC#4 — Print visual checks. The full cetak-pratinjau components live on the
 * #14 branch (PR #37) and are intentionally NOT on feat/22. This structural
 * test guards the print-CSS foundation that those components depend on:
 * `@page { size: ... }` for paper-size selection and a `@media print` block
 * that suppresses app chrome so only document content reaches paper/PDF.
 *
 * Visual diff / golden capture is verified on the #14 branch (see PR #37).
 */
const cssSource = readFileSync(
  path.resolve(__dirname, "globals.css"),
  "utf8",
);

describe("globals.css — print support (AC#4)", () => {
  it("declares @page with size A4 (Indonesian default; F4/folio is a common alternative)", () => {
    expect(cssSource).toMatch(/@page\s*{[^}]*size:\s*A4[^}]*}/m);
  });

  it("declares a @media print block", () => {
    expect(cssSource).toMatch(/@media\s+print\s*{/);
  });

  it("hides header and footer in print output (no app chrome on paper)", () => {
    // Both selectors must be present somewhere in the file (the print block
    // uses them to suppress chrome).
    expect(cssSource).toMatch(/\bheader\b/);
    expect(cssSource).toMatch(/\bfooter\b/);
    expect(cssSource).toMatch(/display:\s*none\s*!important/);
  });

  it("exposes a .no-print utility class for components to opt out of paper output", () => {
    expect(cssSource).toMatch(/\.no-print\s*{/);
  });
});
