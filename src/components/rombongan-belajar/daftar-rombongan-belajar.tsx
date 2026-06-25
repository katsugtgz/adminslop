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
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Rombongan Belajar.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rombel.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <span className="text-sm font-semibold">{r.nama}</span>
        </li>
      ))}
    </ul>
  );
}
