"use client";

/**
 * Mode Offline (#21) — sensitive-action online guard. AC#5: certain actions are
 * too sensitive to queue offline and MUST require a live server round-trip.
 *
 * MVP offline scope (Task 16 / Wave 2 hardening): offline is **read-only by
 * intent**. No tenant-sensitive mutation may be queued in localStorage, and the
 * guard throws before any such mutation is attempted while `!navigator.onLine`.
 * The closed vocabulary below covers all five sensitive categories mandated by
 * the task brief:
 *
 *   • grades      — `simpanNilai`            (Nilai Peserta Didik writes)
 *   • attendance  — `simpanAbsensi`          (Absensi Harian writes)
 *   • roles       — `ubahPeranAkses`         (Keanggotaan `roleSlug` / `peran_akses` writes)
 *   • AI requests — `verifikasiDokumenAi`, `verifikasiDrafAi`
 *   • exports     — `terbitkanEraport`, `buatDokumenCetak`   (eraport / cetak dokumen)
 *
 * Calling `assertOnline(aksi)` with any of these while offline throws an Error
 * whose message starts with `PESAN_BLOK_OFFLINE`. The queue never accepts them.
 *
 * SECURITY: this guard is a CLIENT-SIDE affordance that gives the user a fast,
 * clear Bahasa error before they fill out a form. It is NOT the security
 * boundary — the server-side endpoints re-check connectivity implicitly by
 * being reachable, and they enforce their own authz + RLS (identity doc §12,
 * §13). A determined client can strip the guard; the server still won't have
 * queued the action because there IS no offline queue for sensitive actions.
 * The guard exists so honest users get immediate feedback.
 */

/**
 * The exact Bahasa user-facing string the guard throws when a sensitive
 * mutation is attempted offline. Surface this verbatim in toasts / inline
 * validation. The spec asserts `message contains Tidak dapat menyimpan saat
 * offline`; callers MUST NOT reword it.
 */
export const PESAN_BLOK_OFFLINE = "Tidak dapat menyimpan saat offline";

/**
 * The closed vocabulary of action labels that require an active connection.
 * Each is a Bahasa-flavored slug the UI passes when invoking the guard.
 * Mirrored here so tests can iterate the closed set. **Adding a slug is a
 * scope change** — update `src/lib/offline/README.md` in the same commit.
 */
export const AKSI_SENSITIF = [
  // grades (Nilai Peserta Didik)
  "simpanNilai",
  // attendance (Absensi Harian)
  "simpanAbsensi",
  // roles (Keanggotaan roleSlug / peran_akses)
  "ubahPeranAkses",
  // AI requests
  "verifikasiDokumenAi",
  "verifikasiDrafAi",
  // exports (eraport / cetak)
  "terbitkanEraport",
  "buatDokumenCetak",
] as const;

/** Readonly tuple type of the sensitive action labels. */
export type AksiSensitif = (typeof AKSI_SENSITIF)[number];

/** True iff the browser reports an active network connection. */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * AC#5 / Task 16: throw a Bahasa Error when `!navigator.onLine`. Called by
 * every sensitive client entrypoint before it would otherwise submit. The
 * thrown Error's message starts with {@linkcode PESAN_BLOK_OFFLINE} and names
 * the action for debug context; the caller surfaces it via toast / inline
 * validation. When online, this is a no-op (the action proceeds).
 *
 * The check is unconditional on the action label — *any* caller that invokes
 * the guard is affirming "this mutation is sensitive; block it offline". The
 * {@linkcode AKSI_SENSITIF} vocabulary exists for the {@linkcode bolehAksiSensitif}
 * predicate (button-greying), not for this throw.
 *
 * @example
 *   assertOnline("simpanNilai");
 *   await simpanNilaiAction(formData); // only reached when online
 */
export function assertOnline(aksi: string): void {
  if (!isOnline()) {
    throw new Error(`${PESAN_BLOK_OFFLINE} (${aksi}).`);
  }
}

/**
 * Convenience: predicate form for UI affordances that want to grey out a button
 * instead of throwing. Returns `true` only when BOTH (a) the browser is online
 * AND (b) `aksi` is a member of the closed {@linkcode AKSI_SENSITIF} vocabulary.
 * Returns `false` for non-sensitive slugs regardless of connectivity (a
 * non-sensitive action does not route through this gate).
 */
export function bolehAksiSensitif(aksi: string): boolean {
  return isOnline() && (AKSI_SENSITIF as readonly string[]).includes(aksi);
}
