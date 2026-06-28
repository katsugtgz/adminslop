import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — MVP tracer bullet (Plan Task 9, Wave 1).
 *
 * Scope is intentionally minimal: a single chromium project and one tracer
 * spec. Do NOT expand this into a full matrix (firefox/webkit) or broad E2E
 * suite — that is deferred. The webServer reuses an already-running dev server
 * (`reuseExistingServer: true`) so `npm run e2e` is fast locally and only
 * boots `npm run dev` when nothing is listening.
 *
 * Readiness probe: `/health` (not `/`) because `/` sits inside the
 * `authkitMiddleware()` matcher (`src/middleware.ts`) and 307-redirects to the
 * WorkOS-hosted sign-in page; `/health` is an unauthenticated local JSON
 * endpoint and is the cleanest "server is up" signal.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  expect: {
    // Dev-mode first paint can lag behind `npm run dev` HMR; keep tolerant.
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/health",
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
