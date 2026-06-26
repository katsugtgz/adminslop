"use client";

/**
 * Mode Offline (#21) — localStorage-backed draft store. AC#2: drafts live in
 * the browser, NOT on the server. AC#1: captures pending Nilai + Absensi edits
 * while offline.
 *
 * STORAGE LAYOUT
 *   eapp_draft_nilai_{id}    -> JSON(ItemSinkronisasi)  (draft.draft is DraftNilai)
 *   eapp_draft_absensi_{id}  -> JSON(ItemSinkronisasi)  (draft.draft is DraftAbsensi)
 *   eapp_draft_index         -> JSON<string[]>          (ordered list of full keys)
 *
 * The index is the source of truth for enumeration; per-key reads/writes carry
 * the payload. This avoids scanning every localStorage key (which can be slow
 * when the page also persists unrelated entries) and keeps the store testable
 * against a fake localStorage that only records explicit gets/sets.
 *
 * SSR SAFETY: every entry point guards `typeof window === "undefined"`. On the
 * server the store is a no-op (`simpanDraft*` return a synthesized draft,
 * `listDraftPending` returns `[]`). The real behavior only fires in the browser.
 */

import type {
  DraftAbsensi,
  DraftItem,
  DraftNilai,
  InputDraftAbsensi,
  InputDraftNilai,
  ItemSinkronisasi,
  StatusSinkronisasi,
  TipeDraft,
} from "./types";

const PREFIX_NILAI = "eapp_draft_nilai_";
const PREFIX_ABSENSI = "eapp_draft_absensi_";
const INDEX_KEY = "eapp_draft_index";

/** Returns the localStorage handle, or null outside the browser. */
function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Minimal UUID v4 generator. Falls back to a timestamp+random slug when
 * `crypto.randomUUID` is absent (older runtimes). Used for draft ids only —
 * NOT a security primitive.
 */
function buatId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function kunciDraft(tipe: TipeDraft, id: string): string {
  return tipe === "nilai" ? `${PREFIX_NILAI}${id}` : `${PREFIX_ABSENSI}${id}`;
}

/** Read+parse a per-draft entry; null when absent or corrupt. */
function bacaItem(storage: Storage, kunci: string): ItemSinkronisasi | null {
  const raw = storage.getItem(kunci);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ItemSinkronisasi;
  } catch {
    return null;
  }
}

