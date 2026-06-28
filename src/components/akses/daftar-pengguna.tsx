import { Link2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardHover } from "@/components/motion";
import type { PenggunaDenganPtk } from "@/db/queries/akses";
import type { Ptk } from "@/db/schema";
import type { IzinSlug } from "@/lib/auth/types";

import type { ServerAksi } from "./form-ptk-baru";

/**
 * The closed IzinSlug vocabulary (single source of truth for the checkbox
 * matrix). Matches the list in `actions.ts`.
 */
const DAFTAR_IZIN: readonly IzinSlug[] = [
  "ptk:baca",
  "ptk:buat",
  "ptk:hapus",
  "akses:baca",
  "akses:kelola",
  "peserta_didik:baca",
  "peserta_didik:buat",
  "peserta_didik:ubah",
  "tahun_ajaran:baca",
  "tahun_ajaran:kelola",
  "rombongan_belajar:baca",
  "rombongan_belajar:buat",
  "rombongan_belajar:ubah",
  "rombongan_belajar:kelola_penempatan",
  "kurikulum:baca",
  "beban_mengajar:baca",
  "beban_mengajar:buat",
  "beban_mengajar:ubah",
  "wali_kelas:baca",
  "wali_kelas:buat",
  "wali_kelas:ubah",
  "penilaian:baca",
  "penilaian:buat",
  "penilaian:ubah",
  "permintaan_ai:baca",
  "permintaan_ai:buat",
  "draf_ai:baca",
  "draf_ai:verifikasi",
  "absensi:baca",
  "absensi:buat",
  "absensi:ubah",
  "impor_peserta_didik:baca",
  "impor_peserta_didik:kelola",
  "ekspor_peserta_didik:baca",
  "notifikasi:baca",
  "notifikasi:kelola",
  "eraport:baca",
  "eraport:buat",
  "eraport:terbit",
  "eraport:revisi",
  "bank_soal:baca",
  "bank_soal:buat",
  "bank_soal:ubah",
  "paket_soal:baca",
  "paket_soal:buat",
  "paket_soal:ubah",
  "perangkat_ajar:baca",
  "perangkat_ajar:buat",
  "perangkat_ajar:ubah",
  "arsip:baca",
  "arsip:kelola",
  "cetak:baca",
  "cetak:buat",
  "cetak:ubah",
  "offline:baca",
];

