"use client";

import { useCallback, useEffect, useReducer } from "react";
import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "eapp_tur_selesai";
export const TUR_AWAL_BUKA_EVENT = "tur-awal:buka";

const STEP_TITLES = [
  "Selamat datang di EduAdmin Pro Premium",
  "Pilih Satuan Pendidikan dari dashboard",
  "Kelola Peserta Didik, PTK, dan data sekolah",
  "Gunakan menu di dashboard untuk mengakses modul",
] as const;

const STEP_DESCRIPTIONS = [
  "Portal administrasi sekolah untuk Guru dan Satuan Pendidikan di Indonesia.",
  "Pilih Satuan Pendidikan Aktif sebelum mengelola data sekolah.",
  "Setelah memilih, modul Peserta Didik, PTK, dan data sekolah akan aktif.",
  "Akses setiap modul melalui kartu di dashboard sesuai peran Anda.",
] as const;

type State = { mulai: boolean; langkah: number };

type Action = { type: "buka" } | { type: "tutup" } | { type: "selanjutnya" };

const initialState: State = { mulai: false, langkah: 0 };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "buka":
      return { mulai: true, langkah: 0 };
    case "tutup":
      return { mulai: false, langkah: 0 };
    case "selanjutnya": {
      if (state.langkah + 1 >= STEP_TITLES.length) {
        return { mulai: false, langkah: 0 };
      }
      return { mulai: true, langkah: state.langkah + 1 };
    }
  }
}

function tandaiSelesai(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore — non-fatal when storage is unavailable
  }
}

/**
 * Tur Awal — first-visit guided walkthrough. Renders a modal dialog over the
 * dashboard, persists dismissal in `localStorage` (`eapp_tur_selesai`), and can
 * be re-triggered by dispatching the `tur-awal:buka` window event (used by
 * `<TombolTurAwal />`).
 */
export function TurAwal() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let selesai = false;
    try {
      selesai = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // localStorage unavailable — treat as first visit
    }
    if (!selesai) dispatch({ type: "buka" });

    const onBuka = () => dispatch({ type: "buka" });
    window.addEventListener(TUR_AWAL_BUKA_EVENT, onBuka);
    return () => window.removeEventListener(TUR_AWAL_BUKA_EVENT, onBuka);
  }, []);

  const lewati = useCallback(() => {
    tandaiSelesai();
    dispatch({ type: "tutup" });
  }, []);

  const selanjutnya = useCallback(() => {
    if (state.langkah + 1 >= STEP_TITLES.length) {
      tandaiSelesai();
      dispatch({ type: "tutup" });
    } else {
      dispatch({ type: "selanjutnya" });
    }
  }, [state.langkah]);

  if (!state.mulai) return null;

  const isLast = state.langkah === STEP_TITLES.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tur-awal-judul"
      aria-describedby="tur-awal-deskripsi"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 focus-visible:outline-none sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-xl border border-border bg-card p-6 text-card-foreground shadow-xl sm:rounded-xl">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {`Tur Awal · Langkah ${state.langkah + 1} dari ${STEP_TITLES.length}`}
        </p>
        <h2
          id="tur-awal-judul"
          className="mt-2 text-lg font-semibold tracking-tight"
        >
          {STEP_TITLES[state.langkah]}
        </h2>
        <p
          id="tur-awal-deskripsi"
          className="mt-2 text-sm text-muted-foreground"
        >
          {STEP_DESCRIPTIONS[state.langkah]}
        </p>

        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={lewati}>
            Lewati
          </Button>
          <span className="flex gap-1" aria-hidden="true">
            {STEP_TITLES.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  i === state.langkah ? "bg-primary" : "bg-border",
                )}
              />
            ))}
          </span>
          <Button onClick={selanjutnya}>
            {isLast ? "Selesai" : "Selanjutnya"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tombol Tur Awal — clears the dismissal flag and dispatches the event that
 * `<TurAwal />` listens for. Mount anywhere a Pengguna can re-start the tour.
 */
export function TombolTurAwal({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: "outline" | "ghost" | "secondary";
}) {
  const mulaiUlang = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore — non-fatal
    }
    window.dispatchEvent(new CustomEvent(TUR_AWAL_BUKA_EVENT));
  }, []);

  return (
    <Button
      type="button"
      variant={variant}
      onClick={mulaiUlang}
      className={className}
      aria-label="Mulai Tur Awal lagi"
    >
      <HelpCircle aria-hidden="true" />
      Mulai Tur Awal
    </Button>
  );
}
