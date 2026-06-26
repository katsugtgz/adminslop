/**
 * Shared types for the absensi component surface. The `StatusKehadiran` +
 * `MetodeInput` unions mirror the schema CHECK constraints; they live here so
 * the page + form + recap components share ONE definition.
 */
import type {
  MetodeInput,
  StatusKehadiran,
} from "@/db/queries/absensi";

export type { MetodeInput, StatusKehadiran };

/**
 * Existing absensi row for a (rombonganBelajar, tanggal, peserta_didik) — used
 * to prefill the form. Carries the row `id` so an existing row posts to
 * `ubahAbsensiAction` instead of `catatAbsensiAction`.
 */
export interface AbsensiExisting {
  readonly id: string;
  readonly statusKehadiran: StatusKehadiran;
  readonly catatan: string | null;
  readonly metodeInput: MetodeInput;
  readonly sumberQr: string | null;
}

/**
 * A server action reference — `(formData) => Promise<void>`. Plain server
 * forms post directly to this; no client hooks, no client validation (the T5
 * actions are the authoritative gate — identity doc §12).
 */
export type ServerAksi = (formData: FormData) => Promise<void> | void;
