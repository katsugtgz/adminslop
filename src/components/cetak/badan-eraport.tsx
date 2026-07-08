import type { ReactNode } from "react";

/**
 * Badan E-Raport — resilient structured renderer for the E-Raport `konten`
 * jsonb payload (AC#1 snapshot). Replaces the previous
 * `<pre>{JSON.stringify(konten)}</pre>` dumps in both the print preview and
 * the detail view with a polished, Bahasa-Indonesia report body.
 *
 * The parser is defensive: every field is read through a type guard, missing
 * fields are skipped (not crashed on), and a fully unrecognised shape renders
 * a human-readable fallback message — never raw JSON.
 *
 * Two presentational variants share one parser:
 *  - `cetak`: print-ready (slate palette, bordered table) — used by
 *    {@linkcode PratinjauEraport}.
 *  - `layar`: screen view (semantic theme tokens) — used by
 *    {@linkcode DetailEraport}.
 */

// ---------------------------------------------------------------------------
// Parsed shape
// ---------------------------------------------------------------------------

export interface PesertaDidikEraport {
  readonly nama: string | null;
  readonly nisn: string | null;
  readonly kelas: string | null;
}

export interface MataPelajaranEraport {
  readonly nama: string | null;
  readonly nilai: number | null;
  readonly predikat: string | null;
  readonly catatan: string | null;
}

export interface KehadiranEraport {
  readonly sakit: number | null;
  readonly izin: number | null;
  readonly alpa: number | null;
}

export interface BadanEraport {
  readonly pesertaDidik: PesertaDidikEraport;
  readonly mataPelajaran: readonly MataPelajaranEraport[];
  readonly ekstrakurikuler: string | null;
  readonly kehadiran: KehadiranEraport;
  readonly catatanWaliKelas: string | null;
  /** True when no recognised E-Raport field is present (unknown shape). */
  readonly tidakDikenali: boolean;
}

// ---------------------------------------------------------------------------
// Type guards / coercions (pure, no casts on unknown input)
// ---------------------------------------------------------------------------

