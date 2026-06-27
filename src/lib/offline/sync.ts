"use client";

/**
 * Mode Offline (#21) — sync queue. AC#3: on reconnect, pending drafts are
 * submitted to the server. AC#4: when the server's `versi` is newer than the
 * client's, the draft is marked `konflik` and the server row is NOT touched.
 *
 * The queue talks to the API route `/api/sinkronisasi` via `fetch` (mockable in
 * tests). It does NOT import the server actions directly — they are server-only
 * modules (`"use server"`), and the client must stay server-import-free. The
 * route handler performs the authz + versi-aware upsert and returns
 * {@linkcode ResponsSinkronisasi}.
 */

import {
  hapusDraft,
  listDraftPending,
  tandaiKonflik,
} from "./store";
import type {
  AmplopDraft,
  DraftAbsensi,
  DraftItem,
  DraftNilai,
  HasilSinkronisasi,
  ResponsSinkronisasi,
  TipeDraft,
} from "./types";

/** Endpoint that receives a single draft and performs the versi-aware upsert. */
const ENDPOINT_SINKRONISASI = "/api/sinkronisasi";

/**
 * Narrow fetch-like dependency. Declared explicitly (rather than reusing
 * `typeof fetch`) so the sync queue and its tests share one simple, mockable
 * signature — `typeof fetch` has multiple overloads that are awkward to mock
 * precisely. The global `fetch` is structurally assignable to this type.
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Options shared by the sync entrypoints (used to inject a mock in tests). */
export interface OpsiSync {
  readonly fetch?: FetchLike;
}

/** True iff the browser reports an active network connection. */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/** Discriminator: is this draft a Nilai or an Absensi? */
function tipeDariDraft(draft: DraftItem): TipeDraft {
  // DraftAbsensi has `tanggal` + `status`; DraftNilai has `penilaianId` + `nilai`.
  return "penilaianId" in draft ? "nilai" : "absensi";
}

/**
 * Submit ONE draft to the sync endpoint. Returns the server response, or
 * an `error` shape on a non-2xx (the caller counts it as `gagal`). The shape
 * sent to the server is {@linkcode AmplopDraft}.
 */
export async function kirimDraft(
  draft: DraftItem,
  opsi?: OpsiSync
): Promise<ResponsSinkronisasi> {
  const doFetch: FetchLike = opsi?.fetch ?? (fetch as FetchLike);
  const amplop: AmplopDraft = { tipe: tipeDariDraft(draft), draft };
  const res = await doFetch(ENDPOINT_SINKRONISASI, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(amplop),
  });

  if (!res.ok) {
    return {
      status: "error",
      pesan: `HTTP non-2xx: gagal menyinkronkan draft`,
    };
  }
  return (await res.json()) as ResponsSinkronisasi;
}

/**
 * AC#3: flush every pending draft to the server. Iterates the pending list,
 * posts each, and on success removes it from the store. On conflict (AC#4) the
 * draft is marked `konflik` and left in place for the user to resolve. Network
 * errors count as `gagal` and the draft stays `menunggu` for a later retry.
 *
 * No-op when offline (the caller is expected to re-invoke on the `online`
 * event). Returns the aggregate counts.
 */
export async function syncSekarang(opsi?: OpsiSync): Promise<HasilSinkronisasi> {
  const hasil: HasilSinkronisasi = { berhasil: 0, gagal: 0, konflik: 0 };
  if (!isOnline()) return hasil;

  for (const draft of listDraftPending()) {
    const tipe = tipeDariDraft(draft);
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop — drafts are flushed sequentially so the server's per-draft versi-aware upsert stays ordered and progress is observable per item.
      const resp = await kirimDraft(draft, opsi);
      if (resp.status === "ok") {
        hapusDraft(tipe, draft.id);
        hasil.berhasil += 1;
      } else if (resp.status === "konflik") {
        tandaiKonflik(
          tipe,
          draft.id,
          `Terjadi konflik — data server lebih baru (versi ${resp.versi})`
        );
        hasil.konflik += 1;
      } else {
        hasil.gagal += 1;
      }
    } catch {
      hasil.gagal += 1;
    }
  }
  return hasil;
}

/**
 * Convenience: sync only drafts of one tipe (used by feature-specific surfaces
 * that want to flush just their own edits). Same conflict + error rules as
 * {@linkcode syncSekarang}.
 */
export async function syncDraftByTipe(
  tipe: TipeDraft,
  opsi?: OpsiSync
): Promise<HasilSinkronisasi> {
  const hasil: HasilSinkronisasi = { berhasil: 0, gagal: 0, konflik: 0 };
  if (!isOnline()) return hasil;

  const pending = listDraftPending().filter((d) => tipeDariDraft(d) === tipe);
  for (const draft of pending) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop — drafts are flushed sequentially so the server's per-draft versi-aware upsert stays ordered and progress is observable per item.
      const resp = await kirimDraft(draft, opsi);
      if (resp.status === "ok") {
        hapusDraft(tipe, draft.id);
        hasil.berhasil += 1;
      } else if (resp.status === "konflik") {
        tandaiKonflik(
          tipe,
          draft.id,
          `Terjadi konflik — data server lebih baru (versi ${resp.versi})`
        );
        hasil.konflik += 1;
      } else {
        hasil.gagal += 1;
      }
    } catch {
      hasil.gagal += 1;
    }
  }
  return hasil;
}

// Re-export the type guards for callers (UI) that need to narrow a DraftItem.
export type { DraftNilai, DraftAbsensi };
