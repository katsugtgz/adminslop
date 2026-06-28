/**
 * One-shot evidence generator for Task 14. Builds a realistic E-Raport PDF via
 * the production `buildMinimalPdf` and writes it to
 * `.omo/evidence/task-14-export.pdf`. Not part of the test suite — invoked
 * ad-hoc via `npx tsx scripts/gen-task-14-evidence.ts`.
 *
 * Usage: `npx tsx scripts/gen-task-14-evidence.ts`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildMinimalPdf, type BarisPdf } from "../src/lib/pdf/minimal-pdf";

const baris: BarisPdf[] = [
  { teks: "E-Raport (Pratinjau Cetak)", gaya: "label" },
  { teks: "" },
  { teks: "NPSN: 12345678" },
  { teks: "Alamat: Jl. Contoh No. 1, Jakarta" },
  { teks: "Peserta Didik: Ahmad Budi Santoso (VIII-A)" },
  { teks: "Semester: 2024/1 (Ganjil)" },
  { teks: "Status: terbit" },
  { teks: "Format: A4" },
  { teks: "" },
  { teks: "Mata Pelajaran:", gaya: "label" },
  { teks: "- Matematika: 92.5 (A) - Sangat baik" },
  { teks: "- Bahasa Indonesia: 88.0 (B+) - Baik" },
  { teks: "- IPA Terpadu: 90.0 (A) - Sangat baik" },
  { teks: "- IPS Terpadu: 85.5 (B+) - Baik" },
  { teks: "" },
  { teks: "Kehadiran: Sakit 1 / Izin 0 / Alpa 0" },
  { teks: "Ekstrakurikuler: Pramuka (Penegak)" },
  { teks: "" },
  { teks: "Catatan Wali Kelas:", gaya: "label" },
  { teks: "Menunjukkan kemajuan yang konsisten semester ini." },
];

const bytes = buildMinimalPdf({
  judul: "SMP Negeri 1 Contoh",
  baris,
});

const outDir = path.resolve(process.cwd(), ".omo/evidence");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "task-14-export.pdf");
writeFileSync(outFile, bytes);

const dec = new TextDecoder();
const header = dec.decode(bytes.slice(0, 8));
const tail = dec.decode(bytes.slice(bytes.byteLength - 6));
console.log(`wrote ${outFile}`);
console.log(`bytes: ${bytes.byteLength}`);
console.log(`header: ${JSON.stringify(header)}`);
console.log(`tail:   ${JSON.stringify(tail)}`);
console.log(`> 1000 byte gate: ${bytes.byteLength > 1000 ? "PASS" : "FAIL"}`);
