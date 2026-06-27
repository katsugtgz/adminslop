#!/usr/bin/env node
/**
 * Contoh scraping Bank Soal dari situs pendidikan publik gratis memakai
 * firecrawl CLI, lalu menormalisasi markdown → butir_soal, dan menyimpan ke
 * fixtures/soal-firecrawl.json yang otomatis di-merge saat `npm run db:seed`.
 *
 * Pakai:
 *   1. export FIRECRAWL_API_KEY=fc-...   (dapatkan di firecrawl.dev)
 *   2. npm run db:seed:scrape            # scrape default URLs
 *   3. npm run db:seed                   # ingest fixture
 *
 * Atau URL sendiri:
 *   node src/db/seed/scrape-soal.mjs https://situs-soal.example/latihan
 *
 * Parser memakai heuristik sederhana (soal bernomor + opsi "A. ... B. ..." +
 * baris "Jawaban: X"). TIDAK sempurna — sesuaikan regex per-situs. Ini contoh
 * reproduksibel, bukan parser universal. Fixture bawaan sudah cukup untuk e2e.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "soal-firecrawl.json");

// Default: situs soal publik. Ganti dengan URL yang Anda miliki izin scrape.
const DEFAULT_URLS = [
  // Contoh placeholder — ISI dengan URL soal publik yang boleh di-scrape.
  // "https://situs-soal-publik.example/matematika-kelas-7",
];

const API_KEY = process.env.FIRECRAWL_API_KEY;
const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_URLS;

if (!API_KEY) {
  console.error(
    "[scrape-soal] FIRECRAWL_API_KEY belum diset.\n" +
      "Dapatkan key di https://firecrawl.dev lalu:\n" +
      "  export FIRECRAWL_API_KEY=fc-...\n" +
      "Fixture bawaan (soal-firecrawl.json) sudah cukup untuk e2e tanpa scrape.",
  );
  process.exit(0); // bukan error — seed tetap jalan pakai fixture bawaan.
}
if (urls.length === 0) {
  console.error(
    "[scrape-soal] Tidak ada URL. Isi DEFAULT_URLS atau kirim URL sebagai argumen.",
  );
  process.exit(0);
}

/**
 * Scrape satu URL ke markdown via firecrawl CLI. Kembalikan string markdown.
 */
function scrapeMarkdown(url) {
  const out = execFileSync(
    "firecrawl",
    ["scrape", url, "-f", "markdown", "--only-main-content"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  // CLI format tunggal → raw markdown langsung ke stdout.
  return out;
}

/**
 * Heuristik parse markdown → ButirSeed[]. Deteksi blok:
 *   <nomor>. <pertanyaan>
 *   A. <opsi>
 *   B. <opsi>
 *   ...
 *   Jawaban: <huruf>
 */
function parseMarkdown(md, url) {
  const out = [];
  const lines = md.split("\n");
  let cur = null;
  const push = () => {
    if (cur && cur.pertanyaan) out.push(cur);
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Soal baru: "1." / "1)" / "Soal 1."
    const q = line.match(/^(\d+)[.)]\s+(.+)$/i);
    if (q && !/^[A-E][.)]/i.test(line)) {
      push();
      cur = {
        _sumber: "firecrawl",
        _url: url,
        mapelKode: "MTK",
        jenis: "pg",
        pertanyaan: q[2],
        pilihan: {},
        kunciJawaban: "",
      };
      continue;
    }
    if (!cur) continue;
    // Opsi: "A. teks"
    const opt = line.match(/^([A-E])[.)]\s+(.+)$/);
    if (opt) {
      cur.pilihan[opt[1]] = opt[2];
      continue;
    }
    // Kunci: "Jawaban: B" / "Kunci: B"
    const key = line.match(/^(jawaban|kunci)\s*[:=]\s*([A-E])/i);
    if (key) {
      cur.kunciJawaban = key[2].toUpperCase();
      continue;
    }
    // Pembahasan: baris setelah "Pembahasan:"
    const expl = line.match(/^pembahasan\s*[:=]\s*(.+)$/i);
    if (expl) {
      cur.pembahasan = expl[1];
      continue;
    }
  }
  push();
  // Hanya simpan yang valid (ada opsi + kunci).
  return out.filter(
    (b) => b.jenis === "pg" && Object.keys(b.pilihan).length >= 2 && b.kunciJawaban,
  );
}

// Main
let existing = [];
if (existsSync(FIXTURE)) {
  try {
    existing = JSON.parse(readFileSync(FIXTURE, "utf8"));
  } catch {
    existing = [];
  }
}
const seen = new Set(existing.map((b) => (b.pertanyaan || "").trim().toLowerCase()));

let added = 0;
for (const url of urls) {
  let md;
  try {
    md = scrapeMarkdown(url);
  } catch (e) {
    console.error(`[scrape-soal] gagal scrape ${url}: ${e.message}`);
    continue;
  }
  const parsed = parseMarkdown(md, url);
  for (const b of parsed) {
    const k = b.pertanyaan.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    existing.push(b);
    added++;
  }
  console.log(`[scrape-soal] ${url}: +${parsed.length} kandidat`);
}

writeFileSync(FIXTURE, JSON.stringify(existing, null, 2) + "\n", "utf8");
console.log(`[scrape-soal] total fixture: ${existing.length} (+${added} baru) → ${FIXTURE}`);
