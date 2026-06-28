import type { Pool } from "pg";

/**
 * Seed data GLOBAL referensi kurikulum (ADR 0001 — NO tenant_id, NO RLS).
 * Dijalankan sebagai migrator superuser (DATABASE_MIGRATOR_URL). app_user
 * hanya SELECT. Idempotent (ON CONFLICT DO NOTHING).
 *
 * COMPLIANCE (CONTEXT.md + plan §1 ship-blocker): kurikulum resmi TIDAK
 * dibuat AI. status_persetujuan = 'memerlukan_tinjauan' sampai reviewer
 * manusia menyetujui. `sumber` mencantumkan Kemdikbud. Untuk keperluan dev
 * + e2e saja — bukan sumber kanonik tanpa review manusia.
 */

interface MapelSeed {
  kode: string;
  nama: string;
}
interface FaseSeed {
  kode: string;
  nama: string;
  rentangKelas: string;
  jenjang: string;
}
interface CpSeed {
  kode: string;
  mapelKode: string;
  faseKode: string;
  elemen: string;
  deskripsi: string;
}

const MAPEL: MapelSeed[] = [
  // Umum lintas jenjang (sumber: kurikulum.kemdikbud.go.id)
  { kode: "PAI", nama: "Pendidikan Agama dan Budi Pekerti" },
  { kode: "PANC", nama: "Pendidikan Pancasila" },
  { kode: "BIN", nama: "Bahasa Indonesia" },
  { kode: "MTK", nama: "Matematika" },
  { kode: "IPAS", nama: "Ilmu Pengetahuan Alam dan Sosial" },
  { kode: "PJOK", nama: "Pendidikan Jasmani, Olahraga, dan Kesehatan" },
  { kode: "SENI", nama: "Seni Budaya" },
  { kode: "BING", nama: "Bahasa Inggris" },
  { kode: "MULOK", nama: "Muatan Lokal" },
  { kode: "INKL", nama: "Pendidikan Inklusi" },
  // IPA lama (dipakai 0005) — pertahankan alias
  { kode: "IPA", nama: "Ilmu Pengetahuan Alam" },
  // SMA-specific
  { kode: "FIS", nama: "Fisika" },
  { kode: "KIM", nama: "Kimia" },
  { kode: "BIO", nama: "Biologi" },
  { kode: "SEJ", nama: "Sejarah" },
  { kode: "GEO", nama: "Geografi" },
  { kode: "EKO", nama: "Ekonomi" },
  { kode: "SOS", nama: "Sosiologi" },
  { kode: "TIK", nama: "Informatika" },
  { kode: "PPKn", nama: "Pendidikan Pancasila dan Kewarganegaraan" },
];

const FASE: FaseSeed[] = [
  { kode: "A", nama: "Fase A", rentangKelas: "Kelas 1-2 SD", jenjang: "SD" },
  { kode: "B", nama: "Fase B", rentangKelas: "Kelas 3-4 SD", jenjang: "SD" },
  { kode: "C", nama: "Fase C", rentangKelas: "Kelas 5-6 SD", jenjang: "SD" },
  { kode: "D", nama: "Fase D", rentangKelas: "Kelas 7-9 SMP", jenjang: "SMP" },
  { kode: "E", nama: "Fase E", rentangKelas: "Kelas 10 SMA", jenjang: "SMA" },
  { kode: "F", nama: "Fase F", rentangKelas: "Kelas 11-12 SMA", jenjang: "SMA" },
];

