import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
  listSemuaItem,
  simpanDraftAbsensi,
  simpanDraftNilai,
} from "./store";
import {
  isOnline,
  kirimDraft,
  syncDraftByTipe,
  syncSekarang,
  type FetchLike,
} from "./sync";
import type { ResponsSinkronisasi } from "./types";

/**
 * Mode Offline (#21) — sync queue tests. `fetch` is injected (not globally
 * mocked) via the `opsi.fetch` parameter; `navigator.onLine` is toggled via
 * Object.defineProperty. The store (localStorage) is real jsdom, cleared
 * between tests.
 */

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    value,
    configurable: true,
  });
}

/** Build a fake Response object compatible with {@linkcode FetchLike}. */
function res(payload: ResponsSinkronisasi): { ok: boolean; json(): Promise<unknown> } {
  return {
    ok: true,
    json: async () => payload,
  };
}

/** Build a fake error Response (non-2xx) compatible with FetchLike. */
function resErr(_status: number): { ok: boolean; json(): Promise<unknown> } {
  return {
    ok: false,
    json: async () => ({}),
  };
}

beforeEach(() => {
  window.localStorage.clear();
  setOnline(true);
});

afterEach(() => {
  setOnline(true);
});

describe("sync (#21) — isOnline", () => {
  it("isOnline reflects navigator.onLine", () => {
    setOnline(true);
    expect(isOnline()).toBe(true);
    setOnline(false);
    expect(isOnline()).toBe(false);
  });
});

describe("sync (#21) — kirimDraft (single)", () => {
  it("POSTs the draft envelope to /api/sinkronisasi and returns the parsed response (ok)", async () => {
    const fetchMock = vi.fn<FetchLike>(async (_url, _init?) => res({ status: "ok", versi: 2 }));
    const draft = simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 90,
      versi: 1,
    });
    const resp = await kirimDraft(draft, { fetch: fetchMock });
    expect(resp).toEqual({ status: "ok", versi: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sinkronisasi",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      })
    );
    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init?.body ?? "{}");
    expect(body.tipe).toBe("nilai");
    expect(body.draft.penilaianId).toBe("p1");
  });

  it("returns {status:'konflik', versi} when server reports a versi mismatch (AC#4)", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      res({ status: "konflik", versi: 5 })
    );
    const draft = simpanDraftAbsensi({
      pesertaDidikId: "pd1",
      rombonganBelajarId: "r1",
      tanggal: "2026-06-26",
      status: "sakit",
      metode: "manual",
      versi: 1,
    });
    const resp = await kirimDraft(draft, { fetch: fetchMock });
    expect(resp.status).toBe("konflik");
    expect(resp.status === "konflik" && resp.versi).toBe(5);
  });

  it("returns {status:'error'} on a non-2xx response", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => resErr(500));
    const draft = simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 70,
      versi: 1,
    });
    const resp = await kirimDraft(draft, { fetch: fetchMock });
    expect(resp.status).toBe("error");
  });
});

describe("sync (#21) — syncSekarang aggregate", () => {
  it("drains menunggu drafts on ok, calling hapusDraft (AC#3)", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => res({ status: "ok", versi: 2 }));
    simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 80,
      versi: 1,
    });
    simpanDraftAbsensi({
      pesertaDidikId: "pd1",
      rombonganBelajarId: "r1",
      tanggal: "2026-06-26",
      status: "hadir",
      metode: "manual",
      versi: 1,
    });

    const hasil = await syncSekarang({ fetch: fetchMock });
    expect(hasil).toEqual({ berhasil: 2, gagal: 0, konflik: 0 });
    expect(listSemuaItem()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks a conflicting draft (AC#4) WITHOUT deleting it, counts konflik", async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      res({ status: "konflik", versi: 7 })
    );
    const draft = simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 75,
      versi: 1,
    });
    const hasil = await syncSekarang({ fetch: fetchMock });
    expect(hasil).toEqual({ berhasil: 0, gagal: 0, konflik: 1 });

    const items = listSemuaItem();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("konflik");
    expect(items[0].error).toContain("versi 7");
    expect(items[0].draft.id).toBe(draft.id);
  });

  it("counts gagal on fetch throwing (network error), leaves the draft as menunggu", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => {
      throw new Error("network down");
    });
    const draft = simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 60,
      versi: 1,
    });
    const hasil = await syncSekarang({ fetch: fetchMock });
    expect(hasil).toEqual({ berhasil: 0, gagal: 1, konflik: 0 });
    expect(listSemuaItem()[0].draft.id).toBe(draft.id);
    expect(listSemuaItem()[0].status).toBe("menunggu");
  });

  it("no-ops (zero counts) when offline", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => res({ status: "ok", versi: 1 }));
    simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 50,
      versi: 1,
    });
    setOnline(false);
    const hasil = await syncSekarang({ fetch: fetchMock });
    expect(hasil).toEqual({ berhasil: 0, gagal: 0, konflik: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(listSemuaItem()).toHaveLength(1);
  });

  it("mixed batch: one ok, one konflik, one gagal aggregates correctly", async () => {
    const seq = [
      res({ status: "ok", versi: 2 }),
      res({ status: "konflik", versi: 3 }),
      resErr(500),
    ];
    let i = 0;
    const fetchMock = vi.fn<FetchLike>(async () => seq[i++] ?? seq[seq.length - 1]);
    simpanDraftNilai({
      penilaianId: "p-ok",
      pesertaDidikId: "pd1",
      nilai: 90,
      versi: 1,
    });
    simpanDraftNilai({
      penilaianId: "p-konflik",
      pesertaDidikId: "pd1",
      nilai: 80,
      versi: 1,
    });
    simpanDraftNilai({
      penilaianId: "p-err",
      pesertaDidikId: "pd1",
      nilai: 70,
      versi: 1,
    });

    const hasil = await syncSekarang({ fetch: fetchMock });
    expect(hasil).toEqual({ berhasil: 1, gagal: 1, konflik: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("sync (#21) — syncDraftByTipe (scoped flush)", () => {
  it("only syncs drafts of the requested tipe, leaving the other tipe untouched", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => res({ status: "ok", versi: 2 }));
    simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 80,
      versi: 1,
    });
    simpanDraftAbsensi({
      pesertaDidikId: "pd1",
      rombonganBelajarId: "r1",
      tanggal: "2026-06-26",
      status: "hadir",
      metode: "manual",
      versi: 1,
    });

    const hasil = await syncDraftByTipe("nilai", { fetch: fetchMock });
    expect(hasil).toEqual({ berhasil: 1, gagal: 0, konflik: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const remaining = listSemuaItem();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].draft).toHaveProperty("tanggal");
  });

  it("no-ops when offline", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => res({ status: "ok", versi: 1 }));
    simpanDraftAbsensi({
      pesertaDidikId: "pd1",
      rombonganBelajarId: "r1",
      tanggal: "2026-06-26",
      status: "hadir",
      metode: "manual",
      versi: 1,
    });
    setOnline(false);
    const hasil = await syncDraftByTipe("absensi", { fetch: fetchMock });
    expect(hasil).toEqual({ berhasil: 0, gagal: 0, konflik: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sync (#21) — hapusDraft integration (regression)", () => {
  it("a successful sync removes the draft so a second sync is a no-op", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => res({ status: "ok", versi: 2 }));
    simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 88,
      versi: 1,
    });
    await syncSekarang({ fetch: fetchMock });
    const hasil2 = await syncSekarang({ fetch: fetchMock });
    expect(hasil2).toEqual({ berhasil: 0, gagal: 0, konflik: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
