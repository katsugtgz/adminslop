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
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Tingkat.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tingkat.map((t) => (
        <li
          key={t.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">{t.nama}</span>
            <span className="text-xs text-muted-foreground">
              Urutan: {t.urutan}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
