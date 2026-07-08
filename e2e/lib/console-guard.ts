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
  // WorkOS hosted sign-in page (auth.workos.com) ships a
  // Content-Security-Policy-Report-Only header containing
  // 'upgrade-insecure-requests'. Browsers log this as a console.error-level
  // message because the directive is invalid in report-only mode. It is
  // third-party CSP noise — not an app error — and only surfaces on the
  // authenticated tracer path that traverses the WorkOS sign-in domain.
  /Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy/,
];

/**
 * React "unique key prop" warning. Dev-only (stripped in production) but
 * signals real reconciliation bugs — stale state, re-render churn, lost
 * component identity. Matched against full error text to preserve stack-trace
 * context in `keyPropWarnings`.
 */
const KEY_PROP_PATTERN =
  /Each child in (?:a list|an array or iterator) should have a unique "key" prop/;

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

  get keyPropWarnings(): string[] {
    return this.errors.filter((e) => KEY_PROP_PATTERN.test(e));
  }

  get hasKeyPropWarnings(): boolean {
    return this.keyPropWarnings.length > 0;
  }

  formatKeyPropWarnings(): string {
    const warnings = this.keyPropWarnings;
    if (warnings.length === 0) return "(no key-prop warnings)";
    return warnings.map((e, i) => `${i + 1}. ${e}`).join("\n");
  }
}
