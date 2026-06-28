import { Button } from "@/components/ui/button";

import type { ServerAksi } from "./form-draf";

/**
 * Form to record a revision (AC#3 accountability). Posts to
 * `catatRevisiEraportAction` with the required `alasan` + optional
 * `kontenPerubahan` JSON. The repo atomically appends a revisi_eraport row and
 * flips the parent status to 'revisi'. The page renders this only when
 * `boleh("eraport:revisi")` (admin / dev) — the action re-checks server-side.
 */
export function FormRevisi({
  eraportId,
  action,
}: {
  eraportId: string;
  action: ServerAksi;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-3"
    >
      <input type="hidden" name="id" value={eraportId} />
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        Catat Revisi
      </span>
      <div className="flex flex-col gap-1">
        <label htmlFor={`alasan-${eraportId}`} className="text-xs font-medium">
          Alasan Revisi
        </label>
        <textarea
          id={`alasan-${eraportId}`}
          name="alasan"
          rows={2}
          required
          aria-label="Alasan Revisi"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`perubahan-${eraportId}`}
          className="text-xs font-medium"
        >
          Konten Perubahan (opsional)
        </label>
        <input
          id={`perubahan-${eraportId}`}
          name="kontenPerubahan"
          type="text"
          placeholder='{"nilaiAkhir":85}'
          aria-label="Konten Perubahan (opsional)"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button type="submit" size="sm" variant="outline" className="w-fit">
        Catat Revisi
      </Button>
    </form>
  );
}