/** Bahasa label for an IzinSlug. */
function labelIzin(slug: IzinSlug): string {
  switch (slug) {
    case "ptk:baca":
      return "Baca PTK";
    case "ptk:buat":
      return "Buat PTK";
    case "ptk:hapus":
      return "Hapus PTK";
    case "akses:baca":
      return "Baca Akses";
    case "akses:kelola":
      return "Kelola Akses";
    case "peserta_didik:baca":
      return "Baca Peserta Didik";
    case "peserta_didik:buat":
      return "Buat Peserta Didik";
    case "peserta_didik:ubah":
      return "Ubah Peserta Didik";
    case "tahun_ajaran:baca":
      return "Baca Tahun Ajaran";
    case "tahun_ajaran:kelola":
      return "Kelola Tahun Ajaran";
    case "rombongan_belajar:baca":
      return "Baca Rombongan Belajar";
    case "rombongan_belajar:buat":
      return "Buat Rombongan Belajar";
    case "rombongan_belajar:ubah":
      return "Ubah Rombongan Belajar";
    case "rombongan_belajar:kelola_penempatan":
      return "Kelola Penempatan Rombongan Belajar";
    case "kurikulum:baca":
      return "Baca Kurikulum";
    case "beban_mengajar:baca":
      return "Baca Beban Mengajar";
    case "beban_mengajar:buat":
      return "Buat Beban Mengajar";
    case "beban_mengajar:ubah":
      return "Ubah Beban Mengajar";
    case "wali_kelas:baca":
      return "Baca Wali Kelas";
    case "wali_kelas:buat":
      return "Buat Wali Kelas";
    case "wali_kelas:ubah":
      return "Ubah Wali Kelas";
    case "penilaian:baca":
      return "Baca Penilaian";
    case "penilaian:buat":
      return "Buat Penilaian";
    case "penilaian:ubah":
      return "Ubah Penilaian";
    case "permintaan_ai:baca":
      return "Baca Permintaan AI";
    case "permintaan_ai:buat":
      return "Buat Permintaan AI";
    case "draf_ai:baca":
      return "Baca Draf AI";
    case "draf_ai:verifikasi":
      return "Verifikasi Draf AI";
    case "absensi:baca":
      return "Baca Absensi";
    case "absensi:buat":
      return "Buat Absensi";
    case "absensi:ubah":
      return "Ubah Absensi";
    case "impor_peserta_didik:baca":
      return "Baca Impor Peserta Didik";
    case "impor_peserta_didik:kelola":
      return "Kelola Impor Peserta Didik";
    case "ekspor_peserta_didik:baca":
      return "Baca Ekspor Peserta Didik";
    case "notifikasi:baca":
      return "Baca Notifikasi";
    case "notifikasi:kelola":
      return "Kelola Notifikasi";
    case "eraport:baca":
      return "Baca E-Raport";
    case "eraport:buat":
      return "Buat Draf E-Raport";
    case "eraport:terbit":
      return "Terbitkan E-Raport";
    case "eraport:revisi":
      return "Catat Revisi E-Raport";
    case "bank_soal:baca":
      return "Baca Bank Soal";
    case "bank_soal:buat":
      return "Buat Butir Soal";
    case "bank_soal:ubah":
      return "Ubah Butir Soal";
    case "paket_soal:baca":
      return "Baca Paket Soal";
    case "paket_soal:buat":
      return "Buat Paket Soal";
    case "paket_soal:ubah":
      return "Ubah Paket Soal";
    case "perangkat_ajar:baca":
      return "Baca Perangkat Ajar";
    case "perangkat_ajar:buat":
      return "Buat Perangkat Ajar";
    case "perangkat_ajar:ubah":
      return "Ubah Perangkat Ajar";
    case "arsip:baca":
      return "Baca Arsip";
    case "arsip:kelola":
      return "Kelola Arsip";
    case "cetak:baca":
      return "Baca Cetak";
    case "cetak:buat":
      return "Buat Cetak";
    case "cetak:ubah":
      return "Ubah Cetak";
    case "offline:baca":
      return "Baca Mode Offline";
  }
}

/** Snapshot of a pengguna's izin + pembatasan slugs for display. */
export interface AksesPenggunaView {
  readonly izin: readonly string[];
  readonly pembatasan: readonly string[];
}

// --- small inline forms (each posts ONE slug to its action) -----------------

/**
 * Link (or unlink) a pengguna to a PTK. The select defaults to the current link
 * or "Tidak terhubung"; submitting an empty value unlinks (action treats empty
 * ptkId as null).
 */