// Contoh CP (placeholder review-required). Cukup beberapa untuk mengisi form.
const CP: CpSeed[] = [
  {
    kode: "CP-MTK-D-1",
    mapelKode: "MTK",
    faseKode: "D",
    elemen: "Bilangan",
    deskripsi:
      "Pada akhir Fase D, peserta didik dapat melakukan operasi hitung " +
      "bilangan bulat dan bilangan rasional serta menyelesaikan masalah " +
      "kontekstual yang berkaitan dengannya.",
  },
  {
    kode: "CP-MTK-D-2",
    mapelKode: "MTK",
    faseKode: "D",
    elemen: "Aljabar",
    deskripsi:
      "Peserta didik dapat menyatakan situasi ke dalam bentuk aljabar, " +
      "menyelesaikan persamaan dan pertidaksamaan linear satu variabel.",
  },
  {
    kode: "CP-BIN-D-1",
    mapelKode: "BIN",
    faseKode: "D",
    elemen: "Teks",
    deskripsi:
      "Peserta didik mampu memahami, merespons, dan mengevaluasi berbagai " +
      "teks lisan, visual, dan tulis tentang topik yang variatif.",
  },
  {
    kode: "CP-IPAS-D-1",
    mapelKode: "IPAS",
    faseKode: "D",
    elemen: "Wujud Zat dan Perubahannya",
    deskripsi:
      "Peserta didik dapat mengidentifikasi wujud zat dan menjelaskan " +
      "perubahan wujud zat menggunakan model partikel.",
  },
  {
    kode: "CP-FIS-E-1",
    mapelKode: "FIS",
    faseKode: "E",
    elemen: "Mekanika",
    deskripsi:
      "Peserta didik dapat menganalisis gerak lurus, gerak melingkar, dan " +
      "hukum Newton untuk menyelesaikan masalah kontekstual.",
  },
];

const SUMBER = "Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi";
const SUMBER_URL = "https://kurikulum.kemdikbud.go.id";

/** Seed seluruh referensi GLOBAL. Idempotent. */
export async function seedReferensiKurikulum(mig: Pool): Promise<void> {
  // 1. kurikulum (review-required).
  await mig.query(
    `INSERT INTO kurikulum
       (nama, versi, deskripsi, sumber, sumber_url, tanggal_ambil, status_persetujuan)
     SELECT 'Kurikulum Merdeka', '2022',
       'Kurikulum dengan pembelajaran berdiferensiasi dan projek penguatan profil pelajar Pancasila.',
       $1, $2, current_date, 'memerlukan_tinjauan'
     WHERE NOT EXISTS (
       SELECT 1 FROM kurikulum WHERE nama = 'Kurikulum Merdeka' AND versi = '2022'
     )`,
    [SUMBER, SUMBER_URL],
  );

  // 2. mata_pelajaran.
  for (const m of MAPEL) {
    await mig.query(
      `INSERT INTO mata_pelajaran (kode, nama) VALUES ($1, $2)
       ON CONFLICT (kode) DO NOTHING`,
      [m.kode, m.nama],
    );
  }

  // 3. fase.
  for (const f of FASE) {
    await mig.query(
      `INSERT INTO fase (kode, nama, rentang_kelas, jenjang) VALUES ($1, $2, $3, $4)
       ON CONFLICT (kode) DO NOTHING`,
      [f.kode, f.nama, f.rentangKelas, f.jenjang],
    );
  }

  // 4. capaian_pembelajaran (review-required).
  for (const cp of CP) {
    await mig.query(
      `INSERT INTO capaian_pembelajaran (kurikulum_id, mata_pelajaran_id, fase_id, kode, elemen, deskripsi, sumber)
       SELECT k.id, mp.id, f.id, $1, $2, $3, $4
       FROM kurikulum k, mata_pelajaran mp, fase f
       WHERE k.nama = 'Kurikulum Merdeka' AND mp.kode = $5 AND f.kode = $6
       ON CONFLICT (kurikulum_id, mata_pelajaran_id, fase_id, kode) DO NOTHING`,
      [cp.kode, cp.elemen, cp.deskripsi, SUMBER, cp.mapelKode, cp.faseKode],
    );
  }

  // 5. tujuan_pembelajaran (2 per CP). review-required.
  const cpRows = (await mig.query<{
    id: string;
    kode: string;
  }>(
    `SELECT cp.id, cp.kode
     FROM capaian_pembelajaran cp
     JOIN kurikulum k ON k.id = cp.kurikulum_id
     WHERE k.nama = 'Kurikulum Merdeka'`,
  )).rows;
  for (const cp of cpRows) {
    for (let ur = 1; ur <= 2; ur++) {
      const deskripsi = `TP ${ur} untuk ${cp.kode} (memerlukan tinjauan reviewer).`;
      await mig.query(
        `INSERT INTO tujuan_pembelajaran (capaian_pembelajaran_id, urutan, deskripsi, sumber)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (capaian_pembelajaran_id, urutan) DO NOTHING`,
        [cp.id, ur, deskripsi, SUMBER],
      );
    }
  }
}
