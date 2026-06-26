import { Ban, ShieldAlert } from "lucide-react";

import { signOutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

/**
 * Pembatasan Akses — shown when a signed-in Pengguna has no valid Keanggotaan
 * Satuan Pendidikan. Friendly Bahasa message, never a raw technical failure.
 */
export function PembatasanAkses() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center text-card-foreground shadow-sm">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden="true"
      >
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h1 className="text-xl font-bold tracking-tight">Pembatasan Akses</h1>
      <p className="text-sm text-muted-foreground" role="alert" aria-live="assertive">
        Anda belum terdaftar sebagai anggota Satuan Pendidikan mana pun. Hubungi
        Admin Satuan Pendidikan Anda agar diberi Keanggotaan sebelum dapat
        mengelola data sekolah.
      </p>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
        Akses ditolak demi menjaga keamanan data antar Satuan Pendidikan.
      </p>
      <form action={signOutAction} aria-label="Keluar dari sesi">
        <Button type="submit" variant="outline">
          Keluar
        </Button>
      </form>
    </section>
  );
}
