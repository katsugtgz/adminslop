import { test, expect } from "@playwright/test";

import { ConsoleGuard } from "./lib/console-guard";

/**
 * MVP tracer bullet — Plan Task 9 (Wave 1).
 *
 * Vertical slice: authenticate → `/dashboard` → tenant selection →
 * `/dashboard/peserta-didik` read flow. Single spec, single chromium project.
 * Do NOT add more specs here without owner sign-off; broad E2E is deferred.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUTH FIXTURE DECISION (read before changing)
 * ─────────────────────────────────────────────────────────────────────────
 * Auth is WorkOS AuthKit: `src/middleware.ts` (`authkitMiddleware()`) gates
 * `/`, `/dashboard/:path*`, and seals an opaque httpOnly session cookie bound
 * by `WORKOS_COOKIE_PASSWORD` (identity-and-access.md §7, §10). The fixture
 * options considered:
 *
 *   (a) Forge the sealed session cookie from the test → REJECTED.
 *       `@workos-inc/authkit-nextjs@^4` exposes no public "mint test cookie"
 *       helper; the sealed-cookie format is an SDK internal. Reverse-engineering
 *       it would be brittle and violates the workos-authkit skill rule #3
 *       ("do not reimplement session sealing").
 *
 *   (b) Real WorkOS sandbox user via the hosted sign-in UI → CHOSEN.
 *       Most realistic: it exercises the actual middleware → WorkOS redirect →
 *       callback → session-seal path. Credentials are supplied via
 *       `E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` env vars ONLY (read from
 *       `process.env`, never hardcoded, never committed). No WorkOS secret
 *       (`WORKOS_API_KEY` / `WORKOS_COOKIE_PASSWORD`) is needed in the test.
 *
 *   (c) Bypass the middleware for a test route → REJECTED.
 *       Would require editing `src/middleware.ts`, which is out of scope for
 *       this task and would violate identity-and-access.md §11 ("never remove
 *       the auth matcher").
 *
 * Because option (b) needs a provisioned sandbox user + Keanggotaan that an
 * autonomous session cannot provision, the full tracer is gated behind the two
 * env vars: when they are absent it `test.skip`s with the checklist below, so
 * the spec still EXITS 0 (skips are non-failing). An always-green `smoke` test
 * runs unconditionally and proves the Playwright ↔ webServer ↔ app wiring.
 *
 * ── HUMAN CHECKPOINT to enable the full tracer ──────────────────────────
 *   1. In the WorkOS sandbox environment, create (or pick) a test Pengguna.
 *   2. Ensure the Pengguna has ≥1 active Keanggotaan Satuan Pendidikan (WorkOS
 *      OrganizationMembership) with a recognized roleSlug (guru /
 *      wali_kelas / kepala_sekolah / admin_satuan_pendidikan), OR set
 *      `DEV_MEMBERSHIP_ALL=true` in `.env` so the dev membership shim grants
 *      membership of every seeded Satuan Pendidikan (identity doc §5; src/lib/
 *      auth/membership.ts).
 *   3. `export E2E_AUTH_EMAIL=…` and `export E2E_AUTH_PASSWORD=…` in your
 *      host shell (NEVER commit them; keep out of `.env.example`).
 *   4. `npm run e2e:tracer`. Adjust the WorkOS hosted-form selectors below if
 *      your sandbox auth config differs (Passkey/Magic-Auth tabs, etc.).
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Tenant selection note: there is no `[data-testid="tenant-switcher"]` element.
 * The chooser (`src/components/pilih-satuan-pendidikan.tsx`) renders inline on
 * `/dashboard` when `getActiveTenantContext()` resolves to `status === "choose"`
 * (multiple Keanggotaan, none active). The tracer drives that real chooser.
 */

const E2E_AUTH_EMAIL = process.env.E2E_AUTH_EMAIL;
const E2E_AUTH_PASSWORD = process.env.E2E_AUTH_PASSWORD;

const EVIDENCE_DIR = ".omo/evidence";

/**
 * Smoke test — always runs and is always green when the app is up.
 *
 * Purpose: prove the Playwright ↔ webServer (`npm run dev`) ↔ Next.js wiring
 * works, and produce evidence artifacts (`task-9-smoke.png`,
 * `task-9-console-error.log`) even when the gated tracer is skipped. This is
 * what makes the spec exit 0 locally regardless of auth provisioning.
 */
test("smoke: dev server /health is up (always-green wiring proof)", async ({
  page,
}) => {
  const guard = new ConsoleGuard(page).attach();

  const res = await page.goto("/health");
  expect(res?.status(), "/health must respond 200").toBe(200);

  // Route returns JSON: {"status":"ok","service":"eduadmin-pro-premium"}
  await expect(page.locator("body")).toContainText('"status":"ok"');

  // Tracer-bullet invariant: no console errors on a clean public route.
  expect(
    guard.count,
    `Unexpected console errors on /health:\n${guard.format()}`,
  ).toBe(0);

  // Evidence: capture so the deliverable file exists.
  await page.screenshot({ path: `${EVIDENCE_DIR}/task-9-smoke.png` });
});

