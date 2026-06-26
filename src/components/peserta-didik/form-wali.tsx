import { Button } from "@/components/ui/button";

import type { ServerAksi } from "./form-ubah-biodata";

/**
 * Form to add a wali (parent/guardian) CONTACT record to a Peserta Didik. A wali
 * is a contact ONLY — NOT a Pengguna login (AC#4). Server-rendered only; posts
 * to `tambahWaliAction`. Rendered only when `boleh("peserta_didik:ubah")`.
 */
export function FormWali({
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

      <h2 className="text-lg font-semibold tracking-tight">Tambah Wali</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="wali-nama" className="text-sm font-medium">
          Nama
        </label>
        <input
          id="wali-nama"
          name="nama"
          type="text"
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="wali-hubungan" className="text-sm font-medium">
          Hubungan
        </label>
        <input
          id="wali-hubungan"
          name="hubungan"
          type="text"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="wali-telepon" className="text-sm font-medium">
          Telepon
        </label>
        <input
          id="wali-telepon"
          name="telepon"
          type="text"
          inputMode="tel"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="wali-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="wali-email"
          name="email"
          type="email"
          inputMode="email"
          className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        Tambah Wali
      </Button>
    </form>
  );
}
