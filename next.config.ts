import type { NextConfig } from "next";

/**
 * Security headers + Content-Security-Policy (report-only).
 *
 * CSP is Report-Only on purpose: AuthKit redirects to WorkOS-hosted sign-in
 * (`api.workos.com` → `auth.workos.com`) and we want to observe violations
 * before enforcing. The WorkOS domains are allowlisted in connect-src /
 * form-action / img-src so the auth round-trip does not generate noise.
 *
 * To move to enforcement later: add a nonce middleware (Next.js App Router
 * supports `headers()` nonce via `generateNonce`) and drop 'unsafe-inline'
 * from script-src. Until then, Report-Only lets us collect data without
 * breaking the sign-in flow.
 */
const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // camera=(self) reserves the camera for same-origin use (future QR / absensi).
  {
    key: "Permissions-Policy",
    value: "camera=(self)",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      // Next.js injects inline scripts/styles; tighten to nonce-based later.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // Logos are user-provided arbitrary HTTPS URLs rendered with <Image unoptimized>.
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      // AuthKit sign-in round-trip: api.workos.com (authorize) → auth.workos.com (hosted UI).
      "connect-src 'self' https://api.workos.com https://auth.workos.com",
      "form-action 'self' https://api.workos.com https://auth.workos.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    // No remotePatterns needed: all remote logos use <Image unoptimized /> in
    // src/components/cetak/pratinjau-eraport.tsx, which bypasses /_next/image.
    // If a future image drops `unoptimized`, add the domain here.
  },
};

export default nextConfig;
