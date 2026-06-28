import { eq, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import type { RoleSlug } from "@/lib/auth/types";
import { PERAN_KE_IZIN_DEFAULT } from "@/lib/auth/otorisasi";

import { mulberry32, pick, intBetween, sample, namaAcak, nisnAcak, uuidDeterministik, NAMA_DEPAN_PTK, NAMA_DEPAN_PTK_P, NAMA_BELAKANG } from "./names";
import { muatSemuaButir } from "./bank-soal-data";

/** Aktor yang dicatat di catatan_audit + kolom dibuat_oleh — penanda seed dev. */
export const AKTOR_SEED = "seed-dev";
/** userId WorkOS untuk pengguna contoh. Override via DEV_SEED_USER_ID biar
 *  cocok dengan user yang login di dev (DEV_MEMBERSHIP_ALL=true). */
const DEV_USER_ID = process.env.DEV_SEED_USER_ID ?? "user_dev_local";

export interface DemoTenant {
  id: string;
  nama: string;
  jenjang: "SD" | "SMP" | "SMA";
  npsn: string;
  alamat: string;
  kepalaNama: string;
  /** Daftar tingkat (nama tampilan + urutan). */
  tingkat: { nama: string; urutan: number }[];
  /** Kode mata pelajaran utama yang diasuh guru di tenant ini. */
  mapelKode: string[];
  /** Seed RNG unik per tenant untuk reproducibility. */
  rngSeed: number;
  /** Tahun ajaran aktif. */
  taAktif: string;
}

export const DEMO_TENANTS: DemoTenant[] = [
  {
    id: "org_smp_harapan",
    nama: "SMP Harapan Bangsa",
    jenjang: "SMP",
    npsn: "20100201",
    alamat: "Jl. Pendidikan No. 17, Bandung, Jawa Barat",
    kepalaNama: "Drs. Suparman, M.Pd.",
    tingkat: [
      { nama: "Kelas 7", urutan: 7 },
      { nama: "Kelas 8", urutan: 8 },
      { nama: "Kelas 9", urutan: 9 },
    ],
    mapelKode: ["MTK", "BIN", "IPAS", "BING", "PAI", "PANC", "PJOK"],
    rngSeed: 70_007,
    taAktif: "2026/2027",
  },
  {
    id: "org_sma_negeri1",
    nama: "SMA Negeri 1 Nusantara",
    jenjang: "SMA",
    npsn: "30100201",
    alamat: "Jl. Merdeka No. 1, Yogyakarta, DI Yogyakarta",
    kepalaNama: "Hj. Siti Rochmah, M.M.",
    tingkat: [
      { nama: "Kelas 10", urutan: 10 },
      { nama: "Kelas 11", urutan: 11 },
      { nama: "Kelas 12", urutan: 12 },
    ],
    mapelKode: ["MTK", "FIS", "KIM", "BIO", "BIN", "BING", "SEJ"],
    rngSeed: 100_010,
    taAktif: "2026/2027",
  },
];

/** Bersihkan SEMUA baris tenant-scoped untuk satu tenant (migrator, bypass RLS).
 *  Aman karena tenant demo sepenuhnya milik seed. */
export async function cleanupTenant(
  mig: import("pg").Pool,
  tenantId: string,
): Promise<void> {
  // Urutan: anak dulu (FK CASCADE akan banyak handle, tapi eksplisit aman).
  const tables = [
    "dokumen_cetak",
    "revisi_eraport",
    "draf_eraport",
    "paket_soal_butir",
    "paket_soal",
    "butir_soal",
    "perangkat_ajar",
    "nilai_peserta_didik",
    "penilaian",
    "komponen_nilai",
    "absensi_harian",
    "wali_kelas",
    "beban_mengajar",
    "penempatan_rombongan_belajar",
    "rombongan_belajar",
    "tingkat",
    "tahun_ajaran",
    "kontak_darurat",
    "wali_peserta_didik",
    "mutasi_peserta_didik",
    "riwayat_status_peserta_didik",
    "peserta_didik",
    "preferensi_notifikasi",
    "notifikasi",
    "pembatasan_akses",
    "izin_akses",
    "pengguna",
    "ptk",
    "retensi_data",
    "kuota_ai",
    "draf_ai",
    "permintaan_ai",
    "template_cetak",
    "catatan_audit",
    "contoh_catatan",
  ];
  for (const t of tables) {
    await mig.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]);
  }
}

