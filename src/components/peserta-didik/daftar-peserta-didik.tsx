import Link from "next/link";

import { Badge, type BadgeVariantProps } from "@/components/ui/badge";
import type { PesertaDidik } from "@/db/schema";

import { FormUbahStatus } from "./form-ubah-status";
import type { ServerAksi } from "./form-tambah";

/** Bahasa Indonesia month names (deterministic — no Intl ICU dependency). */
const BULAN_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/**
 * Format a birthdate as a locale-appropriate (Bahasa Indonesia) string, e.g.
 * `15 Mei 2010`. Accepts the Date or ISO `YYYY-MM-DD` string that Drizzle's
 * `date()` column yields. Date-only strings are parsed in LOCAL time (not UTC)
 * so a stored `2010-05-15` never shifts to the previous day across timezones.
 */
function formatTanggalLahir(value: string | Date): string {
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else {
    const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    d = parts
      ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
      : new Date(value);
  }
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/** Bahasa label for a jenis_kelamin slug (L / P). */
function labelJenisKelamin(slug: string): string {
  return slug === "P" ? "Perempuan" : "Laki-laki";
}

/** Bahasa label for a status slug (aktif / pindah / lulus / keluar). */
function labelStatus(slug: string): string {
  switch (slug) {
    case "aktif":
      return "Aktif";
    case "pindah":
      return "Pindah";
    case "lulus":
      return "Lulus";
    case "keluar":
      return "Keluar";
    default:
      return slug;
  }
}

/** Badge variant for a status slug, using semantic design tokens. */
function variantStatus(status: string): NonNullable<BadgeVariantProps["variant"]> {
  switch (status) {
    case "aktif":
      return "success";
    case "lulus":
      return "accent";
    case "pindah":
      return "warning";
    case "keluar":
      return "destructive";
    default:
      return "secondary";
  }
}

/**
 * Read-only or manageable list of Peserta Didik in the active Satuan
 * Pendidikan. When `bolehTulis` is true each row renders its own server form
 * posting to `ubahStatusPesertaDidikAction`. When false
 * (guru / wali_kelas / kepala_sekolah), no forms render — the list is purely
 * informational. Each row's nama links to the T8 detail page.
 */
export function DaftarPesertaDidik({
  peserta,
  bolehTulis,
  ubahStatusAction,
}: {
  peserta: readonly PesertaDidik[];
  bolehTulis: boolean;
  ubahStatusAction: ServerAksi;
}) {
  if (peserta.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Peserta Didik.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Nama</th>
            <th scope="col" className="px-4 py-3 font-medium">NISN</th>
            <th scope="col" className="px-4 py-3 font-medium">NIS</th>
            <th scope="col" className="px-4 py-3 font-medium">Tanggal Lahir</th>
            <th scope="col" className="px-4 py-3 font-medium">Jenis Kelamin</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            {bolehTulis && (
              <th scope="col" className="px-4 py-3 font-medium">Aksi</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {peserta.map((pd) => (
            <tr key={pd.id} className="align-top">
              <td className="px-4 py-3 font-medium">
                <Link
                  href={`/dashboard/peserta-didik/${pd.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {pd.nama}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {pd.nisn ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {pd.nis ?? "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatTanggalLahir(pd.tanggalLahir)}
              </td>
              <td className="px-4 py-3">{labelJenisKelamin(pd.jenisKelamin)}</td>
              <td className="px-4 py-3">
                <Badge variant={variantStatus(pd.status)}>
                  {labelStatus(pd.status)}
                </Badge>
              </td>
              {bolehTulis && (
                <td className="px-4 py-3">
                  <FormUbahStatus
                    action={ubahStatusAction}
                    pesertaId={pd.id}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
