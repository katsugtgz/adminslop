import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import {
  listSemuaItem,
  simpanDraftAbsensi,
  simpanDraftNilai,
  tandaiKonflik,
} from "@/lib/offline/store";
import * as syncMod from "@/lib/offline/sync";

import Page from "./page";

/**
 * Mode Offline (#21) — Sinkronisasi page UI tests. Exercises the
 * DaftarPerubahanTertunda surface: render of pending drafts, the sync button,
 * conflict warnings, and the empty state. localStorage (jsdom) + syncSekarang
 * is stubbed via vi.spyOn so no real fetch fires.
 */

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    value,
    configurable: true,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  setOnline(true);
});

afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

describe("SinkronisasiPage (#21) — header + indicator", () => {
  it("renders the 'Sinkronisasi Data' heading + back link + offline indicator region", () => {
    render(<Page />);
    expect(
      screen.getByRole("heading", { name: /Sinkronisasi Data/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kembali ke Dasbor/i })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    // IndikatorOffline renders a status region (text snaps after mount).
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("DaftarPerubahanTertunda (#21) — empty state", () => {
  it("shows 'Belum ada perubahan tertunda.' when the store is empty", () => {
    render(<Page />);
    expect(
      screen.getByText(/Belum ada perubahan tertunda/i)
    ).toBeInTheDocument();
  });
});

describe("DaftarPerubahanTertunda (#21) — pending draft render", () => {
  it("lists pending drafts with a 'Menunggu' badge", () => {
    simpanDraftNilai({
      penilaianId: "penilaian_abc12345",
      pesertaDidikId: "pd_def67890",
      nilai: 88,
      versi: 1,
    });
    render(<Page />);
    expect(screen.getByText(/Menunggu/)).toBeInTheDocument();
    expect(screen.getByText(/^Nilai — Penilaian/i)).toBeInTheDocument();
    // the sync button is present + enabled while online with drafts
    expect(
      screen.getByRole("button", { name: /Sinkronkan Sekarang/i })
    ).toBeEnabled();
  });

  it("sync button is disabled when offline OR store empty", () => {
    render(<Page />);
    // empty store → disabled
    expect(
      screen.getByRole("button", { name: /Sinkronkan Sekarang/i })
    ).toBeDisabled();
  });
});

describe("DaftarPerubahanTertunda (#21) — sync trigger", () => {
  it("clicking 'Sinkronkan Sekarang' calls syncSekarang and drains the list on success", async () => {
    const spy = vi
      .spyOn(syncMod, "syncSekarang")
      .mockResolvedValue({ berhasil: 1, gagal: 0, konflik: 0 });
    simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 90,
      versi: 1,
    });
    render(<Page />);

    fireEvent.click(
      screen.getByRole("button", { name: /Sinkronkan Sekarang/i })
    );
    await waitFor(() => {
      // syncSekarang was called
      expect(spy).toHaveBeenCalledTimes(1);
      // the success summary line is shown
      expect(screen.getByText(/1 berhasil/i)).toBeInTheDocument();
    });
  });
});

describe("DaftarPerubahanTertunda (#21) — conflict warning (AC#4)", () => {
  it("renders the PeringatanKonflik card with the server versi message + discard action", () => {
    const draft = simpanDraftAbsensi({
      pesertaDidikId: "pd1",
      rombonganBelajarId: "r1",
      tanggal: "2026-06-26",
      status: "sakit",
      metode: "manual",
      versi: 1,
    });
    tandaiKonflik(
      "absensi",
      draft.id,
      "Terjadi konflik — data server lebih baru (versi 5)"
    );
    render(<Page />);

    expect(
      screen.getByRole("heading", { name: /Konflik Sinkronisasi/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/versi 5/)).toBeInTheDocument();
    // discard button
    expect(
      screen.getByRole("button", { name: /Buang draft lokal/i })
    ).toBeInTheDocument();
  });

  it("'Buang draft lokal' removes the conflicting draft from the store", async () => {
    const draft = simpanDraftAbsensi({
      pesertaDidikId: "pd1",
      rombonganBelajarId: "r1",
      tanggal: "2026-06-26",
      status: "izin",
      metode: "manual",
      versi: 1,
    });
    tandaiKonflik("absensi", draft.id, "konflik versi 9");
    render(<Page />);

    fireEvent.click(
      screen.getByRole("button", { name: /Buang draft lokal/i })
    );
    await waitFor(() => {
      expect(listSemuaItem()).toHaveLength(0);
    });
  });
});

describe("DaftarPerubahanTertunda (#21) — offline state", () => {
  it("disables sync + notes offline in the subtitle when navigator.onLine is false", () => {
    simpanDraftNilai({
      penilaianId: "p1",
      pesertaDidikId: "pd1",
      nilai: 70,
      versi: 1,
    });
    setOnline(false);
    render(<Page />);
    expect(
      screen.getByText(/Data lokal belum disinkronkan — sedang offline/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sinkronkan Sekarang/i })
    ).toBeDisabled();
  });
});