interface MapelRow {
  id: string;
  kode: string;
  nama: string;
}

/** Seed satu tenant penuh (app_user via withTenant — RLS WITH CHECK tervalidasi). */
export async function seedTenant(db: Db, t: DemoTenant): Promise<void> {
  const rng = mulberry32(t.rngSeed);
  /** UUID stabil lintas re-run dari key natural → URL deep-link e2e reproducible. */
  const uid = (key: string): string => uuidDeterministik(`${t.id}:${key}`);
  // GLOBAL reference (mata_pelajaran: SELECT-only, NO RLS) — query langsung
  // tanpa withTenant. Di luar transaksi agar tak terikat GUC tenant.
  const mapelAll = (await db
    .select()
    .from(schema.mataPelajaran))
    .filter((m) => t.mapelKode.includes((m as MapelRow).kode)) as MapelRow[];
  const mapelByKode = new Map(mapelAll.map((m) => [m.kode, m]));

  await db.transaction(async (tx) => {
    // Set GUC tenant.
    await tx.execute(sql`select set_config('app.tenant_id', ${t.id}, true)`);

    // ── Tingkat ───────────────────────────────────────────────────────────
    const tingkatByUrutan = new Map<number, string>();
    for (const tk of t.tingkat) {
      const id = uid(`tingkat:${tk.urutan}`);
      await tx
        .insert(schema.tingkat)
        .values({ id, nama: tk.nama, urutan: tk.urutan });
      tingkatByUrutan.set(tk.urutan, id);
    }

    // ── Tahun Ajaran ──────────────────────────────────────────────────────
    const tahunLalu = `${Number(t.taAktif.slice(0, 4)) - 1}/${Number(t.taAktif.slice(0, 4))}`;
    const taAktifId = uid("ta:aktif");
    const taLaluId = uid("ta:lalu");
    await tx.insert(schema.tahunAjaran).values([
      { id: taLaluId, nama: tahunLalu, aktif: false },
      { id: taAktifId, nama: t.taAktif, aktif: true },
    ]);
    const taAktif = { id: taAktifId };

    // ── Rombongan Belajar (2 per tingkat) ────────────────────────────────
    const rombelByNama = new Map<string, string>();
    const rombelByTingkat = new Map<number, string[]>(); // urutan → [rombelId]
    for (const tk of t.tingkat) {
      const ids: string[] = [];
      for (const suffix of ["A", "B"]) {
        const nama = `${tk.urutan}${suffix}`;
        const id = uid(`rombel:${tk.urutan}:${suffix}`);
        await tx
          .insert(schema.rombonganBelajar)
          .values({
            id,
            nama,
            tingkatId: tingkatByUrutan.get(tk.urutan)!,
            tahunAjaranId: taAktif.id,
          });
        rombelByNama.set(nama, id);
        ids.push(id);
      }
      rombelByTingkat.set(tk.urutan, ids);
    }

    // ── PTK (kepala + guru per mapel + 2 tenaga kependidikan) ────────────
    const ptkGuruByMapel = new Map<string, string>(); // mapelKode → ptkId
    const semuaGuruPtkId: string[] = [];
    // Kepala sebagai PTK (jenis pendidik) — bukan pengguna wajib.
    await tx.insert(schema.ptk).values({
      id: uid("ptk:kepala"),
      nama: t.kepalaNama,
      nip: `1980${intBetween(rng, 10000000, 99999999)} ${intBetween(rng, 1, 12)} 1 001`,
      jenis: "pendidik",
    });
    // Guru per mapel utama.
    for (const kode of t.mapelKode) {
      const jk = rng() > 0.5 ? "L" : "P";
      const depan = jk === "L" ? pick(rng, NAMA_DEPAN_PTK) : pick(rng, NAMA_DEPAN_PTK_P);
      const nama = `${depan} ${pick(rng, NAMA_BELAKANG)}, S.Pd.`;
      const id = uid(`ptk:guru:${kode}`);
      await tx
        .insert(schema.ptk)
        .values({
          id,
          nama,
          nip: `198${intBetween(rng, 0, 9)}${intBetween(rng, 10000000, 99999999)}`,
          jenis: "pendidik",
        });
      ptkGuruByMapel.set(kode, id);
      semuaGuruPtkId.push(id);
    }
    // Tenaga kependidikan (TU).
    for (let i = 0; i < 2; i++) {
      const depan = pick(rng, NAMA_DEPAN_PTK_P);
      await tx.insert(schema.ptk).values({
        id: uid(`ptk:tu:${i}`),
        nama: `${depan} ${pick(rng, NAMA_BELAKANG)}, A.Md.`,
        jenis: "tenaga_kependidikan",
      });
    }

    // ── Pengguna + izin_akses (dari PERAN_KE_IZIN_DEFAULT) ───────────────
    const buatPengguna = async (
      userId: string,
      peran: RoleSlug,
      nama: string,
      ptkId: string | null,
    ) => {
      const penggunaId = uid(`pengguna:${peran}`);
      await tx
        .insert(schema.pengguna)
        .values({ id: penggunaId, userId, peranAkses: peran, nama, ptkId });
      const izin = PERAN_KE_IZIN_DEFAULT[peran];
      if (izin.length) {
        await tx.insert(schema.izinAkses).values(
          izin.map((slug) => ({ penggunaId, slug })),
        );
      }
      return penggunaId;
    };
    // Admin/dev (admin = role akses, BUKAN personel wajib → tanpa link ptk;
    // lihat schema: "Admin Satuan Pendidikan is an access role, not personnel data").
    const adminPenggunaId = await buatPengguna(
      DEV_USER_ID,
      "admin_satuan_pendidikan",
      "Admin Demo (Dev)",
      null,
    );
    // Guru pengguna (link ke ptk mapel MTK bila ada, else guru pertama).
    const guruPtkId = ptkGuruByMapel.get("MTK") ?? semuaGuruPtkId[0]!;
    const guruPenggunaId = await buatPengguna(
      `${DEV_USER_ID}_guru1`,
      "guru",
      "Guru Demo (Dev)",
      guruPtkId,
    );
    // Kepala sekolah pengguna (tanpa ptk link — kepala adalah jabatan resmi).
    await buatPengguna(
      `${DEV_USER_ID}_kepala`,
      "kepala_sekolah",
      t.kepalaNama,
      null,
    );

    // ── Peserta Didik (4 per rombel) + wali + kontak darurat ────────────
    const nisnUsed = new Set<string>();
    let nisSeq = 1000;
    const pesertaByRombel = new Map<string, string[]>();
    for (const tk of t.tingkat) {
      const rombelIds = rombelByTingkat.get(tk.urutan)!;
      for (let ri = 0; ri < rombelIds.length; ri++) {
        const rombelId = rombelIds[ri]!;
        const suffixR = ri === 0 ? "A" : "B";
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) {
          const jk: "L" | "P" = rng() > 0.5 ? "L" : "P";
          const { nama } = namaAcak(rng, jk);
          let nisn = nisnAcak(rng);
          while (nisnUsed.has(nisn)) nisn = nisnAcak(rng);
          nisnUsed.add(nisn);
          // Tahun lahir: jenjang SMP kelas N → umur N-?; pakai heuristik.
          const tahunLahir = 2026 - (tk.urutan <= 9 ? tk.urutan + 5 : tk.urutan + 5);
          const tglLahir = `${tahunLahir}-${String(intBetween(rng, 1, 12)).padStart(2, "0")}-${String(intBetween(rng, 1, 28)).padStart(2, "0")}`;
          const pdId = uid(`pd:${tk.urutan}:${suffixR}:${i}`);
          await tx
            .insert(schema.pesertaDidik)
            .values({
              id: pdId,
              nama,
              nisn,
              nis: String(nisSeq++),
              tanggalLahir: tglLahir,
              jenisKelamin: jk,
              status: "aktif",
            });
          ids.push(pdId);
          // Riwayat status awal.
          await tx.insert(schema.riwayatStatusPesertaDidik).values({
            pesertaDidikId: pdId,
            status: "aktif",
            catatan: "Pendaftaran awal (seed dev).",
            dibuatOleh: AKTOR_SEED,
          });
          // Wali peserta didik.
          const waliJk: "L" | "P" = rng() > 0.5 ? "L" : "P";
          const { nama: namaWali } = namaAcak(rng, waliJk);
          await tx.insert(schema.waliPesertaDidik).values({
            pesertaDidikId: pdId,
            nama: namaWali,
            hubungan: waliJk === "L" ? "Ayah" : "Ibu",
            telepon: `08${intBetween(rng, 11, 89)}${intBetween(rng, 10000000, 99999999)}`,
          });
          // Kontak darurat (sebagian).
          if (rng() > 0.4) {
            await tx.insert(schema.kontakDarurat).values({
              pesertaDidikId: pdId,
              nama: namaAcak(rng, "P").nama,
              hubungan: pick(rng, ["Kakek", "Nenek", "Paman", "Bibi"]),
              telepon: `08${intBetween(rng, 11, 89)}${intBetween(rng, 10000000, 99999999)}`,
            });
          }
        }
        pesertaByRombel.set(rombelId, ids);
      }
    }

    // Satu peserta berstatus pindah + mutasi (demonstrasi Mutasi Peserta Didik).
    const firstRombelStudents = pesertaByRombel.values().next().value!;
    const pindahId = firstRombelStudents[0]!;
    await tx
      .update(schema.pesertaDidik)
      .set({ status: "pindah" })
      .where(eq(schema.pesertaDidik.id, pindahId));
    await tx.insert(schema.riwayatStatusPesertaDidik).values({
      pesertaDidikId: pindahId,
      status: "pindah",
      catatan: "Pindah ke sekolah lain (seed dev).",
      dibuatOleh: AKTOR_SEED,
    });
    await tx.insert(schema.mutasiPesertaDidik).values({
      pesertaDidikId: pindahId,
      arah: "keluar",
      tujuanSekolah: "SMP Lain Nusantara",
      tanggal: "2026-09-01",
      alasan: "Mengikuti orang tua pindah tugas.",
      dibuatOleh: AKTOR_SEED,
    });

    // ── Penempatan Rombongan Belajar (ganjil, aktif) ─────────────────────
    for (const [rombelId, pdIds] of pesertaByRombel) {
      for (const pdId of pdIds) {
        if (pdId === pindahId) continue;
        await tx.insert(schema.penempatanRombonganBelajar).values({
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tahunAjaranId: taAktif.id,
          semester: "ganjil",
          status: "aktif",
          dibuatOleh: AKTOR_SEED,
        });
      }
    }

    // ── Wali Kelas (guru pertama → setiap rombel) ────────────────────────
    const waliPtk = semuaGuruPtkId[0]!;
    for (const tk of t.tingkat) {
      for (const rombelId of rombelByTingkat.get(tk.urutan)!) {
        await tx.insert(schema.waliKelas).values({
          ptkId: waliPtk,
          rombonganBelajarId: rombelId,
          tahunAjaranId: taAktif.id,
          semester: "ganjil",
          dibuatOleh: AKTOR_SEED,
        });
      }
    }

    // ── Beban Mengajar (guru mapel → rombel tingkat pertama, ganjil) ─────
    const tingkatPertama = t.tingkat[0]!;
    const rombelPertama = rombelByTingkat.get(tingkatPertama.urutan)![0]!;
    const bebanByMapel = new Map<string, string>();
    for (const kode of t.mapelKode.slice(0, 4)) {
      const mapel = mapelByKode.get(kode);
      const ptkId = ptkGuruByMapel.get(kode);
      if (!mapel || !ptkId) continue;
      const [row] = await tx
        .insert(schema.bebanMengajar)
        .values({
          ptkId,
          mataPelajaranId: mapel.id,
          rombonganBelajarId: rombelPertama,
          tahunAjaranId: taAktif.id,
          semester: "ganjil",
        })
        .returning({ id: schema.bebanMengajar.id });
      bebanByMapel.set(kode, row!.id);
    }

    // ── Komponen Nilai + Penilaian + Nilai Peserta Didik ─────────────────
    const pesertaRombelPertama = pesertaByRombel.get(rombelPertama)!;
    for (const [_kode, bebanId] of bebanByMapel) {
      const [kompForm, kompSum] = await tx
        .insert(schema.komponenNilai)
        .values([
          { bebanMengajarId: bebanId, nama: "Formatif", bobot: "40" },
          { bebanMengajarId: bebanId, nama: "Sumatif", bobot: "60" },
        ])
        .returning({ id: schema.komponenNilai.id });
      // Penilaian formatif + sumatif.
      const [penForm] = await tx
        .insert(schema.penilaian)
        .values({
          komponenNilaiId: kompForm!.id,
          nama: "Tugas 1",
          tanggal: "2026-08-20",
          dibuatOleh: AKTOR_SEED,
        })
        .returning({ id: schema.penilaian.id });
      const [penSum] = await tx
        .insert(schema.penilaian)
        .values({
          komponenNilaiId: kompSum!.id,
          nama: "Ulangan Harian 1",
          tanggal: "2026-09-15",
          dibuatOleh: AKTOR_SEED,
        })
        .returning({ id: schema.penilaian.id });
      // Nilai per peserta (rombel pertama). Sebagian NULL (belum dinilai).
      const formVals = pesertaRombelPertama.map((pdId) => ({
        penilaianId: penForm!.id,
        pesertaDidikId: pdId,
        nilai: rng() > 0.15 ? String(intBetween(rng, 70, 95)) : null,
      }));
      const sumVals = pesertaRombelPertama.map((pdId) => ({
        penilaianId: penSum!.id,
        pesertaDidikId: pdId,
        nilai: rng() > 0.2 ? String(intBetween(rng, 65, 92)) : null,
      }));
      if (formVals.length) await tx.insert(schema.nilaiPesertaDidik).values(formVals);
      if (sumVals.length) await tx.insert(schema.nilaiPesertaDidik).values(sumVals);
    }

    // ── Absensi Harian (5 hari terakhir, rombel pertama) ─────────────────
    const hari = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];
    for (let di = 0; di < hari.length; di++) {
      for (const pdId of pesertaRombelPertama) {
        if (pdId === pindahId) continue;
        const r = rng();
        const status = r > 0.9 ? "izin" : r > 0.85 ? "sakit" : r > 0.82 ? "alpa" : "hadir";
        await tx.insert(schema.absensiHarian).values({
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelPertama,
          tanggal: hari[di]!,
          statusKehadiran: status,
          metodeInput: di === 0 && status === "hadir" ? "qr" : "manual",
          sumberQr: di === 0 && status === "hadir" ? `sess-${t.id}-20260921` : null,
          catatan: status === "izin" ? "Acara keluarga" : status === "sakit" ? "Demam" : null,
          dibuatOleh: AKTOR_SEED,
        });
      }
    }

    // ── Permintaan AI + Draf AI (selesai + disetujui) ────────────────────
    const [perm] = await tx
      .insert(schema.permintaanAi)
      .values({
        id: uid("permintaan-ai:1"),
        jenis: "deskripsi_cp",
        konteks: { mataPelajaran: "Matematika", tingkat: t.tingkat[0]!.nama },
        status: "selesai",
        dibuatOleh: AKTOR_SEED,
        diprosesPada: new Date("2026-09-01"),
        selesaiPada: new Date("2026-09-01"),
      })
      .returning({ id: schema.permintaanAi.id });
    const drafId = uid("draf-ai:1");
    await tx
      .insert(schema.drafAi)
      .values({
        id: drafId,
        permintaanAiId: perm!.id,
        konten:
          "[Draf AI] Peserta didik menunjukkan pemahaman operasi hitung " +
          "bilangan bulat dengan baik pada Fase D. Perlu penguatan pada " +
          "bilangan rasional bentuk pecahan.",
        provenance:
          "model=mock;prompt_hash=sha256:seed-mock;key_id=dev;ts=2026-09-01",
        statusVerifikasi: "disetujui",
        diverifikasiOleh: AKTOR_SEED,
        diverifikasiPada: new Date("2026-09-02"),
      });

    // ── Butir Soal (resolusi mapelId/tingkatId) ──────────────────────────
    const butir = muatSemuaButir();
    const butirIdByMapel = new Map<string, string[]>();
    let butirSeq = 0;
    for (const b of butir) {
      const mapel = mapelByKode.get(b.mapelKode);
      if (!mapel) continue; // mapel tak tersedia di tenant ini → lewati
      // Hanya kaitkan tingkat bila cocok dengan jenjang tenant (mis. soal
      // kelas 7 TIDAK dipaksa jadi kelas 10 di SMA). NULL = tanpa tingkat.
      const tingkatId = b.tingkatUrutan
        ? tingkatByUrutan.get(b.tingkatUrutan) ?? null
        : null;
      const linkDraf =
        b.mapelKode === "MTK" && b.jenis === "pg" ? drafId : null;
      const id = uid(`butir:${butirSeq++}`);
      await tx
        .insert(schema.butirSoal)
        .values({
          id,
          mataPelajaranId: mapel.id,
          tingkatId,
          jenis: b.jenis,
          pertanyaan: b.pertanyaan,
          pilihan: b.pilihan as never,
          kunciJawaban: b.kunciJawaban,
          pembahasan: b.pembahasan ?? null,
          drafAiId: linkDraf,
          dibuatOleh: AKTOR_SEED,
        });
      const arr = butirIdByMapel.get(b.mapelKode) ?? [];
      arr.push(id);
      butirIdByMapel.set(b.mapelKode, arr);
    }

    // ── Paket Soal (1 per mapel utama, rakit beberapa butir) ─────────────
    for (const kode of t.mapelKode.slice(0, 3)) {
      const mapel = mapelByKode.get(kode);
      if (!mapel) continue;
      const paketId = uid(`paket:${kode}`);
      await tx
        .insert(schema.paketSoal)
        .values({
          id: paketId,
          nama: `Paket Latihan ${mapel.nama} — Ganjil`,
          mataPelajaranId: mapel.id,
          tahunAjaranId: taAktif.id,
          semester: "ganjil",
          dibuatOleh: AKTOR_SEED,
        });
      const butirIds = butirIdByMapel.get(kode) ?? [];
      const urut = sample(rng, butirIds, Math.min(5, butirIds.length));
      if (urut.length) {
        await tx.insert(schema.paketSoalButir).values(
          urut.map((butirSoalId, i) => ({
            paketSoalId: paketId,
            butirSoalId,
            urutan: i + 1,
            bobot: "1",
          })),
        );
      }
    }

    // ── Perangkat Ajar (1 per jenis untuk mapel MTK) ─────────────────────
    const mapelMtk = mapelByKode.get("MTK") ?? mapelAll[0]!;
    const jenisList = ["modul_ajar", "rpp", "silabus", "prota", "promes"] as const;
    for (const jenis of jenisList) {
      await tx.insert(schema.perangkatAjar).values({
        jenis,
        mataPelajaranId: mapelMtk.id,
        tingkatId: tingkatByUrutan.get(t.tingkat[0]!.urutan)!,
        tahunAjaranId: taAktif.id,
        semester: jenis === "prota" || jenis === "promes" ? "ganjil" : null,
        judul: `${jenis.toUpperCase()} ${mapelMtk.nama} ${t.tingkat[0]!.nama}`,
        konten: {
          ringkasan: `Contoh ${jenis} hasil susun guru (seed dev).`,
          capembId: "CP-MTK-D-1",
        },
        statusDokumenAi: null,
        dibuatOleh: AKTOR_SEED,
      });
    }

    // ── Template Cetak (default eraport) ─────────────────────────────────
    const tmplId = uid("template-cetak:eraport");
    await tx
      .insert(schema.templateCetak)
      .values({
        id: tmplId,
        nama: "Template E-Raport Bawaan",
        jenis: "eraport",
        pengaturan: {
          margin_mm: 15,
          font_size: 11,
          header_text: t.nama,
          footer_text: `NPSN ${t.npsn}`,
          show_logo: true,
          show_header: true,
        },
        isDefault: true,
        dibuatOleh: AKTOR_SEED,
      });

    // ── Draf E-Raport (2 draf + 1 terbit untuk peserta rombel pertama) ───
    // DB invariant (schema + catatRevisi): row revisi_eraport ada ⟺
    // parent draf_eraport.status = 'revisi'. Seed menjaga invariant itu:
    // eraport terbit (dengan dokumen_cetak) TIDAK punya revisi; revisi
    // diterapkan ke eraport berbeda yang di-flip ke 'revisi'.
    const eraportTargets = pesertaRombelPertama.slice(0, 3);
    const eraportStatus = ["terbit", "revisi", "draf"] as const;
    for (let i = 0; i < eraportTargets.length; i++) {
      const pdId = eraportTargets[i]!;
      const status = eraportStatus[i]!;
      const id = uid(`draf-eraport:${i}`);
      await tx
        .insert(schema.drafEraport)
        .values({
          id,
          pesertaDidikId: pdId,
          tahunAjaranId: taAktif.id,
          semester: "ganjil",
          status,
          konten: {
            mapel: t.mapelKode.slice(0, 4).map((kode) => ({
              mataPelajaran: mapelByKode.get(kode)?.nama ?? kode,
              nilaiAkhir: intBetween(rng, 75, 92),
              deskripsi: "Memenuhi capaian pembelajaran dengan baik.",
            })),
            catatanWali: "Ananda menunjukkan motivasi belajar yang baik.",
          },
          // Hanya eraport terbit terkait Draf AI (cetak berakar dari status terbit).
          drafAiId: status === "terbit" ? drafId : null,
          dibuatOleh: AKTOR_SEED,
          diterbitkanPada: status === "terbit" ? new Date("2026-12-20") : null,
        });
      if (status === "terbit") {
        await tx.insert(schema.dokumenCetak).values({
          drafEraportId: id,
          templateCetakId: tmplId,
          tandaTanganNama: t.kepalaNama,
          tandaTanganPeran: "Kepala Satuan Pendidikan",
          stempelUrl: null,
          format: "a4",
          dibuatOleh: AKTOR_SEED,
        });
      }
      if (status === "revisi") {
        await tx.insert(schema.revisiEraport).values({
          eraportId: id,
          alasan: "Koreksi nilai setelah verifikasi ulang (seed dev).",
          kontenPerubahan: { mapel: "Matematika", nilaiLama: 80, nilaiBaru: 85 },
          dibuatOleh: AKTOR_SEED,
        });
      }
    }

    // ── Notifikasi (per pengguna) ────────────────────────────────────────
    const penggunaIds = [adminPenggunaId, guruPenggunaId];
    for (const pid of penggunaIds) {
      await tx.insert(schema.notifikasi).values([
        {
          penggunaId: pid,
          tipe: "tugas_nilai",
          judul: "Input Nilai menunggu",
          pesan: "Ada Penilaian yang belum diselesaikan untuk minggu ini.",
          dibaca: false,
          konteks: { rombel: `${tingkatPertama.urutan}A` },
        },
        {
          penggunaId: pid,
          tipe: "umum",
          judul: "Selamat datang",
          pesan: "Data demo telah diisi untuk pengujian.",
          dibaca: rng() > 0.5,
        },
      ]);
    }

    // ── Retensi Data (kebijakan per tabel kunci) ─────────────────────────
    await tx.insert(schema.retensiData).values([
      { tabel: "peserta_didik", periodeBulan: 84 },
      { tabel: "nilai_peserta_didik", periodeBulan: 84 },
      { tabel: "absensi_harian", periodeBulan: 60 },
      { tabel: "draf_eraport", periodeBulan: 84 },
    ]);

    // ── Kuota AI (aktif TA + semester) ───────────────────────────────────
    await tx.insert(schema.kuotaAi).values({
      tahunAjaranId: taAktif.id,
      semester: "ganjil",
      terpakai: intBetween(rng, 1, 12),
      batas: 100,
    });

    // ── Catatan Audit (beberapa contoh) ──────────────────────────────────
    await tx.insert(schema.catatanAudit).values([
      {
        aktor: AKTOR_SEED,
        aksi: "seed_tenant",
        target: `satuan_pendidikan:${t.id}`,
        beban: { tenant: t.id, jenjang: t.jenjang },
      },
      {
        aktor: AKTOR_SEED,
        aksi: "buat_butir_soal",
        target: `butir_soal:bulk`,
        beban: { jumlah: butir.length },
      },
    ]);
  });
}
