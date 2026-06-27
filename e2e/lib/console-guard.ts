import type { Page } from "@playwright/test";

/**
 * Console-error capture guard.
 *
 * A tracer bullet must fail loudly on `console.error` and uncaught
 * `pageerror`s — they are the earliest signal of a broken server render, a
 * failed data fetch, or an RLS/tenant-scope leak. Attach one `ConsoleGuard`
 * per page, then assert `expectNoErrors()` at the end of the test.
 *
 * `ALLOW_PATTERNS` is deliberately EMPTY so the default is strict (fails on any
 * console.error). Extend it ONLY with patterns that are proven dev-mode noise
 * and carry a comment explaining why. Never allowlist product error text.
 */
const ALLOW_PATTERNS: RegExp[] = [
  // (intentionally empty — add proven Next.js/WorkOS dev noise here with a
  // justification comment if a flaky failure is traced to a known benign
  // message.)
];

export class ConsoleGuard {
  private readonly errors: string[] = [];

  constructor(private readonly page: Page) {}

  /** Subscribe to `console` + `pageerror`. Call once per page, early in the test. */
  attach(): this {
    this.page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (ALLOW_PATTERNS.some((re) => re.test(text))) return;
      this.errors.push(`[console.error] ${text}`);
    });
    this.page.on("pageerror", (err) => {
      this.errors.push(`[pageerror] ${err.message}`);
    });
    return this;
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /** Human-readable block for embedding in an assertion/throw message. */
  format(): string {
    if (this.errors.length === 0) return "(no console errors)";
    return this.errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
  }

  get count(): number {
    return this.errors.length;
  }
}