/**
 * Key-prop smoke — fails on any React "unique key prop" console.error.
 * Public routes only; auth-gated routes (`/`, `/dashboard/*`) redirect to
 * WorkOS before React hydrates, so their trees need credentials.
 */
test("smoke: public list-rendering pages have no React key-prop warnings", async ({
  page,
}) => {
  const guard = new ConsoleGuard(page).attach();

  for (const path of ["/panduan", "/bantuan"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  expect(
    guard.hasKeyPropWarnings,
    `React key-prop warnings on public list pages:\n${guard.formatKeyPropWarnings()}`,
  ).toBe(false);
});

/**
 * Full vertical tracer — gated behind provisioned sandbox credentials.
 *
 * Skipped unless `E2E_AUTH_EMAIL` + `E2E_AUTH_PASSWORD` are set (see header).
 * When enabled, it walks the real WorkOS AuthKit flow end to end.
 */
test("tracer: authenticated Pengguna reads Peserta Didik roster", async ({
  page,
}) => {
  test.skip(
    !E2E_AUTH_EMAIL || !E2E_AUTH_PASSWORD,
    "Set E2E_AUTH_EMAIL + E2E_AUTH_PASSWORD (provisioned WorkOS sandbox user) "
      + "to run the full tracer. See the human-checkpoint checklist in the "
      + "spec header.",
  );

  const guard = new ConsoleGuard(page).attach();
  const email = E2E_AUTH_EMAIL as string;
  const password = E2E_AUTH_PASSWORD as string;

  // Step 1 — authenticate. This app uses CLIENT-SIDE auth: the default
  // `authkitMiddleware()` does NOT auto-redirect unauthenticated requests
  // (middlewareAuth.enabled is false). Navigating to /dashboard renders the
  // PembatasanAkses gate; its "Masuk" button calls
  // `refreshAuth({ ensureSignedIn: true })` (AuthKitProvider client hook),
  // which redirects the browser to the WorkOS-hosted sign-in page. After a
  // successful sign-in WorkOS redirects back to the callback, which seals the
  // session cookie and returns to /dashboard.
  await page.goto("/dashboard");

  // Click the client-side "Masuk" trigger to start the WorkOS redirect.
  // The button's accessible name is "Masuk ke EduAdmin Pro Premium"
  // (aria-label on TombolMasuk); a substring match covers both the nav and
  // card instances — either triggers the same refreshAuth redirect.
  await page.getByRole("button", { name: /Masuk/ }).first().click();

  // WorkOS-hosted sign-in form (auth.workos.com). The sandbox uses an
  // email-first two-step flow: enter email → Continue → password step.
  // Selectors are intentionally tolerant; adjust if your sandbox auth surface
  // differs (e.g. single-form Password/Passkey tabs).
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /continue/i }).click();

  // Second step: password entry appears after the email is submitted.
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /(sign in|masuk|continue)/i }).click();

  // Step 2 — after sign-in WorkOS redirects to the callback, which seals the
  // session cookie and returns to the app root ("/"). The refreshAuth flow
  // lands on "/" (Beranda), not the original deep link, so navigate to
  // /dashboard explicitly.
  await page.waitForURL("http://localhost:3000/", { timeout: 30_000 });
  await page.goto("/dashboard");

  // Step 3 — tenant selection. If the active-tenant resolution is "choose"
  // (multiple Keanggotaan, none active), the PilihSatuanPendidikan chooser
  // renders inline. Pick the first one; its server action re-validates the
  // membership server-side (identity doc §12) before binding the tenant.
  const chooser = page.getByRole("heading", {
    level: 1,
    name: "Pilih Satuan Pendidikan",
  });
  if (await chooser.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await page
      .getByRole("button", { name: /Pilih .+ sebagai Satuan Pendidikan/i })
      .first()
      .click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
  }

  // Step 4 — navigate to the Peserta Didik read page (tenant-scoped roster).
  await page.goto("/dashboard/peserta-didik");

  // Step 5 — assert the Bahasa heading rendered (server read succeeded).
  await expect(
    page.getByRole("heading", { level: 1, name: "Peserta Didik" }),
  ).toBeVisible({ timeout: 15_000 });

  // Tracer-bullet invariant: the vertical slice logged zero console errors.
  expect(
    guard.count,
    `Unexpected console errors along the tracer path:\n${guard.format()}`,
  ).toBe(0);

  await page.screenshot({
    path: `${EVIDENCE_DIR}/task-9-tracer.png`,
    fullPage: true,
  });
});
