/**
 * Mode Offline (#21) — client-side draft types.
 *
 * AC#1: Nilai Peserta Didik + Absensi Harian drafts captured locally while
 * offline. AC#2: drafts live in client localStorage, NOT a server table. AC#4:
 * each draft carries the `versi` the client last saw; the sync endpoint uses
 * it for optimistic-concurrency conflict detection (no silent overwrite).
 *
 * These types are pure (no I/O) so they are imported freely from both client
 * and server code (route handler, tests).
 */

/**
 * A pending Nilai Peserta Didik edit. `id` is a client-generated draft id
 * (UUID-ish); `versi` is the server row version the client last observed (1
 * for brand-new rows). The (penilaianId, pesertaDidikId) pair is the server
 * natural key used by the sync endpoint to resolve the target row.
 */
export interface DraftNilai {
  readonly id: string;
  readonly penilaianId: string;
  readonly pesertaDidikId: string;
  readonly nilai: number;
  readonly catatan?: string;
  readonly versi: number;
  readonly dibuatPada: string;
}

/**
 * A pending Absensi Harian edit. `versi` is the server row version the client
 * last observed (1 for new). The (pesertaDidikId, tanggal) pair is the server
 * natural key.
 */
export interface DraftAbsensi {
  readonly id: string;
  readonly pesertaDidikId: string;
  readonly rombonganBelajarId: string;
  readonly tanggal: string;
  readonly status: string;
  readonly catatan?: string;
  readonly metode: string;
  readonly versi: number;
  readonly dibuatPada: string;
}

export type DraftItem = DraftNilai | DraftAbsensi;

/** Tag identifying which natural-key draft family an item belongs to. */
export type TipeDraft = "nilai" | "absensi";

/** Discriminator the sync endpoint reads to route a draft to the right table. */
export interface AmplopDraft {
  readonly tipe: TipeDraft;
  readonly draft: DraftItem;
}

/** Lifecycle of a draft as observed by the client store. */
export type StatusSinkronisasi = "menunggu" | "tersinkron" | "konflik";

/**
 * A draft plus its sync status. `error` is present only on `konflik`, carrying
 * a human-readable Bahasa message (e.g. the server's current versi).
 */
export interface ItemSinkronisasi {
  readonly draft: DraftItem;
  readonly status: StatusSinkronisasi;
  readonly error?: string;
}

/** Shape returned by the sync endpoint (`/api/sinkronisasi`). */
export type ResponsSinkronisasi =
  | { readonly status: "ok"; readonly versi: number }
  | { readonly status: "konflik"; readonly versi: number }
  | { readonly status: "error"; readonly pesan: string };

/** Aggregate result of one `syncSekarang()` pass. Mutable so callers can accumulate. */
export interface HasilSinkronisasi {
  berhasil: number;
  gagal: number;
  konflik: number;
}

/** Input to `simpanDraftNilai` — caller supplies domain fields, store fills id + dibuatPada. */
export type InputDraftNilai = Omit<DraftNilai, "id" | "dibuatPada">;

/** Input to `simpanDraftAbsensi` — caller supplies domain fields, store fills id + dibuatPada. */
export type InputDraftAbsensi = Omit<DraftAbsensi, "id" | "dibuatPada">;
