import { Button } from "@/components/ui/button";
import type { PesertaDidik } from "@/db/schema";

/** Server action reference — `(formData) => Promise<void>`. Shared across this folder. */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

/**
 * Form to create a Draf E-Raport (AC#1 — draf from Nilai Akhir). Server-
 * rendered only; posts to `buatDrafEraportAction`. The page renders this only
 * when `boleh("eraport:buat")` (guru / admin / dev) — the action re-checks
 * server-side (identity doc §12). `bebanMengajarId` scopes the Nilai Akhir
 * derivation; `drafAiId` (AC#4) optionally links a verified Draf AI.
 */
export function FormDrafEraport({
  daftarPesertaDidik,
  action,
}: {
  daftarPesertaDidik: readonly PesertaDidik[];
  action: ServerAksi;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg tracking-tight text-foreground">Buat Draf E-Raport</h2>
        <p className="text-xs text-muted-foreground">
          Draf dibuat dari Nilai Akhir untuk Tahun Ajaran dan Semester aktif.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="eraport-peserta-didik" className="text-sm font-medium">
          Peserta Didik
        </label>
        <select
          id="eraport-peserta-didik"
          name="pesertaDidikId"
          defaultValue=""
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Pilih Peserta Didik
          </option>
          {daftarPesertaDidik.map((pd) => (
            <option key={pd.id} value={pd.id}>
              {pd.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="eraport-beban" className="text-sm font-medium">
          Beban Mengajar (opsional)
        </label>
        <input
          id="eraport-beban"
          name="bebanMengajarId"
          type="text"
          placeholder="ID Beban Mengajar untuk snapshot Nilai Akhir"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">
          Kosongkan jika tidak ingin menyertakan snapshot Nilai Akhir.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="eraport-draf-ai" className="text-sm font-medium">
          Draf AI (opsional)
        </label>
        <input
          id="eraport-draf-ai"
          name="drafAiId"
          type="text"
          placeholder="ID Draf AI yang sudah disetujui"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">
          Hanya Draf AI berstatus Disetujui yang dapat digunakan. Konten AI
          belum diverifikasi tidak dapat digunakan.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="eraport-catatan" className="text-sm font-medium">
          Catatan
        </label>
        <textarea
          id="eraport-catatan"
          name="catatan"
          rows={3}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        Buat Draf
      </Button>
    </form>
  );
}
