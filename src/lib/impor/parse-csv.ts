/**
 * Minimal RFC-4180-ish CSV parser — NO external dependency (no papaparse /
 * csv-parse). Handles quoted fields, commas and newlines inside quotes, and
 * escaped double-quotes (`""`). Returns {@linkcode BarisCsv}[] ready for
 * validation. Throws on malformed input (unclosed quote, missing header).
 */
import type { BarisCsv } from "./validasi-peserta-didik";

/** Canonical BarisCsv field names (the header-map target vocabulary). */
type NamaField = "nama" | "nisn" | "nis" | "tanggalLahir" | "jenisKelamin";

/**
 * Parse CSV content into {@linkcode BarisCsv} rows. The first line is the
 * header; each subsequent non-empty line is a data row. `headerMap` lets callers
 * translate human headers (e.g. "Nama") to canonical fields; unrecognized header
 * columns are ignored. Empty lines and rows with a blank `nama` are skipped.
 *
 * @throws when the content is empty, the header lacks a `nama` column, or a
 *   quoted field is never closed.
 */
export function parseCsv(
  content: string,
  headerMap?: Record<string, string>
): BarisCsv[] {
  const records = parseRecords(content);

  if (records.length === 0) {
    throw new Error("CSV tidak valid: tidak ada baris header.");
  }

  const columnIndex = buildColumnIndex(records[0], headerMap);
  if (columnIndex.nama === -1) {
    throw new Error("CSV tidak valid: kolom 'nama' wajib ada pada baris header.");
  }

  const out: BarisCsv[] = [];
  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    const nama = (cells[columnIndex.nama] ?? "").trim();
    // Emit any row that has SOME data — the validator flags a missing nama as
    // tidak_valid. Only fully-empty lines are dropped (in parseRecords).
    if (nama === "" && !rowHasOtherData(cells, columnIndex)) continue;

    out.push({
      nama,
      nisn: readOptional(cells, columnIndex.nisn),
      nis: readOptional(cells, columnIndex.nis),
      tanggalLahir: (cells[columnIndex.tanggalLahir] ?? "").trim(),
      jenisKelamin: (cells[columnIndex.jenisKelamin] ?? "").trim(),
    });
  }
  return out;
}

/** True iff any non-nama mapped column carries data (so the row is non-blank). */
function rowHasOtherData(
  cells: string[],
  columnIndex: ColumnIndex
): boolean {
  return (
    readOptional(cells, columnIndex.nisn) !== undefined ||
    readOptional(cells, columnIndex.nis) !== undefined ||
    (cells[columnIndex.tanggalLahir] ?? "").trim() !== "" ||
    (cells[columnIndex.jenisKelamin] ?? "").trim() !== ""
  );
}

/**
 * Split raw CSV text into a matrix of cell strings (records × fields). Handles
 * quoted fields, embedded commas/newlines, and `""` escapes. Throws on an
 * unterminated quote.
 */
function parseRecords(content: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let startedContent = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ("") -> literal ", else close the quoted field.
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    // not in quotes
    if (ch === '"') {
      inQuotes = true;
      startedContent = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      pushRow(records, row, field);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow standalone \r; \r\n handled by the \n branch
    } else {
      field += ch;
      startedContent = true;
    }
  }

  // Final field/row (no trailing newline).
  if (inQuotes) {
    throw new Error("CSV tidak valid: kutipan tidak ditutup.");
  }
  if (startedContent || row.length > 0 || field !== "") {
    pushRow(records, row, field);
  }

  return records;
}

/**
 * Push a completed row, dropping it entirely when it is effectively empty
 * (zero cells and empty field, or a single empty field). This is how blank
 * lines are skipped.
 */
function pushRow(records: string[][], row: string[], field: string): void {
  const next = [...row, field];
  // Drop a row that is all-empty (blank line / trailing newline artifact).
  const nonEmpty = next.some((c) => c !== "");
  if (nonEmpty) records.push(next);
}

interface ColumnIndex {
  nama: number;
  nisn: number;
  nis: number;
  tanggalLahir: number;
  jenisKelamin: number;
}

/**
 * Resolve each canonical field to its column index from the header. Applies
 * `headerMap` first (user header -> canonical field), then accepts canonical
 * names directly. Unknown headers are ignored (their columns simply are never
 * selected). `nama` missing yields -1 so the caller can throw a clear message.
 */
function buildColumnIndex(
  header: string[],
  headerMap?: Record<string, string>
): ColumnIndex {
  const lookup = (field: NamaField): number => {
    for (let i = 0; i < header.length; i++) {
      const raw = header[i].trim();
      if (headerMap && headerMap[raw] === field) return i;
    }
    for (let i = 0; i < header.length; i++) {
      if (header[i].trim() === field) return i;
    }
    return -1;
  };

  return {
    nama: lookup("nama"),
    nisn: lookup("nisn"),
    nis: lookup("nis"),
    tanggalLahir: lookup("tanggalLahir"),
    jenisKelamin: lookup("jenisKelamin"),
  };
}

/** Read an optional cell; returns undefined when absent or blank. */
function readOptional(cells: string[], index: number): string | undefined {
  if (index === -1) return undefined;
  const v = (cells[index] ?? "").trim();
  return v === "" ? undefined : v;
}
