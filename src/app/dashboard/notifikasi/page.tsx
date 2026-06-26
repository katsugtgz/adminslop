import { getDb, withTenant } from "@/db/client";
import {
  getPreferensiNotifikasi,
  hitungBelumDibaca,
  listNotifikasiAktif,
} from "@/db/queries/notifikasi";
import { getAksesSaya } from "@/lib/auth/akses-saya";

import { DaftarNotifikasi } from "@/components/notifikasi/daftar-notifikasi";
import { KontrolPreferensi } from "@/components/notifikasi/kontrol-preferensi";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

import {
  aturPreferensiNotifikasiAction,
  tandaiDibacaAction,
  tandaiSemuaDibacaAction,
} from "./actions";

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
    return <PembatasanAkses />;
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
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Notifikasi</h1>
          <p className="text-sm text-muted-foreground">
            Pengingat Tugas Tertunda untuk Anda.
          </p>
        </header>
        <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
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
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Notifikasi</h1>
          {belumDibaca > 0 && (
            <span
              aria-label={`${belumDibaca} Belum Dibaca`}
              className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-destructive px-2 text-xs font-semibold text-destructive-foreground"
            >
              {belumDibaca}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Pengingat Tugas Tertunda untuk Anda.
        </p>
      </header>

      <DaftarNotifikasi
        notifikasis={notifikasis}
        tandaiDibacaAction={tandaiDibacaAction}
        tandaiSemuaDibacaAction={tandaiSemuaDibacaAction}
      />

      <KontrolPreferensi
        preferensi={preferensi}
        aturPreferensiAction={aturPreferensiNotifikasiAction}
      />
    </section>
  );
}
