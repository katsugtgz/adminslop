import { Ban, ShieldAlert } from "lucide-react";

import { signOutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { PageReveal } from "@/components/motion";
import { TombolMasuk } from "@/components/akses/tombol-masuk";

/**
 * Pembatasan Akses — shown when the Pengguna cannot manage a Satuan
 * Pendidikan. Two distinct situations route here, both resolved to
 * `status: "denied"` by `getActiveTenantContext`:
 *
 *  - **Unauthenticated** (`authenticated === false`): the Pengguna has no
 *    session at all. Offer a primary "Masuk" action so the page is never a
 *    dead end.
 *  - **Authenticated but no Keanggotaan** (`authenticated === true`): the
 *    Pengguna is signed in but belongs to no Satuan Pendidikan. Offer
 *    "Keluar" and ask them to contact their Admin Satuan Pendidikan.
 *
 * Friendly Bahasa message, never a raw technical failure.
 */
export function PembatasanAkses({ authenticated = false }: { authenticated?: boolean }) {
  return (
    <PageReveal
      as="section"
      className="relative mx-auto flex max-w-md flex-col items-center gap-5 overflow-hidden rounded-2xl border border-border/60 bg-card p-8 text-center text-card-foreground shadow-warm md:p-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, oklch(0.58 0.22 27 / 0.35) 0%, transparent 70%)",
        }}
      />
      <span
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20"
        aria-hidden="true"
      >
        <ShieldAlert className="h-7 w-7" />
      </span>
      <p className="relative eyebrow text-destructive/80">
        Akses Dibatasi
      </p>
      <h1 className="relative font-display text-2xl tracking-tight text-foreground sm:text-3xl">
        Pembatasan Akses
      </h1>
      {authenticated ? (
        <p
          className="relative text-sm text-muted-foreground"
          role="alert"
          aria-live="assertive"
        >
          Anda belum terdaftar sebagai anggota Satuan Pendidikan mana pun.
          Hubungi Admin Satuan Pendidikan Anda agar diberi Keanggotaan sebelum
          dapat mengelola data sekolah.
        </p>
      ) : (
        <p
          className="relative text-sm text-muted-foreground"
          role="alert"
          aria-live="assertive"
        >
          Anda perlu masuk terlebih dahulu untuk mengelola data Satuan
          Pendidikan.
        </p>
      )}
      <p className="relative inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Ban className="h-3.5 w-3.5 text-destructive/70" aria-hidden="true" />
        Akses ditolak demi menjaga keamanan data antar Satuan Pendidikan.
      </p>
      <div className="relative flex flex-wrap items-center justify-center gap-3">
        {authenticated ? (
          <form
            action={signOutAction}
            aria-label="Keluar dari sesi"
          >
            <Button type="submit" variant="outline">
              Keluar
            </Button>
          </form>
        ) : (
          <TombolMasuk />
        )}
      </div>
    </PageReveal>
  );
}
