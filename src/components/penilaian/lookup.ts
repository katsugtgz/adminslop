import type {
  BebanMengajar,
  KomponenNilai,
  MataPelajaran,
  NilaiPesertaDidik,
  Penilaian,
  PesertaDidik,
  Ptk,
  RombonganBelajar,
  Tingkat,
} from "@/db/schema";
import type { Semester } from "@/db/queries/beban-mengajar";

import type { NilaiExisting } from "./form-nilai";

/**
 * Satu baris Beban Mengajar yang sudah diresolusi menjadi nama-nama tampilan
 * (PTK, Mata Pelajaran, target Rombongan Belajar / Tingkat). Dipakai untuk
 * daftar Beban Mengajar dan breadcrumb.
 */
export interface BarisBeban {
  readonly id: string;
  readonly ptkNama: string;
  readonly mataPelajaranNama: string;
  readonly targetNama: string;
}

/**
 * Bentuk data hasil `withTenant` yang dipakai oleh lookup. Hanya memuat field
 * yang dibutuhkan untuk resolusi nama; field lain (taAktif, nilaiAkhir) tetap
 * diakses langsung oleh page.
 */
export interface DataPenilaian {
  readonly semester: Semester | null;
  readonly beban: readonly BebanMengajar[];
  readonly ptks: readonly Ptk[];
  readonly mapel: readonly MataPelajaran[];
  readonly rombels: readonly RombonganBelajar[];
  readonly tingkats: readonly Tingkat[];
  readonly komponen: readonly KomponenNilai[];
  readonly penilaian: readonly Penilaian[];
  readonly peserta: readonly PesertaDidik[];
  readonly nilaiRows: readonly NilaiPesertaDidik[];
}

/**
 * Bentuk `searchParams` Manajemen Penilaian (progressive disclosure).
 */
export interface SearchParamsPenilaian {
  readonly bebanId?: string;
  readonly komponenId?: string;
  readonly penilaianId?: string;
}

/**
 * Hasil lookup: peta nama, baris Beban Mengajar yang siap ditampilkan,
 * nilai yang sudah diprefill, baris/komponen/penilaian terpilih (driven by
 * `searchParams`), label Semester, dan flag tampil-breadcrumb.
 */
export interface LookupPenilaian {
  readonly barisBeban: readonly BarisBeban[];
  readonly pesertaNama: ReadonlyMap<string, string>;
  readonly nilaiMap: ReadonlyMap<string, NilaiExisting>;
  readonly bebanTerpilih: BarisBeban | undefined;
  readonly komponenTerpilih: KomponenNilai | undefined;
  readonly penilaianTerpilih: Penilaian | undefined;
  readonly labelSemester: string;
  readonly tampilkanBreadcrumb: boolean;
}

/**
 * Membangun seluruh lookup tampilan Manajemen Penilaian dari data tenant +
 * searchParams. Pure function — tidak menyentuh DB atau mengubah state.
 *
 * Tenant scope sudah dipegang oleh `data` (diresolusi di dalam `withTenant`,
 * lihat identity doc §13). Tidak ada input klien yang dipercaya di sini.
 */
export function bangunLookupPenilaian(
  data: DataPenilaian,
  sp: SearchParamsPenilaian,
): LookupPenilaian {
  const ptkNama = new Map(data.ptks.map((p) => [p.id, p.nama]));
  const mapelNama = new Map(data.mapel.map((m) => [m.id, m.nama]));
  const rombelNama = new Map(data.rombels.map((r) => [r.id, r.nama]));
  const tingkatNama = new Map(data.tingkats.map((t) => [t.id, t.nama]));
  const pesertaNama = new Map(data.peserta.map((p) => [p.id, p.nama]));
  const nilaiMap = new Map<string, NilaiExisting>(
    data.nilaiRows.map((n) => [
      n.pesertaDidikId,
      { nilai: n.nilai, catatan: n.catatan },
    ]),
  );

  const barisBeban: BarisBeban[] = data.beban.map((b) => ({
    id: b.id,
    ptkNama: ptkNama.get(b.ptkId) ?? "—",
    mataPelajaranNama: mapelNama.get(b.mataPelajaranId) ?? "—",
    targetNama: b.rombonganBelajarId
      ? rombelNama.get(b.rombonganBelajarId) ?? "—"
      : b.tingkatId
        ? tingkatNama.get(b.tingkatId) ?? "—"
        : "—",
  }));

  const bebanTerpilih = sp.bebanId
    ? barisBeban.find((b) => b.id === sp.bebanId)
    : undefined;
  const komponenTerpilih = sp.komponenId
    ? data.komponen.find((k) => k.id === sp.komponenId)
    : undefined;
  const penilaianTerpilih = sp.penilaianId
    ? data.penilaian.find((p) => p.id === sp.penilaianId)
    : undefined;

  const labelSemester = data.semester === "ganjil" ? "Ganjil" : "Genap";
  const tampilkanBreadcrumb = Boolean(
    bebanTerpilih || komponenTerpilih || penilaianTerpilih,
  );

  return {
    barisBeban,
    pesertaNama,
    nilaiMap,
    bebanTerpilih,
    komponenTerpilih,
    penilaianTerpilih,
    labelSemester,
    tampilkanBreadcrumb,
  };
}
