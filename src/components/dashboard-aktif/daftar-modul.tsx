import {
  Archive,
  Bell,
  BookMarked,
  BookOpen,
  Bot,
  Briefcase,
  Calendar,
  CalendarCheck,
  ClipboardList,
  CloudOff,
  FileQuestion,
  FileText,
  GraduationCap,
  KeyRound,
  Printer,
  Upload,
  Users,
} from "lucide-react";

import { KartuModul } from "./kartu-modul";
import type { IzinReachability } from "./izin-reachability";

/**
 * Daftar (nav) kartu modul pada dashboard Satuan Pendidikan aktif. Urutan
 * modul dan label tombol harus tetap persis seperti desain asli — sebagian
 * tes memilih link berdasarkan accessible name (mis. "Buka Cetak",
 * "Buka Impor/Ekspor", "Manajemen Akses").
 *
 * Visibilitas tiap kartu dikondisikan oleh izin reachability; halaman tujuan
 * tetap memeriksa `boleh(<izin>)` server-side (identity doc §12).
 */
export function DaftarModul({
  reachability,
}: {
  reachability: IzinReachability;
}) {
  const {
    bolehLihatSinkronisasi,
    bolehLihatCetak,
    bolehLihatAbsensi,
    bolehLihatPermintaanAi,
    bolehLihatNotifikasi,
    bolehLihatEraport,
    bolehLihatBankSoal,
    bolehLihatPerangkatAjar,
    bolehLihatPesertaDidik,
    bolehLihatImporPesertaDidik,
    bolehLihatRombonganBelajar,
    bolehLihatTahunAjaran,
    bolehLihatAkses,
    bolehLihatBebanMengajar,
    bolehLihatPenilaian,
    bolehLihatArsip,
    bolehLihatKurikulum,
  } = reachability;

  return (
    <nav aria-label="Modul Satuan Pendidikan" className="flex flex-col gap-4">
      {bolehLihatSinkronisasi && (
        <KartuModul
          icon={CloudOff}
          judul="Sinkronisasi Data (Mode Offline)"
          deskripsi="Lihat draf tertunda dan sinkronkan saat tersambung kembali."
          href="/dashboard/sinkronisasi"
          labelTombol="Buka Sinkronisasi Data"
        />
      )}

      {bolehLihatCetak && (
        <KartuModul
          icon={Printer}
          judul="Cetak E-Raport"
          deskripsi="Pratinjau dan cetak E-Raport dengan Template Cetak."
          href="/dashboard/cetak"
          labelTombol="Buka Cetak"
        />
      )}

      {bolehLihatAbsensi && (
        <KartuModul
          icon={CalendarCheck}
          judul="Absensi Harian"
          deskripsi="Catat kehadiran harian Peserta Didik."
          href="/dashboard/absensi"
          labelTombol="Buka Absensi Harian"
        />
      )}

      {bolehLihatPermintaanAi && (
        <KartuModul
          icon={Bot}
          judul="Permintaan AI"
          deskripsi="Buat permintaan AI dan verifikasi draf."
          href="/dashboard/permintaan-ai"
          labelTombol="Buka Permintaan AI"
        />
      )}

      {bolehLihatNotifikasi && (
        <KartuModul
          icon={Bell}
          judul="Notifikasi"
          deskripsi="Lihat pengingat tugas tertunda dan kelola preferensi notifikasi."
          href="/dashboard/notifikasi"
          labelTombol="Buka Notifikasi"
        />
      )}

      {bolehLihatEraport && (
        <KartuModul
          icon={FileText}
          judul="E-Raport"
          deskripsi="Kelola Draf, Terbit, dan Revisi E-Raport."
          href="/dashboard/eraport"
          labelTombol="Buka E-Raport"
        />
      )}

      {bolehLihatBankSoal && (
        <KartuModul
          icon={FileQuestion}
          judul="Bank Soal"
          deskripsi="Kelola Butir Soal dan rakit Paket Soal."
          href="/dashboard/bank-soal"
          labelTombol="Buka Bank Soal"
        />
      )}

      {bolehLihatPerangkatAjar && (
        <KartuModul
          icon={BookMarked}
          judul="Perangkat Ajar"
          deskripsi="Buat dan kelola Modul Ajar, RPP, Silabus, dan dokumen ajar lainnya."
          href="/dashboard/perangkat-ajar"
          labelTombol="Buka Perangkat Ajar"
        />
      )}

      {bolehLihatPesertaDidik && (
        <KartuModul
          icon={Users}
          judul="Peserta Didik"
          deskripsi="Kelola data Peserta Didik, Wali, Kontak Darurat, dan Mutasi."
          href="/dashboard/peserta-didik"
          labelTombol="Buka Peserta Didik"
        />
      )}

      {bolehLihatImporPesertaDidik && (
        <KartuModul
          icon={Upload}
          judul="Impor/Ekspor Peserta Didik"
          deskripsi="Impor dan ekspor data Peserta Didik."
          href="/dashboard/impor-peserta-didik"
          labelTombol="Buka Impor/Ekspor"
        />
      )}

      {bolehLihatRombonganBelajar && (
        <KartuModul
          icon={GraduationCap}
          judul="Rombongan Belajar"
          deskripsi="Kelola Tingkat, Rombongan Belajar, Penempatan, dan Kenaikan Tingkat."
          href="/dashboard/rombongan-belajar"
          labelTombol="Buka Rombongan Belajar"
        />
      )}

      {bolehLihatTahunAjaran && (
        <KartuModul
          icon={Calendar}
          judul="Tahun Ajaran"
          deskripsi="Kelola Tahun Ajaran aktif dan riwayat."
          href="/dashboard/tahun-ajaran"
          labelTombol="Buka Tahun Ajaran"
        />
      )}

      {bolehLihatAkses && (
        <KartuModul
          icon={KeyRound}
          judul="Manajemen Akses"
          deskripsi="Kelola PTK, Pengguna, Izin, dan Pembatasan untuk Satuan Pendidikan ini."
          href="/dashboard/akses"
          labelTombol="Buka Manajemen Akses"
        />
      )}

      {bolehLihatBebanMengajar && (
        <KartuModul
          icon={Briefcase}
          judul="Beban Mengajar"
          deskripsi="Lihat Beban Mengajar dan Wali Kelas untuk periode aktif."
          href="/dashboard/beban-mengajar"
          labelTombol="Buka Beban Mengajar"
        />
      )}

      {bolehLihatPenilaian && (
        <KartuModul
          icon={ClipboardList}
          judul="Penilaian"
          deskripsi="Kelola Komponen Nilai, Penilaian, dan lihat Nilai Akhir."
          href="/dashboard/penilaian"
          labelTombol="Buka Penilaian"
        />
      )}

      {bolehLihatArsip && (
        <KartuModul
          icon={Archive}
          judul="Arsip Data"
          deskripsi="Kelola arsip, pemulihan data, retensi, dan riwayat perubahan."
          href="/dashboard/arsip"
          labelTombol="Buka Arsip Data"
        />
      )}

      {bolehLihatKurikulum && (
        <KartuModul
          icon={BookOpen}
          judul="Kurikulum"
          deskripsi="Jelajahi Kurikulum Merdeka: Mata Pelajaran, Fase, Capaian, dan Tujuan Pembelajaran."
          href="/dashboard/kurikulum"
          labelTombol="Buka Kurikulum"
        />
      )}
    </nav>
  );
}
