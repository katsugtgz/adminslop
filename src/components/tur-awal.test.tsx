import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TurAwal, TombolTurAwal, TUR_AWAL_BUKA_EVENT } from "./tur-awal";

describe("TurAwal — first-visit guided walkthrough", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens automatically on first visit (no flag set)", async () => {
    vi.useFakeTimers();
    render(<TurAwal />);
    vi.runAllTimers();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName(/Selamat datang di EduAdmin Pro Premium/i);
    expect(
      screen.getByText(/Selamat datang di EduAdmin Pro Premium/i),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("does NOT open when the dismissal flag is set", async () => {
    window.localStorage.setItem("eapp_tur_selesai", "1");
    vi.useFakeTimers();
    render(<TurAwal />);
    vi.runAllTimers();
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.useRealTimers();
  });

  it("marks dismissal in localStorage and closes when 'Lewati' is clicked", async () => {
    vi.useFakeTimers();
    render(<TurAwal />);
    vi.runAllTimers();

    fireEvent.click(screen.getByRole("button", { name: /^Lewati$/i }));
    vi.runAllTimers();

    expect(window.localStorage.getItem("eapp_tur_selesai")).toBe("1");
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.useRealTimers();
  });

  it("advances through every step and shows 'Selesai' on the last step", async () => {
    vi.useFakeTimers();
    render(<TurAwal />);
    vi.runAllTimers();

    // Step 1
    expect(
      screen.getByText(/Selamat datang di EduAdmin Pro Premium/i)
    ).toBeInTheDocument();

    // Step 2
    fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
    expect(
      screen.getByText(/Pilih Satuan Pendidikan dari dashboard/i)
    ).toBeInTheDocument();

    // Step 3
    fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
    expect(
      screen.getByText(/Kelola Peserta Didik, PTK, dan data sekolah/i)
    ).toBeInTheDocument();

    // Step 4 (last) — button label changes to "Selesai"
    fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
    expect(
      screen.getByText(/Gunakan menu di dashboard untuk mengakses modul/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Selesai$/i })
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("closes and persists when 'Selesai' is clicked on the last step", async () => {
    vi.useFakeTimers();
    render(<TurAwal />);
    vi.runAllTimers();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: /Selanjutnya|Selesai/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: /^Selesai$/i }));

    expect(window.localStorage.getItem("eapp_tur_selesai")).toBe("1");
    expect(screen.queryByRole("dialog")).toBeNull();
    vi.useRealTimers();
  });

  it("re-opens when TombolTurAwal dispatches the window event", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("eapp_tur_selesai", "1");

    render(
      <>
        <TurAwal />
        <TombolTurAwal />
      </>
    );
    vi.runAllTimers();

    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Mulai Tur Awal/i }));
    expect(window.localStorage.getItem("eapp_tur_selesai")).toBeNull();

    // The component listens for the named event and re-opens.
    window.dispatchEvent(new CustomEvent(TUR_AWAL_BUKA_EVENT));
    vi.runAllTimers();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
