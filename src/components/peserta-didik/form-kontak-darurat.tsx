import { Button } from "@/components/ui/button";

import type { ServerAksi } from "./form-ubah-biodata";

/**
 * Form to add an emergency-contact record to a Peserta Didik. A kontak_darurat
 * is a contact ONLY — NOT a Pengguna login (AC#4). Server-rendered only; posts
 * to `tambahKontakDaruratAction`. Rendered only when `boleh("peserta_didik:ubah")`.
 * Deliberately has NO email field (wali has email; kontak darurat does not).
 */
export function FormKontakDarurat({
  action,
  pesertaDidikId,
}: {
  action: ServerAksi;
  pesertaDidikId: string;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm"
    >
      <input type="hidden" name="pesertaDidikId" value={pesertaDidikId} />

      <h2 className="text-lg font-semibold tracking-tight">Tambah Kontak Darurat</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="kontak-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="kontak-nama"
          name="nama"
          type="text"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="kontak-hubungan" className="text-sm font-medium">
          Hubungan
        </label>
        <input
          id="kontak-hubungan"
          name="hubungan"
          type="text"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="kontak-telepon" className="text-sm font-medium">
          Telepon
        </label>
        <input
          id="kontak-telepon"
          name="telepon"
          type="text"
          inputMode="tel"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        Tambah Kontak Darurat
      </Button>
    </form>
  );
}
