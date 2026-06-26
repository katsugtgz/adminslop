import { Button } from "@/components/ui/button";
import type { PesertaDidik } from "@/db/schema";

import type { AbsensiExisting, ServerAksi } from "./types";

/**
 * Per-student Absensi entry for one (rombonganBelajar, tanggal). Server-
 * rendered only; one server form per Peserta Didik. The page passes BOTH
 * `action` (catat, for new rows) and `actionUbah` (ubah, for existing rows);
 * each per-student form picks one based on whether `existing` has that
 * student's row.
 *
 * AC#3 (load-bearing): an EXISTING row — even one originally QR-captured —
 * posts to `actionUbah`. The repo preserves `metode_input` + `sumber_qr` on
 * UPDATE, so a corrected QR row stays correctable without losing its
 * provenance. The action re-checks authorization server-side (gate 1,
 * identity doc §12) — this form is purely UI.
 *
 * `rombonganBelajarId` + `tanggal` are resolved server-side (never client-
 * supplied) and carried as hidden fields. `pesertaDidikId` is hidden per row.
 *
 * SECURITY: every id field is resolved server-side and only echoed for the
 * form payload — they are NEVER read back to derive tenant scope (§13); the
 * action re-resolves ownership server-side.
 */
export function FormAbsensi({
  action,
  actionUbah,
  rombonganBelajarId,
  tanggal,
  peserta,
  existing,
}: {
  /** Posts NEW rows (no existing). */
  action: ServerAksi;
  /** Posts CORRECTIONS to existing rows (carries the row id as a hidden field). */
  actionUbah: ServerAksi;
  rombonganBelajarId: string;
  tanggal: string;
  peserta: readonly PesertaDidik[];
  existing: ReadonlyMap<string, AbsensiExisting>;
}) {
  if (peserta.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Peserta Didik.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {peserta.map((p) => {
        const row = existing.get(p.id);
        const aksi = row ? actionUbah : action;
        return (
          <li
            key={p.id}
            className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
          >
            <form action={aksi} className="flex flex-col gap-3">
              <input type="hidden" name="rombonganBelajarId" value={rombonganBelajarId} />
              <input type="hidden" name="tanggal" value={tanggal} />
              <input type="hidden" name="pesertaDidikId" value={p.id} />
              {row && <input type="hidden" name="id" value={row.id} />}

              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{p.nama}</span>
                {row && (
                  <span className="text-xs text-muted-foreground">
                    Metode Input:{" "}
                    {row.metodeInput === "qr" ? "QR" : "Manual"}
                    {row.sumberQr ? " (koreksi)" : ""}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`status-${p.id}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Status Kehadiran
                </label>
                <select
                  id={`status-${p.id}`}
                  name="statusKehadiran"
                  defaultValue={row?.statusKehadiran ?? "hadir"}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="hadir">Hadir</option>
                  <option value="izin">Izin</option>
                  <option value="sakit">Sakit</option>
                  <option value="alpa">Alpa</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`catatan-${p.id}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Catatan
                </label>
                <input
                  id={`catatan-${p.id}`}
                  name="catatan"
                  type="text"
                  defaultValue={row?.catatan ?? ""}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <Button type="submit" size="sm" className="w-fit">
                {row ? "Ubah Absensi" : "Catat Absensi"}
              </Button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
