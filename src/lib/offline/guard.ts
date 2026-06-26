"use client";

/**
 * Mode Offline (#21) — sensitive-action online guard. AC#5: certain actions are
 * too sensitive to queue offline and MUST require a live server round-trip.
 * These are: eraport:terbit (publish a report card), cetak:buat (create a
 * print document), and the AI verification actions (verifikasiDokumenAi,
 * verifikasiDrafAi). Calling any of these while offline throws — the queue
 * never accepts them.
 *
 * SECURITY: this guard is a CLIENT-SIDE affordance that gives the user a fast,
 * clear Bahasa error before they fill out a form. It is NOT the security
 * boundary — the server-side endpoints re-check connectivity implicitly by
 * being reachable, and they enforce their own authz. A determined client can
 * strip the guard; the server still won't have queued the action because there
 * IS no offline queue for sensitive actions. The guard exists so honest users
 * get immediate feedback.
 */

/**
 * The closed vocabulary of action labels that require an active connection.
 * Each is a Bahasa string the UI passes when invoking the guard. Mirrored by
 * `AKSI_SENSITIF` below so tests can iterate the closed set.
 */
export const AKSI_SENSITIF = [
  "terbitkanEraport",
  "buatDokumenCetak",
  "verifikasiDokumenAi",
  "verifikasiDrafAi",
] as const;

/** Readonly tuple type of the sensitive action labels. */
export type AksiSensitif = (typeof AKSI_SENSITIF)[number];

/** True iff the browser reports an active network connection. */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/**
 * AC#5: throw a Bahasa Error when `!navigator.onLine`. Called by every
 * sensitive client entrypoint before it would otherwise submit. The thrown
 * Error's message is the user-facing string; the caller surfaces it via toast /
 * inline validation. When online, this is a no-op (the action proceeds).
 *
 * @example
 *   assertOnline("terbitkanEraport");
 *   await terbitkanEraportAction(formData); // only reached when online
 */
export function assertOnline(aksi: string): void {
  if (!isOnline()) {
    throw new Error(
      `Tindakan ini memerlukan koneksi internet (${aksi}).`
    );
  }
}

/**
 * Convenience: predicate form for UI affordances that want to grey out a button
 * instead of throwing. Returns `false` for sensitive actions while offline.
 */
export function bolehAksiSensitif(aksi: string): boolean {
  return isOnline() && (AKSI_SENSITIF as readonly string[]).includes(aksi);
}
