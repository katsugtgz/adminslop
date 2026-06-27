import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import BerandaPage from "./page";

/**
 * Landing (BerandaPage) smoke + structure tests.
 *
 * NOTE on ISSUE-002 (React "unique key prop" warning):
 * The original offender — `<TextStagger lines={[ <>…</> ]} />`, an unkeyed
 * array-literal fragment passed as a prop — only trips React's
 * `warnForMissingKey` inside the RSC *flight serializer*
 * (`react-server-dom-webpack`). It does NOT fire under `react-dom/server`
 * `renderToString` nor under jsdom client rendering (verified: both report
 * zero warnings even with the bug present). It therefore cannot be asserted
 * by a Vitest unit test in this repo — the regression guard lives in the
 * agent-browser dogfood harness, which checks the browser/server console for
 * `unique "key"` after a fresh `/` load.
 *
 * What we *can* lock in here is that the landing renders its hero and module
 * surface without throwing and that the fixed `TextStagger` usage still
 * produces the brand headline.
 */
describe("BerandaPage (landing)", () => {
  it("renders the hero brand headline and primary CTA", () => {
    render(<BerandaPage />);

    // The TextStagger hero renders the brand name across its line(s).
    expect(
      screen.getByRole("heading", { level: 1, name: /eduadmin pro/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /masuk ke dashboard/i }),
    ).toBeInTheDocument();
  });

  it("renders every MVP module as a card with a dashboard link", () => {
    render(<BerandaPage />);

    // MVP_MODULES has 7 entries; each card exposes an aria-label "Buka <nama>".
    const moduleLinks = screen.getAllByRole("link", { name: /^buka /i });
    expect(moduleLinks).toHaveLength(7);
    expect(moduleLinks[0]).toHaveAttribute("href", "/dashboard");
  });
});
