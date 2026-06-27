import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import type { ButirSoalInsert } from "@/db/schema";

/**
 * Bank Soal seed. Butir soal faktual lintas jenis (pg/essay/isian/jodohkan/
 * benar_salah) + mapel. Konten faktual pendidikan (matematika/sains) — bukan
 * karya berhak cipta. Dirancang mengisi semua opsi form Bank Soal agar bisa
 * diuji UI/e2e.
 *
 * Bentuk field (skema bebas, konsisten internal):
 *  - pg:          pilihan = { A, B, C, D }, kunciJawaban = "B"
 *  - benar_salah: pilihan = null,           kunciJawaban = "Benar"|"Salah"
 *  - isian:       pilihan = null,           kunciJawaban = "<jawaban singkat>"
 *  - jodohkan:    pilihan = { pernyataan, pasangan }, kunciJawaban = "1-B,2-A"
 *  - essay:       pilihan = null,           kunciJawaban = "<rubrik/jawaban>"
 *
 * mataPelajaranId + tingkatId di-resolve pemanggil (kode mapel → id).
 */

export interface ButirSeed {
  mapelKode: string;
  tingkatUrutan?: number;
  jenis: ButirSoalInsert["jenis"];
  pertanyaan: string;
  pilihan?: unknown;
  kunciJawaban: string;
  pembahasan?: string;
}