function sebagaiObjek(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function sebagaiArray(v: unknown): readonly unknown[] {
  return Array.isArray(v) ? v : [];
}

function sebagaiString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function sebagaiAngka(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parsePesertaDidik(v: unknown): PesertaDidikEraport {
  const o = sebagaiObjek(v);
  if (o === null) {
    return { nama: null, nisn: null, kelas: null };
  }
  return {
    nama: sebagaiString(o.nama),
    nisn: sebagaiString(o.nisn),
    kelas: sebagaiString(o.kelas),
  };
}

function parseMataPelajaran(v: unknown): readonly MataPelajaranEraport[] {
  return sebagaiArray(v)
    .map((item) => {
      const o = sebagaiObjek(item);
      if (o === null) return null;
      const mp: MataPelajaranEraport = {
        nama: sebagaiString(o.nama),
        nilai: sebagaiAngka(o.nilai),
        predikat: sebagaiString(o.predikat),
        catatan: sebagaiString(o.catatan),
      };
      // Skip rows that carry no usable payload at all.
      if (
        mp.nama === null &&
        mp.nilai === null &&
        mp.predikat === null &&
        mp.catatan === null
      ) {
        return null;
      }
      return mp;
    })
    .filter((m): m is MataPelajaranEraport => m !== null);
}

function parseKehadiran(v: unknown): KehadiranEraport {
  const o = sebagaiObjek(v);
  if (o === null) {
    return { sakit: null, izin: null, alpa: null };
  }
  return {
    sakit: sebagaiAngka(o.sakit),
    izin: sebagaiAngka(o.izin),
    alpa: sebagaiAngka(o.alpa),
  };
}

/**
 * Parse an E-Raport `konten` jsonb payload into a typed, render-ready shape.
 * Accepts `unknown` so callers do not need to cast Drizzle/jsonb values.
 * Never throws — malformed input degrades to a `tidakDikenali` body.
 */
export function parseBadanEraport(konten: unknown): BadanEraport {
  const o = sebagaiObjek(konten);
  if (o === null) {
    return {
      pesertaDidik: parsePesertaDidik(null),
      mataPelajaran: [],
      ekstrakurikuler: null,
      kehadiran: parseKehadiran(null),
      catatanWaliKelas: null,
      tidakDikenali: true,
    };
  }

  const pesertaDidik = parsePesertaDidik(o.peserta_didik);
  const mataPelajaran = parseMataPelajaran(o.mata_pelajaran);
  const ekstrakurikuler = sebagaiString(o.ekstrakurikuler);
  const kehadiran = parseKehadiran(o.kehadiran);
  const catatanWaliKelas = sebagaiString(o.catatan_wali_kelas);

  const adaPeserta = pesertaDidik.nama ?? pesertaDidik.nisn ?? pesertaDidik.kelas;
  const adaKehadiran =
    kehadiran.sakit ?? kehadiran.izin ?? kehadiran.alpa;
  const tidakDikenali =
    adaPeserta === null &&
    mataPelajaran.length === 0 &&
    ekstrakurikuler === null &&
    adaKehadiran === null &&
    catatanWaliKelas === null;

  return {
    pesertaDidik,
    mataPelajaran,
    ekstrakurikuler,
    kehadiran,
    catatanWaliKelas,
    tidakDikenali,
  };
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/**
 * Format a nilai for display. Uses plain decimal (`.` separator) so the value
 * is unambiguous in both screen and print contexts; intentionally NOT localised
 * to `id-ID` (which would emit `92,5`) to keep the numeric value legible and
 * copy-paste stable.
 */
function formatNilai(n: number): string {
  return String(n);
}

// ---------------------------------------------------------------------------
// Presentation — variant-aware class bundles
// ---------------------------------------------------------------------------

type Varian = "cetak" | "layar";

interface KelasBadan {
  readonly bingkai: string;
  readonly judulBagian: string;
  readonly pasanganLabel: string;
  readonly label: string;
  readonly nilai: string;
  readonly bingkaiCatatan: string;
  readonly tabel: string;
  readonly th: string;
  readonly td: string;
  readonly kehadiranBungkus: string;
  readonly kehadiranItem: string;
  readonly fallback: string;
}

const KELAS_CETAK: KelasBadan = {
  bingkai: "flex flex-col gap-4",
  judulBagian:
    "text-[0.7rem] font-semibold uppercase tracking-wide text-slate-700",
  pasanganLabel: "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6",
  label: "text-slate-600",
  nilai: "font-medium text-slate-900",
  bingkaiCatatan: "rounded-sm border border-slate-200 bg-slate-50 p-3",
  tabel: "w-full border-collapse text-sm",
  th: "border border-slate-400 bg-slate-100 px-2 py-1 text-left font-semibold text-slate-800",
  td: "border border-slate-400 px-2 py-1 align-top text-slate-900",
  kehadiranBungkus: "flex flex-wrap gap-x-6 gap-y-1",
  kehadiranItem: "text-slate-900",
  fallback: "rounded-sm border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600",
};

const KELAS_LAYAR: KelasBadan = {
  bingkai: "flex flex-col gap-3",
  judulBagian:
    "eyebrow text-muted-foreground",
  pasanganLabel: "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6",
  label: "text-muted-foreground",
  nilai: "font-medium text-foreground",
  bingkaiCatatan: "rounded-lg bg-muted/40 p-3",
  tabel: "w-full border-collapse text-sm",
  th: "border border-border bg-muted/40 px-2 py-1 text-left font-semibold text-foreground",
  td: "border border-border px-2 py-1 align-top text-foreground",
  kehadiranBungkus: "flex flex-wrap gap-x-6 gap-y-1",
  kehadiranItem: "text-foreground",
  fallback:
    "rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground",
};

function kelasUntuk(varian: Varian): KelasBadan {
  return varian === "cetak" ? KELAS_CETAK : KELAS_LAYAR;
}

// ---------------------------------------------------------------------------
// Sub-renderers
// ---------------------------------------------------------------------------

function PasanganLabel({
  label,
  nilai,
  k,
}: {
  label: string;
  nilai: ReactNode;
  k: KelasBadan;
}) {
  if (nilai === null || nilai === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={k.label}>{label}</span>
      <span className={k.nilai}>{nilai}</span>
    </div>
  );
}

function BagianIdentitas({
  pd,
  k,
}: {
  pd: PesertaDidikEraport;
  k: KelasBadan;
}) {
  if (pd.nama === null && pd.nisn === null && pd.kelas === null) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className={k.judulBagian}>Identitas Peserta Didik</span>
      <div className={k.pasanganLabel}>
        <PasanganLabel label="Nama" nilai={pd.nama} k={k} />
        <PasanganLabel label="NISN" nilai={pd.nisn} k={k} />
        <PasanganLabel label="Kelas" nilai={pd.kelas} k={k} />
      </div>
    </div>
  );
}

function BagianMataPelajaran({
  daftar,
  k,
}: {
  daftar: readonly MataPelajaranEraport[];
  k: KelasBadan;
}) {
  if (daftar.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className={k.judulBagian}>Mata Pelajaran</span>
      <table className={k.tabel}>
        <thead>
          <tr>
            <th scope="col" className={`${k.th} w-8 text-center`}>
              No
            </th>
            <th scope="col" className={k.th}>
              Mata Pelajaran
            </th>
            <th scope="col" className={`${k.th} text-center`}>
              Nilai
            </th>
            <th scope="col" className={`${k.th} text-center`}>
              Predikat
            </th>
            <th scope="col" className={k.th}>
              Catatan
            </th>
          </tr>
        </thead>
        <tbody>
          {daftar.map((mp, i) => (
            <tr key={mp.nama ?? `baris-${i + 1}`}>
              <td className={`${k.td} text-center`}>{i + 1}</td>
              <td className={k.td}>{mp.nama ?? "—"}</td>
              <td className={`${k.td} text-center`}>
                {mp.nilai !== null ? formatNilai(mp.nilai) : "—"}
              </td>
              <td className={`${k.td} text-center`}>
                {mp.predikat ?? "—"}
              </td>
              <td className={k.td}>{mp.catatan ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BagianKehadiran({
  kh,
  k,
}: {
  kh: KehadiranEraport;
  k: KelasBadan;
}) {
  if (kh.sakit === null && kh.izin === null && kh.alpa === null) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className={k.judulBagian}>Kehadiran</span>
      <div className={k.kehadiranBungkus}>
        <span className={k.kehadiranItem}>
          <span className={k.label}>Sakit: </span>
          {kh.sakit ?? "—"}
        </span>
        <span className={k.kehadiranItem}>
          <span className={k.label}>Izin: </span>
          {kh.izin ?? "—"}
        </span>
        <span className={k.kehadiranItem}>
          <span className={k.label}>Alpa: </span>
          {kh.alpa ?? "—"}
        </span>
      </div>
    </div>
  );
}

function BagianEkstrakurikuler({
  nilai,
  k,
}: {
  nilai: string | null;
  k: KelasBadan;
}) {
  if (nilai === null) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className={k.judulBagian}>Ekstrakurikuler</span>
      <p className={k.nilai}>{nilai}</p>
    </div>
  );
}

function BagianCatatanWali({
  nilai,
  k,
}: {
  nilai: string | null;
  k: KelasBadan;
}) {
  if (nilai === null) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className={k.judulBagian}>Catatan Wali Kelas</span>
      <p className={`${k.bingkaiCatatan} text-sm leading-relaxed`}>{nilai}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * Render the E-Raport `konten` payload as a structured Bahasa-Indonesia
 * report body. Resilient to missing fields and unknown shapes.
 *
 * @param konten  the raw jsonb payload (typed `unknown` — no caller cast needed)
 * @param varian  `cetak` for print-ready output, `layar` for on-screen detail
 */
export function BadanEraport({
  konten,
  varian,
}: {
  konten: unknown;
  varian: Varian;
}) {
  const badan = parseBadanEraport(konten);
  const k = kelasUntuk(varian);

  if (badan.tidakDikenali) {
    return (
      <div className={k.bingkai}>
        <p className={k.fallback}>
          Konten laporan ini tidak menggunakan struktur E-Raport yang dikenali,
          sehingga tidak dapat ditampilkan dalam format baku.
        </p>
      </div>
    );
  }

  return (
    <div className={k.bingkai}>
      <BagianIdentitas pd={badan.pesertaDidik} k={k} />
      <BagianMataPelajaran daftar={badan.mataPelajaran} k={k} />
      <BagianKehadiran kh={badan.kehadiran} k={k} />
      <BagianEkstrakurikuler nilai={badan.ekstrakurikuler} k={k} />
      <BagianCatatanWali nilai={badan.catatanWaliKelas} k={k} />
    </div>
  );
}
