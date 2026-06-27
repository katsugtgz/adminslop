import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

import BerandaPage from "./page";

/**
 * ISSUE-002 regression — the landing (BerandaPage) used to spam the React
 * "Each child in a list should have a unique key prop" warning on server
 * render. This test renders the page and asserts no such warning fires.
 *
 * The spy also records the offending component stack so a regression
 * points straight at the culprit list.
 */
describe("BerandaPage (landing) — no React key-prop warnings", () => {
  let keyWarnings: string[];
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    keyWarnings = [];
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        const text = args.map(String).join(" ");
        if (/unique "key" prop/i.test(text)) {
          keyWarnings.push(text);
        }
      });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders without any React list-key warnings", () => {
    render(<BerandaPage />);

    expect(keyWarnings, keyWarnings.join("\n---\n")).toHaveLength(0);
  });
});
