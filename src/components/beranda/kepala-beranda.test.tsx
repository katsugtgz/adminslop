import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KepalaBeranda } from "./kepala-beranda";

describe("KepalaBeranda", () => {
  it("scopes decorative SVG pattern ids per rendered instance", () => {
    const { container } = render(
      <>
        <KepalaBeranda />
        <KepalaBeranda />
      </>
    );

    const patterns = Array.from(container.querySelectorAll("pattern"));
    const patternIds = patterns.map((pattern) => pattern.id);

    expect(new Set(patternIds).size).toBe(patternIds.length);
    for (const rect of container.querySelectorAll("svg rect")) {
      expect(patternIds).toContain(
        rect.getAttribute("fill")?.replace("url(#", "").replace(")", "")
      );
    }
  });
});
