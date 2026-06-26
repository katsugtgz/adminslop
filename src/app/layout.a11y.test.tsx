import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";

import { vi } from "vitest";

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ user: null, loading: false, refreshAuth: vi.fn() }),
  AuthKitProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/app/auth/actions", () => ({
  signOutAction: vi.fn(),
  pilihSatuanPendidikanAction: vi.fn(),
}));

import { AppShell } from "@/components/app-shell";

const layoutSource = readFileSync(
  path.resolve(__dirname, "layout.tsx"),
  "utf8",
);

describe("Root layout — A11Y baseline", () => {
  it("declares <html lang=\"id\"> and dir=\"ltr\" for Bahasa Indonesia LTR", () => {
    expect(layoutSource).toMatch(/<html\s+lang=["']id["']\s+dir=["']ltr["']/);
  });

  it("exports a viewport with width=device-width and initialScale=1", () => {
    expect(layoutSource).toMatch(/width:\s*["']device-width["']/);
    expect(layoutSource).toMatch(/initialScale:\s*1\b/);
  });
});

describe("AppShell — skip-link and main-content target", () => {
  it("renders a skip link that jumps to #konten-utama", () => {
    render(
      <AppShell>
        <p>konten</p>
      </AppShell>,
    );
    const skip = screen.getByRole("link", {
      name: /Langsung ke konten/i,
    });
    expect(skip.getAttribute("href")).toBe("#konten-utama");
    // sr-only until focused → keyboard users can tab into it.
    expect(skip.className).toMatch(/sr-only/);
    expect(skip.className).toMatch(/focus:not-sr-only/);
  });

  it("exposes the main wrapper as id=\"konten-utama\" for the skip target", () => {
    const { container } = render(
      <AppShell>
        <p>konten</p>
      </AppShell>,
    );
    const main = container.querySelector("main#konten-utama");
    expect(main).not.toBeNull();
  });
});
