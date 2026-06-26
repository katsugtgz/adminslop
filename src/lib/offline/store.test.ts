import { beforeEach, describe, expect, it } from "vitest";

import {
  bersihkanSemuaDraft,
  getStatus,
  hapusDraft,
  hitungDraftPending,
  listDraftPending,
  listSemuaItem,
  simpanDraftAbsensi,
  simpanDraftNilai,
  tandaiKonflik,
  tandaiTersinkron,
} from "./store";
import type { DraftAbsensi, DraftNilai } from "./types";

/**
 * Mode Offline (#21) — store round-trip tests. The store reads
 * `window.localStorage`; jsdom provides an in-memory localStorage that we
 * clear between tests for isolation. This exercises the real persistence path
 * (key layout, index, JSON parse/stringify) end-to-end.
 */
beforeEach(() => {
  window.localStorage.clear();
});

const inputNilai = {
  penilaianId: "penilaian_1",
  pesertaDidikId: "pd_1",
  nilai: 87,
  catatan: "Tugas bagus",
  versi: 1,
};

const inputAbsensi = {
  pesertaDidikId: "pd_1",
  rombonganBelajarId: "rombel_1",
  tanggal: "2026-06-26",
  status: "hadir",
  metode: "manual",
  versi: 1,
};

describe("store (#21) — simpanDraft*", () => {
  it("simpanDraftNilai writes under eapp_draft_nilai_{id} with status menunggu", () => {
    const draft = simpanDraftNilai(inputNilai);
    expect(draft.id).toBeTruthy();
    expect(draft.penilaianId).toBe("penilaian_1");

    const raw = window.localStorage.getItem(`eapp_draft_nilai_${draft.id}`);
    expect(raw).not.toBeNull();
    const item = JSON.parse(raw!);
    expect(item.status).toBe("menunggu");
    expect(item.draft.nilai).toBe(87);
  });

  it("simpanDraftAbsensi writes under eapp_draft_absensi_{id} with status menunggu", () => {
    const draft = simpanDraftAbsensi(inputAbsensi);
    const raw = window.localStorage.getItem(`eapp_draft_absensi_${draft.id}`);
    expect(raw).not.toBeNull();
    const item = JSON.parse(raw!);
    expect(item.draft.status).toBe("hadir");
    expect(item.draft.metode).toBe("manual");
  });

  it("simpanDraftNilai stamps a fresh id + ISO dibuatPada", () => {
    const draft = simpanDraftNilai(inputNilai);
    expect(draft.dibuatPada).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // id is unique across calls
    const draft2 = simpanDraftNilai(inputNilai);
    expect(draft2.id).not.toBe(draft.id);
  });
});

describe("store (#21) — listDraftPending / listSemuaItem", () => {
  it("listDraftPending returns every stored draft (menunggu)", () => {
    simpanDraftNilai(inputNilai);
    simpanDraftAbsensi(inputAbsensi);
    const pending = listDraftPending();
    expect(pending).toHaveLength(2);
  });

  it("listDraftPending EXCLUDES tersinkron drafts but INCLUDES konflik drafts", () => {
    const n = simpanDraftNilai(inputNilai);
    const a = simpanDraftAbsensi(inputAbsensi);
    tandaiTersinkron("nilai", n.id);
    tandaiKonflik("absensi", a.id, "versi 5");
    const pending = listDraftPending();
    expect(pending).toHaveLength(1);
    expect((pending[0] as DraftAbsensi).tanggal).toBe("2026-06-26");
  });

  it("listSemuaItem returns status-bearing entries in insertion order", () => {
    simpanDraftNilai(inputNilai);
    simpanDraftAbsensi(inputAbsensi);
    const items = listSemuaItem();
    expect(items).toHaveLength(2);
    expect(items[0].status).toBe("menunggu");
    expect(items[1].status).toBe("menunggu");
  });

  it("hitungDraftPending counts menunggu + konflik only", () => {
    const n = simpanDraftNilai(inputNilai);
    simpanDraftAbsensi(inputAbsensi);
    tandaiTersinkron("nilai", n.id);
    expect(hitungDraftPending()).toBe(1);
  });
});

describe("store (#21) — hapusDraft", () => {
  it("hapusDraft removes the entry and its index slot", () => {
    const draft = simpanDraftNilai(inputNilai);
    expect(hitungDraftPending()).toBe(1);
    hapusDraft("nilai", draft.id);
    expect(hitungDraftPending()).toBe(0);
    expect(window.localStorage.getItem(`eapp_draft_nilai_${draft.id}`)).toBeNull();
  });

  it("hapusDraft is a no-op for an unknown id (idempotent)", () => {
    expect(() => hapusDraft("nilai", "tidak_ada")).not.toThrow();
    expect(hitungDraftPending()).toBe(0);
  });
});

describe("store (#21) — tandaiKonflik (AC#4)", () => {
  it("tandaiKonflik sets status konflik + the error message, preserving the draft body", () => {
    const draft = simpanDraftNilai(inputNilai);
    tandaiKonflik("nilai", draft.id, "Terjadi konflik — data server lebih baru (versi 4)");
    expect(getStatus("nilai", draft.id)).toBe("konflik");
    const item = listSemuaItem().find((i) => i.draft.id === draft.id);
    expect(item?.error).toContain("versi 4");
    expect((item?.draft as DraftNilai).nilai).toBe(87);
  });

  it("tandaiKonflik on an unknown id is a no-op", () => {
    expect(() => tandaiKonflik("absensi", "tidak_ada", "x")).not.toThrow();
  });
});

describe("store (#21) — bersihkanSemuaDraft", () => {
  it("bersihkanSemuaDraft wipes every eapp_draft_* key + the index", () => {
    simpanDraftNilai(inputNilai);
    simpanDraftAbsensi(inputAbsensi);
    bersihkanSemuaDraft();
    expect(listDraftPending()).toEqual([]);
    expect(window.localStorage.getItem("eapp_draft_index")).toBeNull();
  });
});