export function FormLinkPtk({
  penggunaId,
  ptks,
  currentPtkId,
  action,
}: {
  penggunaId: string;
  ptks: readonly Ptk[];
  currentPtkId: string | null;
  action: ServerAksi;
}) {
  return (
    <form
      action={action}
      aria-label="Tautan PTK"
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="penggunaId" value={penggunaId} />
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`link-${penggunaId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          <Link2 className="h-3 w-3" aria-hidden="true" />
          Tautan PTK
        </label>
        <select
          id={`link-${penggunaId}`}
          name="ptkId"
          defaultValue={currentPtkId ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Tidak terhubung</option>
          {ptks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" variant="outline">
        Simpan
      </Button>
    </form>
  );
}

/**
 * Izin grant matrix — one server form per IzinSlug. Each form carries a hidden
 * `slug`; the `aktif` checkbox toggles the grant (action reads
 * `formData.get("aktif") === "on"`).
 */
export function FormAturIzin({
  penggunaId,
  izin,
  action,
}: {
  penggunaId: string;
  izin: readonly string[];
  action: ServerAksi;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Izin Akses
      </legend>
      {DAFTAR_IZIN.map((slug) => (
        <form
          key={slug}
          action={action}
          className="flex items-center gap-2"
          aria-label={`Izin ${slug}`}
        >
          <input type="hidden" name="penggunaId" value={penggunaId} />
          <input type="hidden" name="slug" value={slug} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="aktif"
              defaultChecked={izin.includes(slug)}
              aria-label={`izin-${slug}`}
              className="h-4 w-4 rounded border-input accent-accent"
            />
            {labelIzin(slug)}
          </label>
          <Button type="submit" size="sm" variant="ghost">
            Simpan
          </Button>
        </form>
      ))}
    </fieldset>
  );
}

/**
 * Pembatasan matrix — one server form per IzinSlug, each carrying an optional
 * `alasan`. Mirrors {@linkcode FormAturIzin}; the hard-deny always wins
 * (identity doc §13).
 */
export function FormAturPembatasan({
  penggunaId,
  pembatasan,
  action,
}: {
  penggunaId: string;
  pembatasan: readonly string[];
  action: ServerAksi;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-destructive">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        Pembatasan Akses
      </legend>
      {DAFTAR_IZIN.map((slug) => (
        <form
          key={slug}
          action={action}
          className="flex flex-wrap items-center gap-2"
          aria-label={`Pembatasan ${slug}`}
        >
          <input type="hidden" name="penggunaId" value={penggunaId} />
          <input type="hidden" name="slug" value={slug} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="aktif"
              defaultChecked={pembatasan.includes(slug)}
              aria-label={`pembatasan-${slug}`}
              className="h-4 w-4 rounded border-input accent-destructive"
            />
            {labelIzin(slug)}
          </label>
          <input
            type="text"
            name="alasan"
            placeholder="Alasan"
            aria-label="Alasan"
            className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm shadow-sm ring-offset-background transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <Button type="submit" size="sm" variant="ghost">
            Simpan
          </Button>
        </form>
      ))}
    </fieldset>
  );
}

// --- the list ---------------------------------------------------------------

/**
 * Read-only or manageable list of Pengguna in the active Satuan Pendidikan.
 * Shows userId, peranAkses, and the linked PTK name (or "Tidak terhubung").
 * When `bolehKelola`, renders the link / izin / pembatasan management forms per
 * pengguna; otherwise purely informational (kepala_sekolah).
 */
export function DaftarPengguna({
  penggunas,
  bolehKelola,
  linkAction,
  ptks,
  aksesMap,
  aturIzinAction,
  aturPembatasanAction,
}: {
  penggunas: readonly PenggunaDenganPtk[];
  bolehKelola: boolean;
  linkAction: ServerAksi;
  ptks: readonly Ptk[];
  aksesMap: ReadonlyMap<string, AksesPenggunaView>;
  aturIzinAction: ServerAksi;
  aturPembatasanAction: ServerAksi;
}) {
  if (penggunas.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Belum ada Pengguna.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {penggunas.map((pengguna) => {
        const akses = aksesMap.get(pengguna.id) ?? { izin: [], pembatasan: [] };
        return (
          <li key={pengguna.id}>
            <CardHover className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-warm hover:border-accent/40 md:p-5">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {pengguna.nama ? pengguna.nama : pengguna.userId}
                </span>
                <span className="text-xs text-muted-foreground">
                  Peran Akses: {pengguna.peranAkses}
                </span>
                <span className="text-xs text-muted-foreground">
                  Tautan PTK:{" "}
                  {pengguna.ptk ? (
                    pengguna.ptk.nama
                  ) : (
                    <span className="italic">Tidak terhubung</span>
                  )}
                </span>
              </div>

              {bolehKelola && (
                <div className="flex flex-col gap-4 border-t border-border/60 pt-3">
                  <FormLinkPtk
                    penggunaId={pengguna.id}
                    ptks={ptks}
                    currentPtkId={pengguna.ptkId}
                    action={linkAction}
                  />
                  <FormAturIzin
                    penggunaId={pengguna.id}
                    izin={akses.izin}
                    action={aturIzinAction}
                  />
                  <FormAturPembatasan
                    penggunaId={pengguna.id}
                    pembatasan={akses.pembatasan}
                    action={aturPembatasanAction}
                  />
                </div>
              )}
            </CardHover>
          </li>
        );
      })}
    </ul>
  );
}
