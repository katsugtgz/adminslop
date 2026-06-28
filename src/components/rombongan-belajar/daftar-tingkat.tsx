import { KosongDenganTautan } from "@/components/kosong-dengan-tautan";
import type { Tingkat } from "@/db/schema";

/**
 * Read-only list of Tingkat (grade levels) in the active Satuan Pendidikan,
 * ordered by `urutan` ascending (the progression order). The list is purely
 * informational — there is no delete action (archive, not hard-delete per
 * CONTEXT.md). `bolehBuat` is accepted for contract symmetry with the page
 * (which gates the create forms); the list itself renders identically for all
 * viewers who pass the `rombongan_belajar:baca` gate.
 */
export function DaftarTingkat({
  tingkat,
  bolehBuat: _bolehBuat,
}: {
  tingkat: readonly Tingkat[];
  bolehBuat: boolean;
}) {
  if (tingkat.length === 0) {
    return (
      <KosongDenganTautan
        pesan="Belum ada Tingkat."
        href="/dashboard/kurikulum"
        labelTautan="Buka Kurikulum"
      />
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tingkat.map((t, idx) => (
        <li
          key={t.id}
          className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-warm transition-shadow hover:shadow-warm-lg"
        >
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary font-display text-lg text-secondary-foreground"
          >
            {t.urutan}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-semibold text-foreground">
              {t.nama}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {String(idx + 1).padStart(2, "0")} · Urutan: {t.urutan}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
