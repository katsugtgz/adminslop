import { Bell, Check, CheckCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { Notifikasi } from "@/db/schema";

/** A `(id: string) => Promise<void>` server action (tandaiDibacaAction). */
export type TandaiDibacaAksi = (notifikasiId: string) => Promise<void>;
/** A `() => Promise<void>` server action (tandaiSemuaDibacaAction). */
export type TandaiSemuaDibacaAksi = () => Promise<void>;

/** Bahasa label for a `tipe` value. */
function labelTipe(tipe: string): string {
  switch (tipe) {
    case "tugas_nilai":
      return "Tugas Nilai";
    case "tugas_absensi":
      return "Tugas Absensi";
    case "tugas_eraport":
      return "Tugas E-Raport";
    case "umum":
      return "Umum";
    default:
      return tipe;
  }
}

/** Inline badge-like pill (no shared ui/badge dependency in this slice). */
function Pill({
  children,
  tone = "outline",
}: {
  children: ReactNode;
  tone?: "outline" | "secondary";
}) {
  const cls =
    tone === "secondary"
      ? "border-transparent bg-secondary text-secondary-foreground"
      : "border-border text-muted-foreground";
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

/**
 * Daftar Notifikasi — inbox list for one Pengguna. Each unread row shows a
 * "Tandai Dibaca" form; the header shows a "Tandai Semua Dibaca" button when
 * any unread row exists. Empty state: "Belum ada notifikasi.". Action-oriented
 * Bahasa copy.
 */
export function DaftarNotifikasi({
  notifikasis,
  tandaiDibacaAction,
  tandaiSemuaDibacaAction,
}: {
  notifikasis: readonly Notifikasi[];
  tandaiDibacaAction: TandaiDibacaAksi;
  tandaiSemuaDibacaAction: TandaiSemuaDibacaAksi;
}) {
  const jumlahBelumDibaca = notifikasis.filter((n) => !n.dibaca).length;

  if (notifikasis.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada notifikasi.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {jumlahBelumDibaca > 0 && (
        <form action={tandaiSemuaDibacaAction} className="flex justify-end">
          <Button type="submit" size="sm" variant="outline">
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Tandai Semua Dibaca
          </Button>
        </form>
      )}
      <ul className="flex flex-col gap-2">
        {notifikasis.map((n) => {
          const tandai = tandaiDibacaAction.bind(null, n.id);
          return (
            <li
              key={n.id}
              className={`flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:flex-row sm:items-start sm:justify-between ${
                n.dibaca ? "opacity-70" : ""
              }`}
            >
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"
                    aria-hidden="true"
                  >
                    <Bell className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold">{n.judul}</span>
                  {!n.dibaca && (
                    <Pill tone="secondary">Belum Dibaca</Pill>
                  )}
                  <Pill>{labelTipe(n.tipe)}</Pill>
                </div>
                <p className="text-sm text-muted-foreground">{n.pesan}</p>
                <span className="text-xs text-muted-foreground">
                  {n.dibuatPada.toLocaleString("id-ID")}
                </span>
              </div>
              {!n.dibaca && (
                <form action={tandai}>
                  <Button type="submit" size="sm" variant="ghost">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Tandai Dibaca
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
