import { Bell } from "lucide-react";

import { getDb, withTenant } from "@/db/client";
import {
  getPreferensiNotifikasi,
  hitungBelumDibaca,
  listNotifikasiAktif,
} from "@/db/queries/notifikasi";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarNotifikasi } from "@/components/notifikasi/daftar-notifikasi";
import { KontrolPreferensi } from "@/components/notifikasi/kontrol-preferensi";
import { PageReveal } from "@/components/motion";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  aturPreferensiNotifikasiAction,
  tandaiDibacaAction,
  tandaiSemuaDibacaAction,
} from "./actions";
import { type StyleWithVars } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Notifikasi — in-app notifications & reminders for the active Pengguna (#20).
 *
 * Visibility (defense-in-depth UI; NOT authorization — the T5 actions are the
 * authoritative gate, identity doc §12):
 *   - `denied` / `choose` → mirror the dashboard resolution (Pembatasan / Pilih).
 *   - `!boleh("notifikasi:baca")` (only reachable via pembatasan — the slug is
 *     universal) → PembatasanAkses, and NO tenant data is loaded (no leak).
 *   - pengguna null (no synced row) → notice; the user has no inbox yet.
 *   - otherwise → the user's own inbox (recipient-scoped via akses.pengguna.id).
 *
 * MVP SCOPE (AC#5): in-app ONLY. No WhatsApp/email/SMS delivery is part of
 * this slice. Tenant scope is derived ONLY from `akses.membership.orgId` —
 * never from formData (§13).
 */
export default async function Page() {
  const akses = await getAksesSaya();

  if (akses.status === "denied") {
    return <PembatasanAkses authenticated={akses.authenticated} />;
  }
  if (akses.status === "choose") {
    return (
      <PilihSatuanPendidikan memberships={[...akses.memberships]} />
    );
  }

  // akses.status === "active"
  if (!akses.boleh("notifikasi:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const myPenggunaId = akses.pengguna?.id;
  if (!myPenggunaId) {
    return (
      <section className="flex flex-col gap-10">
        <PageReveal
          as="header"
          className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
        >
          <div
            aria-hidden="true"
            className="hero-glow pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
            style={{ "--glow-opacity": 0.35, "--glow-extent": "70%" } as StyleWithVars}
          />
          <div className="relative flex flex-col gap-3">
            <p className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-accent">
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              Pusat Pengingat
            </p>
            <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
              Notifikasi
            </h1>
            <p className="text-sm text-muted-foreground md:text-base">
              Pengingat Tugas Tertunda untuk Anda.
            </p>
          </div>
        </PageReveal>
        <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          Akun Anda belum terdaftar sebagai Pengguna. Hubungi admin.
        </p>
      </section>
    );
  }

  const { db } = getDb();
  const { notifikasis, preferensi, belumDibaca } = await withTenant(
    db,
    akses.membership.orgId,
    async (tx) => {
      const [list, prefs, count] = await Promise.all([
        listNotifikasiAktif(tx, myPenggunaId),
        getPreferensiNotifikasi(tx, myPenggunaId),
        hitungBelumDibaca(tx, myPenggunaId),
      ]);
      return { notifikasis: list, preferensi: prefs, belumDibaca: count };
    }
  );

  return (
    <section className="flex flex-col gap-10 md:gap-12">
      <PageReveal
        as="header"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div
          aria-hidden="true"
          className="hero-glow pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{ "--glow-opacity": 0.35, "--glow-extent": "70%" } as StyleWithVars}
        />
        <div className="relative flex flex-col gap-3">
          <p className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            Pusat Pengingat
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
              Notifikasi
            </h1>
            {belumDibaca > 0 && (
              <span
                aria-label={`${belumDibaca} Belum Dibaca`}
                className="inline-flex h-6 min-w-[1.5rem] items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2 text-xs font-semibold text-accent"
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                />
                {belumDibaca}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground md:text-base">
            Pengingat Tugas Tertunda untuk Anda.
          </p>
        </div>
      </PageReveal>

      <PageReveal delay={2}>
        <DaftarNotifikasi
          notifikasis={notifikasis}
          tandaiDibacaAction={tandaiDibacaAction}
          tandaiSemuaDibacaAction={tandaiSemuaDibacaAction}
        />
      </PageReveal>

      <PageReveal delay={3}>
        <KontrolPreferensi
          preferensi={preferensi}
          aturPreferensiAction={aturPreferensiNotifikasiAction}
        />
      </PageReveal>
    </section>
  );
}
