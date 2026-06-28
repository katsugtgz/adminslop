import {
  canAdminSatuanPendidikan,
  dapatMelihatAkses,
  PERAN_KE_IZIN_DEFAULT,
} from "@/lib/auth/otorisasi";
import type { RoleSlug } from "@/lib/auth/types";

/**
 * Peta reachability link pada dashboard Satuan Pendidikan aktif. Setiap
 * boolean mengondisikan visibilitas satu nav link modul. Ini hanyalah
 * convenience reachability — halaman terkait tetap memeriksa
 * `boleh(<izin>)` server-side (identity doc §12). `tenant_role` tidak pernah
 * superuser.
 */
export interface IzinReachability {
  // #5 — Pengaturan Sekolah (admin / kepala_sekolah / dev).
  bolehAtur: boolean;
  // #6 / T6 — Manajemen Akses (admin / kepala_sekolah / dev).
  bolehLihatAkses: boolean;
  // #7 — Peserta Didik (semua peran — core teaching data).
  bolehLihatPesertaDidik: boolean;
  // #8 — Tahun Ajaran (admin / kepala_sekolah / dev).
  bolehLihatTahunAjaran: boolean;
  // #8 — Rombongan Belajar (semua peran — core teaching data).
  bolehLihatRombonganBelajar: boolean;
  // #9 — Kurikulum (semua peran — universal read-only reference).
  bolehLihatKurikulum: boolean;
  // #10 — Beban Mengajar (semua peran — core teaching data).
  bolehLihatBebanMengajar: boolean;
  // #11 — Penilaian (semua peran — core data; ownership-scoped writes).
  bolehLihatPenilaian: boolean;
  // #12 — Permintaan AI (semua peran; AC#3 DUAL authz untuk draf_ai writes).
  bolehLihatPermintaanAi: boolean;
  // #15 — Absensi (semua peran; AC#4 ownership untuk writes).
  bolehLihatAbsensi: boolean;
  // #21 Mode Offline — Sinkronisasi Data (semua peran melihat draf sendiri).
  bolehLihatSinkronisasi: boolean;
  // #18 — Impor/Ekspor Peserta Didik (admin / kepala_sekolah / dev).
  bolehLihatImporPesertaDidik: boolean;
  // #20 — Notifikasi (semua peran — inbox pribadi universal).
  bolehLihatNotifikasi: boolean;
  // #13 — E-Raport (semua peran; AC#2/AC#3 DUAL authz untuk writes).
  bolehLihatEraport: boolean;
  // #16 — Bank Soal (semua peran; AC#2 DUAL authz untuk butir AI).
  bolehLihatBankSoal: boolean;
  // #17 — Perangkat Ajar (semua peran; AC#3 DUAL authz untuk dokumen_ai).
  bolehLihatPerangkatAjar: boolean;
  // #19 — Arsip (admin / kepala_sekolah / dev — oversight scope).
  bolehLihatArsip: boolean;
  // #14 — Cetak (semua peran; template/dokumen writes admin/dev/kepala).
  bolehLihatCetak: boolean;
}

/**
 * Hitung reachability link dashboard dari `tenant_role` pengguna. Tiap link
 * hanyalah convenience reachability; halaman terkait tetap memeriksa
 * `boleh(<izin>)` server-side (identity doc §12).
 */
export function hitungIzinReachability(roleSlug: RoleSlug): IzinReachability {
  const izin = PERAN_KE_IZIN_DEFAULT[roleSlug];
  return {
    bolehAtur: canAdminSatuanPendidikan(roleSlug),
    bolehLihatAkses: dapatMelihatAkses(roleSlug),
    bolehLihatPesertaDidik: izin.includes("peserta_didik:baca"),
    bolehLihatTahunAjaran: izin.includes("tahun_ajaran:baca"),
    bolehLihatRombonganBelajar: izin.includes("rombongan_belajar:baca"),
    bolehLihatKurikulum: izin.includes("kurikulum:baca"),
    bolehLihatBebanMengajar: izin.includes("beban_mengajar:baca"),
    bolehLihatPenilaian: izin.includes("penilaian:baca"),
    bolehLihatPermintaanAi: izin.includes("permintaan_ai:baca"),
    bolehLihatAbsensi: izin.includes("absensi:baca"),
    bolehLihatSinkronisasi: izin.includes("offline:baca"),
    bolehLihatImporPesertaDidik: izin.includes("impor_peserta_didik:baca"),
    bolehLihatNotifikasi: izin.includes("notifikasi:baca"),
    bolehLihatEraport: izin.includes("eraport:baca"),
    bolehLihatBankSoal: izin.includes("bank_soal:baca"),
    bolehLihatPerangkatAjar: izin.includes("perangkat_ajar:baca"),
    bolehLihatArsip: izin.includes("arsip:baca"),
    bolehLihatCetak: izin.includes("cetak:baca"),
  };
}