/** Read the index (ordered list of full keys). Empty array when absent/corrupt. */
function bacaIndex(storage: Storage): string[] {
  const raw = storage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function tulisIndex(storage: Storage, index: string[]): void {
  storage.setItem(INDEX_KEY, JSON.stringify(index));
}

/**
 * Persist a draft entry. Replaces any existing entry with the same key (so a
 * re-edit of the same pending draft overwrites the prior pending copy). Adds
 * the key to the index if new.
 */
function tulisItem(
  storage: Storage,
  tipe: TipeDraft,
  item: ItemSinkronisasi
): ItemSinkronisasi {
  const kunci = kunciDraft(tipe, item.draft.id);
  storage.setItem(kunci, JSON.stringify(item));
  const index = bacaIndex(storage);
  if (!index.includes(kunci)) {
    index.push(kunci);
    tulisIndex(storage, index);
  }
  return item;
}

/**
 * Store a pending Nilai draft (AC#1). Generates `id` + `dibuatPada`; the
 * caller-supplied `versi` is the server version the client last observed.
 * No-op on the server (SSR guard).
 */
export function simpanDraftNilai(input: InputDraftNilai): DraftNilai {
  const draft: DraftNilai = {
    id: buatId(),
    penilaianId: input.penilaianId,
    pesertaDidikId: input.pesertaDidikId,
    nilai: input.nilai,
    catatan: input.catatan,
    versi: input.versi,
    dibuatPada: new Date().toISOString(),
  };
  const storage = getStorage();
  if (!storage) return draft;
  tulisItem(storage, "nilai", { draft, status: "menunggu" });
  return draft;
}

/**
 * Store a pending Absensi draft (AC#1). Generates `id` + `dibuatPada`; the
 * caller-supplied `versi` is the server version the client last observed.
 * No-op on the server (SSR guard).
 */
export function simpanDraftAbsensi(input: InputDraftAbsensi): DraftAbsensi {
  const draft: DraftAbsensi = {
    id: buatId(),
    pesertaDidikId: input.pesertaDidikId,
    rombonganBelajarId: input.rombonganBelajarId,
    tanggal: input.tanggal,
    status: input.status,
    catatan: input.catatan,
    metode: input.metode,
    versi: input.versi,
    dibuatPada: new Date().toISOString(),
  };
  const storage = getStorage();
  if (!storage) return draft;
  tulisItem(storage, "absensi", { draft, status: "menunggu" });
  return draft;
}

/**
 * AC#3: enumerate every draft still needing sync — status `menunggu` OR
 * `konflik`. Successful syncs remove their entry via {@linkcode hapusDraft},
 * so `tersinkron` entries should not normally persist; they are filtered out
 * defensively. Returns `[]` on the server.
 */
export function listDraftPending(): DraftItem[] {
  const storage = getStorage();
  if (!storage) return [];
  return bacaIndex(storage)
    .map((kunci) => bacaItem(storage, kunci))
    .filter(
      (item): item is ItemSinkronisasi =>
        item !== null && item.status !== "tersinkron"
    )
    .map((item) => item.draft);
}

/**
 * Enumerate every draft with its sync status (for the UI). Returns `[]` on the
 * server. Order matches insertion (index order).
 */
export function listSemuaItem(): ItemSinkronisasi[] {
  const storage = getStorage();
  if (!storage) return [];
  return bacaIndex(storage)
    .map((kunci) => bacaItem(storage, kunci))
    .filter((item): item is ItemSinkronisasi => item !== null);
}

/** Resolve the status of one draft by id+tipe, or null when absent. */
export function getStatus(
  tipe: TipeDraft,
  id: string
): StatusSinkronisasi | null {
  const storage = getStorage();
  if (!storage) return null;
  const item = bacaItem(storage, kunciDraft(tipe, id));
  return item?.status ?? null;
}

/**
 * Remove a draft after a successful sync (AC#3). Removes from both the key and
 * the index. No-op when absent (idempotent). No-op on the server.
 */
export function hapusDraft(tipe: TipeDraft, id: string): void {
  const storage = getStorage();
  if (!storage) return;
  const kunci = kunciDraft(tipe, id);
  storage.removeItem(kunci);
  const index = bacaIndex(storage).filter((k) => k !== kunci);
  tulisIndex(storage, index);
}

/**
 * AC#4: mark a draft as conflicting. Does NOT overwrite the server row; the
 * draft is preserved locally so the user can resolve it. The `error` message
 * is shown in the UI.
 */
export function tandaiKonflik(
  tipe: TipeDraft,
  id: string,
  error: string
): void {
  const storage = getStorage();
  if (!storage) return;
  const kunci = kunciDraft(tipe, id);
  const item = bacaItem(storage, kunci);
  if (!item) return;
  tulisItem(storage, tipe, { ...item, status: "konflik", error });
}

/**
 * Mark a draft as successfully synced. The store convention is to instead
 * {@linkcode hapusDraft} on success (so the pending list drains), but this
 * helper exists for symmetry and for callers that want to defer removal.
 */
export function tandaiTersinkron(tipe: TipeDraft, id: string): void {
  const storage = getStorage();
  if (!storage) return;
  const kunci = kunciDraft(tipe, id);
  const item = bacaItem(storage, kunci);
  if (!item) return;
  tulisItem(storage, tipe, { ...item, status: "tersinkron", error: undefined });
}

/** Count of drafts awaiting sync (menunggu + konflik). 0 on the server. */
export function hitungDraftPending(): number {
  return listDraftPending().length;
}

/**
 * Test/debug helper: wipe every eapp_draft_* entry + the index. Not used in
 * production flows; exists so tests and the UI's "discard all" affordance can
 * reset the store.
 */
export function bersihkanSemuaDraft(): void {
  const storage = getStorage();
  if (!storage) return;
  for (const kunci of bacaIndex(storage)) {
    storage.removeItem(kunci);
  }
  storage.removeItem(INDEX_KEY);
}