export const BUTIR_SOAL: ButirSeed[] = [
  // ── Matematika · Pilihan Ganda ─────────────────────────────────────────
  {
    mapelKode: "MTK", tingkatUrutan: 7, jenis: "pg",
    pertanyaan: "Hasil dari 24 + 36 ÷ 4 × 3 adalah ...",
    pilihan: { A: "27", B: "42", C: "45", D: "51" },
    kunciJawaban: "D",
    pembahasan: "36 ÷ 4 = 9; 9 × 3 = 27; 24 + 27 = 51.",
  },
  {
    mapelKode: "MTK", tingkatUrutan: 7, jenis: "pg",
    pertanyaan: "Bentuk pecahan desimal dari 3/4 adalah ...",
    pilihan: { A: "0,25", B: "0,50", C: "0,75", D: "1,25" },
    kunciJawaban: "C",
    pembahasan: "3 ÷ 4 = 0,75.",
  },
  {
    mapelKode: "MTK", tingkatUrutan: 8, jenis: "pg",
    pertanyaan: "Nilai x pada persamaan 2x + 5 = 17 adalah ...",
    pilihan: { A: "4", B: "6", C: "8", D: "11" },
    kunciJawaban: "B",
    pembahasan: "2x = 12 → x = 6.",
  },
  {
    mapelKode: "MTK", tingkatUrutan: 9, jenis: "pg",
    pertanyaan: "Akar-akar persamaan x² − 5x + 6 = 0 adalah ...",
    pilihan: { A: "1 dan 6", B: "2 dan 3", C: "−2 dan −3", D: "−1 dan −6" },
    kunciJawaban: "B",
    pembahasan: "(x−2)(x−3)=0 → x=2 atau x=3.",
  },
  {
    mapelKode: "FIS", tingkatUrutan: 10, jenis: "pg",
    pertanyaan: "Sebuah benda bergerak dengan kecepatan 20 m/s selama 5 detik. Jarak tempuhnya adalah ...",
    pilihan: { A: "25 m", B: "50 m", C: "100 m", D: "200 m" },
    kunciJawaban: "C",
    pembahasan: "s = v × t = 20 × 5 = 100 m.",
  },

  // ── Matematika · Essay ─────────────────────────────────────────────────
  {
    mapelKode: "MTK", tingkatUrutan: 7, jenis: "essay",
    pertanyaan: "Sebuah toko memberi diskon 20% untuk barang seharga Rp150.000. Berapakah harga setelah diskon?",
    kunciJawaban: "Rp120.000. Diskon = 20% × 150.000 = 30.000; 150.000 − 30.000 = 120.000.",
  },
  {
    mapelKode: "FIS", tingkatUrutan: 10, jenis: "essay",
    pertanyaan: "Jelaskan perbedaan jarak dan perpindahan beserta satuannya dalam SI.",
    kunciJawaban: "Jarak = panjang lintasan total (skalar, meter). Perpindahan = perubahan posisi dari awal ke akhir (vektor, meter).",
  },

  // ── Matematika · Isian ─────────────────────────────────────────────────
  {
    mapelKode: "MTK", tingkatUrutan: 7, jenis: "isian",
    pertanyaan: "Hasil dari 15% dari 200 adalah ...",
    kunciJawaban: "30",
    pembahasan: "15/100 × 200 = 30.",
  },
  {
    mapelKode: "BIO", tingkatUrutan: 10, jenis: "isian",
    pertanyaan: "Organel sel yang berperan sebagai 'pembangkit tenaga' adalah ...",
    kunciJawaban: "mitokondria",
  },
  {
    mapelKode: "KIM", tingkatUrutan: 10, jenis: "isian",
    pertanyaan: "Rumus kimia untuk asam sulfat adalah ...",
    kunciJawaban: "H₂SO₄",
  },

  // ── Matematika · Benar/Salah ───────────────────────────────────────────
  {
    mapelKode: "MTK", tingkatUrutan: 8, jenis: "benar_salah",
    pertanyaan: "Pernyataan: Jika dua sudut bersebelahan saling berpelurus, jumlahnya 180°.",
    kunciJawaban: "Benar",
    pembahasan: "Definisi sudut berpelurus: jumlah = 180°.",
  },
  {
    mapelKode: "FIS", tingkatUrutan: 10, jenis: "benar_salah",
    pertanyaan: "Pernyataan: Percepatan gravitasi bumi sekitar 9,8 m/s².",
    kunciJawaban: "Benar",
  },
  {
    mapelKode: "MTK", tingkatUrutan: 7, jenis: "benar_salah",
    pertanyaan: "Pernyataan: Bilangan prima genap hanya ada satu, yaitu 2.",
    kunciJawaban: "Benar",
    pembahasan: "2 adalah satu-satunya bilangan prima genap.",
  },

  // ── Matematika · Jodohkan ──────────────────────────────────────────────
  {
    mapelKode: "MTK", tingkatUrutan: 7, jenis: "jodohkan",
    pertanyaan: "Jodohkan operasi hitung dengan hasilnya.",
    pilihan: {
      pernyataan: ["12 × 4", "100 ÷ 4", "7²", "15 + 28"],
      pasangan: ["25", "49", "48", "43"],
    },
    kunciJawaban: "1-C, 2-A, 3-B, 4-D",
    pembahasan: "12×4=48(C); 100÷4=25(A); 7²=49(B); 15+28=43(D).",
  },
  {
    mapelKode: "BIO", tingkatUrutan: 10, jenis: "jodohkan",
    pertanyaan: "Jodohkan organel dengan fungsinya.",
    pilihan: {
      pernyataan: ["Mitokondria", "Ribosom", "Kloroplas", "Inti sel"],
      pasangan: ["Tempat berlangsungnya fotosintesis", "Sintesis protein", "Pusat kendali sel", "Pembangkit tenaga sel"],
    },
    kunciJawaban: "1-D, 2-B, 3-A, 4-C",
  },

  // ── Bahasa Indonesia ───────────────────────────────────────────────────
  {
    mapelKode: "BIN", tingkatUrutan: 7, jenis: "pg",
    pertanyaan: "Sinonim dari kata 'rajin' adalah ...",
    pilihan: { A: "Malas", B: "Tekun", C: "Lambat", D: "Cepat" },
    kunciJawaban: "B",
  },
  {
    mapelKode: "BIN", tingkatUrutan: 8, jenis: "pg",
    pertanyaan: "Ide pokok sebuah paragraf biasanya terletak pada ...",
    pilihan: {
      A: "kalimat terakhir saja",
      B: "kalimat utama",
      C: "setiap kalimat",
      D: "judul saja",
    },
    kunciJawaban: "B",
  },
  {
    mapelKode: "BIN", tingkatUrutan: 7, jenis: "essay",
    pertanyaan: "Tulis sebuah kalimat persuasif yang mendorong teman untuk gemar membaca.",
    kunciJawaban: "Kalimat persuasif yang mengandung ajakan + alasan manfaat membaca (penilaian rubrik: ajakan, alasan, ejaan).",
  },

  // ── IPAS / Sains ───────────────────────────────────────────────────────
  {
    mapelKode: "IPAS", tingkatUrutan: 7, jenis: "pg",
    pertanyaan: "Perubahan wujud dari padat menjadi cair disebut ...",
    pilihan: { A: "Membeku", B: "Mencair", C: "Menguap", D: "Mengembun" },
    kunciJawaban: "B",
  },
  {
    mapelKode: "IPAS", tingkatUrutan: 8, jenis: "pg",
    pertanyaan: "Sumber energi terbarukan di bawah ini adalah ...",
    pilihan: { A: "Minyak bumi", B: "Batu bara", C: "Surya", D: "Gas alam" },
    kunciJawaban: "C",
  },
  {
    mapelKode: "IPAS", tingkatUrutan: 7, jenis: "benar_salah",
    pertanyaan: "Pernyataan: Air mendidih pada suhu 100°C di tekanan 1 atm.",
    kunciJawaban: "Benar",
  },
  {
    mapelKode: "IPAS", tingkatUrutan: 8, jenis: "isian",
    pertanyaan: "Proses tumbuhan membuat makanan sendiri dengan bantuan cahaya matahari disebut ...",
    kunciJawaban: "fotosintesis",
  },

  // ── Bahasa Inggris ─────────────────────────────────────────────────────
  {
    mapelKode: "BING", tingkatUrutan: 7, jenis: "pg",
    pertanyaan: "The opposite of 'happy' is ...",
    pilihan: { A: "Glad", B: "Sad", C: "Joyful", D: "Cheerful" },
    kunciJawaban: "B",
  },
  {
    mapelKode: "BING", tingkatUrutan: 8, jenis: "isian",
    pertanyaan: "Past tense of the verb 'go' is ...",
    kunciJawaban: "went",
  },

  // ── Pendidikan Agama / Pancasila ───────────────────────────────────────
  {
    mapelKode: "PAI", tingkatUrutan: 7, jenis: "pg",
    pertanyaan: "Jumlah rukun Islam adalah ...",
    pilihan: { A: "3", B: "4", C: "5", D: "6" },
    kunciJawaban: "C",
  },
  {
    mapelKode: "PANC", tingkatUrutan: 7, jenis: "pg",
    pertanyaan: "Sila kelima Pancasila berbunyi ...",
    pilihan: {
      A: "Ketuhanan Yang Maha Esa",
      B: "Keadilan sosial bagi seluruh rakyat Indonesia",
      C: "Persatuan Indonesia",
      D: "Kemanusiaan yang adil dan beradab",
    },
    kunciJawaban: "B",
  },

  // ── PJOK ───────────────────────────────────────────────────────────────
  {
    mapelKode: "PJOK", tingkatUrutan: 7, jenis: "pg",
    pertanyaan: "Olahraga yang memakai raket dan shuttlecock adalah ...",
    pilihan: { A: "Bola basket", B: "Bulu tangkis", C: "Sepak bola", D: "Voli" },
    kunciJawaban: "B",
  },
];

/** Fixture hasil scraping firecrawl (opsional). Lihat scrape-soal.mjs. */
const FIXTURE_PATH = path.join(__dirname, "fixtures", "soal-firecrawl.json");

/** Muat fixture firecrawl jika ada, gabung dengan butir internal. */
export function muatSemuaButir(): ButirSeed[] {
  const all = [...BUTIR_SOAL];
  if (existsSync(FIXTURE_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ButirSeed[];
      all.push(...raw);
    } catch (e) {
      console.warn(`[seed] fixture firecrawl gagal dibaca: ${(e as Error).message}`);
    }
  }
  return all;
}
