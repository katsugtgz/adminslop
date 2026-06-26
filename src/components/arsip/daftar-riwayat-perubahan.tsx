import type { CatatanAudit } from "@/db/schema";

/** Format a Date as a readable Bahasa timestamp. */
function formatWaktu(d: Date): string {
  return d.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Riwayat Perubahan — read-only list of catatan_audit entries for the active
 * tenant (AC#4). Shows waktu, aktor, aksi, and target. Read-only on every
 * render (no management form — the audit log is append-only at the source).
 */
export function DaftarRiwayatPerubahan({
  riwayat,
}: {
  riwayat: readonly CatatanAudit[];
}) {
  if (riwayat.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada riwayat perubahan.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {riwayat.map((r) => (
        <li
          key={r.id}
          className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{r.aksi}</span>
            <span className="text-xs text-muted-foreground">
              {formatWaktu(r.dibuatPada)}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Aktor: {r.aktor}
            {r.target ? ` · Target: ${r.target}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
