/**
 * QR Pemindai (QR Scanner) — pure helpers for the deferred live-camera
 * scanner UI. Task #15 / Wave 2 guardrail slice.
 *
 * STATUS (Task #15): the live camera scanner (`getUserMedia` + a QR decoder
 * library such as `nimiq-modules/qr-scanner` or `jsQR`) is **deferred to
 * Post-MVP** — Task MUST-NOT: "Do NOT add new QR library dep without owner
 * approval". No scanner library is in `package.json`; only the data-layer
 * plumbing (`absensi_harian.metode_input='qr'`, `sumber_qr`) ships in MVP.
 *
 * Even with the UI deferred, TWO contracts must be locked down NOW so a
 * future agent wiring the scanner cannot drift on them:
 *
 *   1. The Bahasa error-message mapping for `getUserMedia` rejections
 *      (the camera-denied fallback). The future client component imports
 *      {@linkcode terjemahkanErrorKamera} and renders the returned `pesan`
 *      alongside the existing manual entry path. The contract is fixed
 *      here so the UI cannot fall back to English or strand the user
 *      without a manual path.
 *
 *   2. The deferred-status Bahasa tooltip
 *      {@linkcode KETERANGAN_PEMANDAI_QR_DITUNDA} — the exact string
 *      `Pemindai QR belum tersedia (Post-MVP)` that any pre-scanner
 *      "Pindai QR" affordance MUST surface while disabled. This keeps
 *      manual entry the primary path until the scanner library is
 *      approved + installed.
 *
 * SECURITY / DESIGN: this module is PURE — no React, no DOM access, no
 * `getUserMedia` call. The future client component performs the camera
 * access; this module only translates the rejection. Pure = unit-testable
 * today without a browser camera, satisfying the "vitest unit test on the
 * error handler logic" requirement when the Playwright auth fixture is
 * unavailable.
 *
 * Cross-tenant protection is NOT in this module — it lives at the server
 * action (`src/app/dashboard/absensi/actions.ts`) which already enforces
 * `withTenant(db, akses.membership.orgId, …)` regardless of any
 * `sumberQr` token the client supplies (identity doc §13). A QR token
 * minted by tenant B, posted to tenant A's action, simply resolves to a
 * tenant-A row carrying a meaningless string — never a leak.
 *
 * @see CONTEXT.md "Absensi QR" — capture method only; never replaces
 *   Status Kehadiran or the AC#3 correctable rule.
 */

/**
 * Bahasa tooltip rendered on any disabled "Pindai QR" affordance while the
 * live-camera scanner is still Post-MVP. The string is exported so tests
 * lock the phrasing; any UI element wired before the scanner ships MUST
 * surface this verbatim. Manual entry remains the primary path.
 */
export const KETERANGAN_PEMANDAI_QR_DITUNDA =
  "Pemindai QR belum tersedia (Post-MVP)" as const;

/**
 * Stable machine code for the camera-error branch. Used for telemetry /
 * future i18n keys; the user only ever sees {@linkcode PesanErrorKamera.pesan}.
 */
export type KodeErrorKamera =
  | "IZIN_DITOLAK"
  | "TIDAK_ADA_KAMERA"
  | "KAMERA_SIBUK"
  | "LAINNYA";

/**
 * Bahasa user-facing result of translating a `getUserMedia` rejection. The
 * future scanner UI renders `pesan` next to the existing manual entry path
 * (the planned `[data-testid="manual-qr-input"]` element on the denied
 * branch). Every `pesan` ends with manual-fallback guidance so the user is
 * never stranded.
 */
export interface PesanErrorKamera {
  /** Bahasa user-facing message — ALWAYS mentions the manual fallback. */
  readonly pesan: string;
  /** Stable machine code; never shown to the user directly. */
  readonly kode: KodeErrorKamera;
}

/**
 * Translate a `getUserMedia` rejection (DOMException-shaped) to a
 * {@linkcode PesanErrorKamera}. Pure — never throws, even for non-Error
 * inputs (the future UI may pass `undefined` from a malformed catch).
 *
 * CONTRACT (locked before the scanner UI lands):
 *
 *   | DOMException name            | kode            | user message               |
 *   | ---------------------------- | --------------- | -------------------------- |
 *   | `NotAllowedError`            | `IZIN_DITOLAK`  | Izin kamera ditolak…       |
 *   | `SecurityError` (http origin)| `IZIN_DITOLAK`  | Izin kamera ditolak…       |
 *   | `NotFoundError`              | `TIDAK_ADA_KAMERA` | Kamera tidak ditemukan… |
 *   | `DevicesNotFoundError`       | `TIDAK_ADA_KAMERA` | (legacy alias)          |
 *   | `NotReadableError`           | `KAMERA_SIBUK`  | Kamera sedang digunakan…   |
 *   | anything else                | `LAINNYA`       | Tidak dapat mengakses…     |
 *
 * Every branch ends with "input manual" guidance — Task #15 MUST-DO: the
 * camera-denied state MUST provide a manual fallback in Bahasa.
 *
 * The future scanner UI uses this roughly as:
 *
 * ```ts
 * try {
 *   stream = await navigator.mediaDevices.getUserMedia({ video: true });
 *   // …decode QR frames…
 * } catch (err) {
 *   const { pesan } = terjemahkanErrorKamera(err);
 *   setDeniedMessage(pesan); // rendered next to the manual input
 * }
 * ```
 */
export function terjemahkanErrorKamera(error: unknown): PesanErrorKamera {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        kode: "IZIN_DITOLAK",
        pesan:
          "Izin kamera ditolak. Gunakan input manual untuk mencatat Absensi.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        kode: "TIDAK_ADA_KAMERA",
        pesan: "Kamera tidak ditemukan. Gunakan input manual.",
      };
    case "NotReadableError":
      return {
        kode: "KAMERA_SIBUK",
        pesan:
          "Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut atau gunakan input manual.",
      };
    default:
      return {
        kode: "LAINNYA",
        pesan: "Tidak dapat mengakses kamera. Gunakan input manual.",
      };
  }
}
