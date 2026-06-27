import { Button } from "@/components/ui/button";
import type { JenisPermintaanAi } from "@/db/queries/permintaan-ai";

/**
 * A server action reference — `(formData) => Promise<void>`. Plain server forms
 * post directly to this; no client hooks, no client validation (the T7 actions
 * are the authoritative gate — identity doc §12). Shared with sibling
 * components in this folder.
 */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

/**
 * Bahasa label for each {@linkcode JenisPermintaanAi} slug. Shared with
 * `DaftarPermintaan` so the select options and the row labels stay in sync.
 */
export const LABEL_JENIS: Record<JenisPermintaanAi, string> = {
  deskripsi_cp: "Deskripsi Capaian Pembelajaran",
  deskripsi_tp: "Deskripsi Tujuan Pembelajaran",
  deskripsi_atp: "Deskripsi Alur Tujuan Pembelajaran",
  narasi_raport: "Narasi Raport",
};

/** Ordered select options (slug + Bahasa label) rendered by this form. */
export const PILIHAN_JENIS: readonly { slug: JenisPermintaanAi; label: string }[] =
  [
    { slug: "deskripsi_cp", label: LABEL_JENIS.deskripsi_cp },
    { slug: "deskripsi_tp", label: LABEL_JENIS.deskripsi_tp },
    { slug: "deskripsi_atp", label: LABEL_JENIS.deskripsi_atp },
    { slug: "narasi_raport", label: LABEL_JENIS.narasi_raport },
  ];

/**
 * Form to submit a Permintaan AI. Server-rendered only; posts to
 * `buatPermintaanAiAction`. The page renders this only when
 * `boleh("permintaan_ai:buat")` (guru / admin / dev) — the action re-checks
 * server-side. `konteks` is an optional JSON object string (default `{}` is
 * applied server-side when the field is blank).
 */
export function FormPermintaan({ action }: { action: ServerAksi }) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl tracking-tight text-foreground">
          Permintaan AI Baru{" "}
          <span className="align-middle font-mono text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            (mode demo)
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">
          Buat permintaan konten AI. Saat ini{" "}
          <strong className="font-medium text-foreground">mode demo</strong>:
          draf contoh dihasilkan tanpa LLM nyata (lihat ADR 0003). Draf yang
          dihasilkan tetap perlu diverifikasi sebelum digunakan.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="permintaan-jenis" className="text-sm font-medium">
          Jenis
        </label>
        <select
          id="permintaan-jenis"
          name="jenis"
          defaultValue="deskripsi_cp"
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {PILIHAN_JENIS.map(({ slug, label }) => (
            <option key={slug} value={slug}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="permintaan-konteks" className="text-sm font-medium">
          Konteks
        </label>
        <textarea
          id="permintaan-konteks"
          name="konteks"
          rows={4}
          placeholder='{"mapel":"Matematika","fase":"C","elemen":"Bilangan"}'
          className="rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">
          Opsional — objek JSON sebagai konteks permintaan.
        </span>
      </div>

      <Button type="submit" className="w-fit">
        Kirim Permintaan AI
      </Button>
    </form>
  );
}
