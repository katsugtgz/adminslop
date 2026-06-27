import { Users } from "lucide-react";

import type { RombonganBelajar } from "@/db/schema";

/**
 * Read-only list of Rombongan Belajar (classes / homerooms) in the active
 * Satuan Pendidikan, ordered by `nama` ascending. Purely informational — no
 * delete action (archive, not hard-delete per CONTEXT.md). `bolehBuat` is
 * accepted for contract symmetry with the page; the list itself renders
 * identically for all viewers who pass the `rombongan_belajar:baca` gate.
 */
export function DaftarRombonganBelajar({
  rombel,
  bolehBuat: _bolehBuat,
}: {
  rombel: readonly RombonganBelajar[];
  bolehBuat: boolean;
}) {
  if (rombel.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        Belum ada Rombongan Belajar.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rombel.map((r, idx) => (
        <li
          key={r.id}
          className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-warm transition-shadow hover:shadow-warm-lg"
        >
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
          >
            <Users className="h-5 w-5" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-semibold text-foreground">
              {r.nama}
            </span>
            <span className="font-mono text-xs text-muted-foreground/70">
              {String(idx + 1).padStart(2, "0")}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
