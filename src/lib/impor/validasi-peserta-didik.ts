/**
 * Impor/Ekspor Peserta Didik — pure validation + CSV formatting (no DB I/O).
 *
 * The {@linkcode BarisCsv} shape is the canonical parsed-row contract shared
 * with {@linkcode ./parse-csv}. Pure functions only: validation, duplicate
 * detection, template generation, and export formatting. All DB interaction
 * lives in the T6 server-action layer (`impor-peserta-didik/actions.ts`).
 */

/**
 * A single parsed CSV row destined for a peserta_didik insert. `nama`,
 * `tanggalLahir`, and `jenisKelamin` are required; `nisn`/`nis` are optional.
 * Field names mirror {@linkcode InputBuatPesertaDidik}.
 */
export interface BarisCsv {
  readonly nama: string;
  readonly nisn?: string;
  readonly nis?: string;
  readonly tanggalLahir: string;
  readonly jenisKelamin: string;
}

/** NISN is exactly 8 digits when present (mirrors the T6 action's NISN_RE). */
const NISN_RE = /^\d{8}$/;

/** Result of validating a row within a batch, with its CSV line number. */
export interface HasilValidasiBaris {
  /** 1-based CSV line number (header = line 1, first data row = line 2). */
  readonly baris: number;
  readonly data: BarisCsv;
  readonly status: "valid" | "tidak_valid" | "perlu_koreksi";
  /** Bahasa error / koreksi messages (empty when status === 'valid'). */
  readonly errors: readonly string[];
}

/**
 * Validate a single row's fields (pure; no DB I/O, no duplicate detection).
 * Rules: `nama` required; `tanggalLahir` parses as a date; `jenisKelamin` is
 * strictly `L` or `P`; `nisn` (when present) is exactly 8 digits; `nis` is free
 * text. Returns `{ valid, errors }` with all field errors collected at once.
 */
export function validasiBaris(baris: BarisCsv): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (baris.nama.trim() === "") {
    errors.push("Nama wajib diisi.");
  }

  if (baris.tanggalLahir.trim() === "" || Number.isNaN(Date.parse(baris.tanggalLahir))) {
    errors.push("Tanggal lahir tidak valid.");
  }

  if (baris.jenisKelamin !== "L" && baris.jenisKelamin !== "P") {
    errors.push("Jenis kelamin harus 'L' atau 'P'.");
  }

  if (baris.nisn !== undefined && baris.nisn !== "" && !NISN_RE.test(baris.nisn)) {
    errors.push("NISN harus 8 digit angka.");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a batch: per-row field validation + duplicate detection (AC#2 — catch
 * potential duplicates before save). Duplicates are marked `perlu_koreksi`, not
 * `tidak_valid`, so the caller can offer correction rather than a hard reject.
 *
 * Duplicate sources:
 *   - NISN/NIS appearing twice WITHIN the file.
 *   - NISN/NIS matching a value already in `existingNisn` / `existingNis`.
 *
 * A row that is both field-invalid AND a duplicate is reported `tidak_valid`
 * (the hard field error wins — there's no point flagging a duplicate on a row
 * that can't be inserted anyway). Rows missing nisn/nis never collide.
 *
 * @param existingNisn  NISN values already present in the active tenant.
 * @param existingNis   NIS values already present in the active tenant.
 */
export function validasiBatch(
  baris: readonly BarisCsv[],
  existingNisn: readonly string[],
  existingNis: readonly string[]
): HasilValidasiBaris[] {
  const existingNisnSet = new Set(existingNisn);
  const existingNisSet = new Set(existingNis);

  // First pass: count NISN/NIS occurrences WITHIN the file (undefined skipped).
  const nisnCount = new Map<string, number>();
  const nisCount = new Map<string, number>();
  for (const row of baris) {
    const n = row.nisn;
    if (n !== undefined && n !== "") nisnCount.set(n, (nisnCount.get(n) ?? 0) + 1);
    const m = row.nis;
    if (m !== undefined && m !== "") nisCount.set(m, (nisCount.get(m) ?? 0) + 1);
  }

  return baris.map((row, i) => {
    // Line number: header is CSV line 1, so the i-th data row is line i+2.
    const lineNo = i + 2;
    const { valid, errors } = validasiBaris(row);

    const correctionErrors: string[] = [];
    const n = row.nisn;
    if (n !== undefined && n !== "") {
      if (nisnCount.get(n)! > 1) {
        correctionErrors.push("NISN muncul lebih dari sekali dalam berkas.");
      } else if (existingNisnSet.has(n)) {
        correctionErrors.push("NISN sudah dipakai oleh Peserta Didik lain.");
      }
    }
    const m = row.nis;
    if (m !== undefined && m !== "") {
      if (nisCount.get(m)! > 1) {
        correctionErrors.push("NIS muncul lebih dari sekali dalam berkas.");
      } else if (existingNisSet.has(m)) {
        correctionErrors.push("NIS sudah dipakai oleh Peserta Didik lain.");
      }
    }

    // Hard field errors win; only otherwise-valid rows surface as corrections.
    if (!valid) {
      return { baris: lineNo, data: row, status: "tidak_valid", errors };
    }
    if (correctionErrors.length > 0) {
      return { baris: lineNo, data: row, status: "perlu_koreksi", errors: correctionErrors };
    }
    return { baris: lineNo, data: row, status: "valid", errors: [] };
  });
}

/** Canonical CSV column order used by both the import template and export. */
const KOLOM_CSV = ["nama", "nisn", "nis", "tanggalLahir", "jenisKelamin"] as const;

/**
 * Generate the import template CSV (AC#1). Returns the header row plus two
 * example data rows. The output round-trips through {@linkcode parseCsv}.
 */
export function generateTemplateCsv(): string {
  const header = KOLOM_CSV.join(",");
  const contoh = [
    ["Budi Santoso", "12345678", "NIS-001", "2010-05-15", "L"],
    ["Siti Aminah", "", "", "2011-03-20", "P"],
  ];
  const lines = [header, ...contoh.map((r) => r.map(escapeCsvField).join(","))];
  return lines.join("\n") + "\n";
}

/**
 * Format tenant-scoped Peserta Didik rows as export CSV (AC#4). The caller is
 * responsible for passing only the active tenant's rows — this function does no
 * scoping itself. Null nisn/nis become empty fields; fields with commas/quotes/
 * newlines are double-quoted per RFC 4180.
 */
export function formatEksporCsv(peserta: readonly PesertaDidikLike[]): string {
  const header = KOLOM_CSV.join(",");
  const lines = peserta.map((p) =>
    [
      p.nama,
      p.nisn ?? "",
      p.nis ?? "",
      p.tanggalLahir,
      p.jenisKelamin,
    ]
      .map(escapeCsvField)
      .join(",")
  );
  return [header, ...lines].join("\n") + "\n";
}

/**
 * Structural superset of PesertaDidik — only the export fields are read, so any
 * object shape with those fields works (avoids a hard dep on the schema type
 * for this pure module).
 */
interface PesertaDidikLike {
  readonly nama: string;
  readonly nisn: string | null;
  readonly nis: string | null;
  readonly tanggalLahir: string;
  readonly jenisKelamin: string;
}

/** Quote/escape a single CSV field per RFC 4180 when it needs quoting. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
