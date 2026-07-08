import { test, expect } from "@playwright/test";

/**
 * CI smoke spec — minimal, no-auth, no-secrets.
 *
 * Runs in the CI `e2e-smoke` job (parallel with `build-and-test`). These
 * tests exercise only unauthenticated behaviour so they need no WorkOS
 * sandbox credentials. The auth-gated tracer in `mvp-tracer.spec.ts` skips
 * gracefully when `E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` are absent (see its
 * header), so the full `npm run e2e` suite stays green in CI without secrets.
 *
 * What this proves:
 *  1. `/health` responds 200 — the Next.js server is up and serving.
 *  2. `/dashboard` renders the auth gate (`PembatasanAkses`) when
 *     unauthenticated — `getActiveTenantContext()` returns `status: "denied"`
 *     with `authenticated: false`, and the page renders the access-restricted
 *     component instead of dashboard data. The AuthKit middleware defaults to
 *     `middlewareAuth.enabled = false`, so the gate is page-level, not a 302.
 */
test("smoke: /health responds 200", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.status(), "/health must respond 200").toBe(200);
  const body = await res.text();
  expect(body, "/health body must contain status ok").toContain('"status":"ok"');
});

test("smoke: /dashboard shows auth gate when unauthenticated", async ({
  request,
}) => {
  const res = await request.get("/dashboard");
  expect(res.status(), "/dashboard must respond 200 (page-level auth gate)").toBe(200);

  const html = await res.text();
  // PembatasanAkses renders "Pembatasan Akses" heading + "Anda perlu masuk"
  // message when authenticated === false (src/components/pembatasan-akses.tsx).
  expect(
    html,
    "unauthenticated /dashboard must show the access-restricted gate",
  ).toContain("Pembatasan Akses");
  expect(
    html,
    "unauthenticated /dashboard must prompt the user to sign in",
  ).toContain("Anda perlu masuk");
});
