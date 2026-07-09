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
  type LucideIcon,
} from "lucide-react";

import { KartuModul, type TampilanKartuModul } from "./kartu-modul";
import type { IzinReachability } from "./izin-reachability";

type ModulDashboard = {
  readonly visible: boolean;
  readonly icon: LucideIcon;
  readonly judul: string;
  readonly deskripsi: string;
  readonly href: string;
  readonly labelTombol: string;
  readonly tampilan?: TampilanKartuModul;
};

type GrupModul = {
  readonly judul: string;
  readonly deskripsi: string;
  readonly modules: readonly ModulDashboard[];
};

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

  const grupModul: readonly GrupModul[] = [
    {
      judul: "Operasional harian",
      deskripsi: "Alur kerja yang paling sering dibuka saat hari sekolah.",
      modules: [
        {
          visible: bolehLihatSinkronisasi, icon: CloudOff,
          judul: "Sinkronisasi Data (Mode Offline)",
          deskripsi: "Lihat draf tertunda dan sinkronkan saat tersambung kembali.",
          href: "/dashboard/sinkronisasi", labelTombol: "Buka Sinkronisasi Data",
          tampilan: "utama",
        },
        {
          visible: bolehLihatAbsensi, icon: CalendarCheck,
          judul: "Absensi Harian",
          deskripsi: "Catat kehadiran harian Peserta Didik.",
          href: "/dashboard/absensi", labelTombol: "Buka Absensi Harian",
        },
        {
          visible: bolehLihatNotifikasi, icon: Bell,
          judul: "Notifikasi",
          deskripsi: "Lihat pengingat tugas tertunda dan kelola preferensi notifikasi.",
          href: "/dashboard/notifikasi", labelTombol: "Buka Notifikasi",
          tampilan: "ringkas",
        },
      ],
    },
    {
      judul: "Akademik",
      deskripsi: "Data pembelajaran, rombongan, dan periode akademik.",
      modules: [
        {
          visible: bolehLihatPesertaDidik, icon: Users,
          judul: "Peserta Didik",
          deskripsi: "Kelola data Peserta Didik, Wali, Kontak Darurat, dan Mutasi.",
          href: "/dashboard/peserta-didik", labelTombol: "Buka Peserta Didik",
          tampilan: "utama",
        },
        {
          visible: bolehLihatRombonganBelajar, icon: GraduationCap,
          judul: "Rombongan Belajar",
          deskripsi: "Kelola Tingkat, Rombongan Belajar, Penempatan, dan Kenaikan Tingkat.",
          href: "/dashboard/rombongan-belajar", labelTombol: "Buka Rombongan Belajar",
        },
        {
          visible: bolehLihatTahunAjaran, icon: Calendar,
          judul: "Tahun Ajaran",
          deskripsi: "Kelola Tahun Ajaran aktif dan riwayat.",
          href: "/dashboard/tahun-ajaran", labelTombol: "Buka Tahun Ajaran",
        },
        {
          visible: bolehLihatBebanMengajar, icon: Briefcase,
          judul: "Beban Mengajar",
          deskripsi: "Lihat Beban Mengajar dan Wali Kelas untuk periode aktif.",
          href: "/dashboard/beban-mengajar", labelTombol: "Buka Beban Mengajar",
        },
        {
          visible: bolehLihatKurikulum, icon: BookOpen,
          judul: "Kurikulum",
          deskripsi: "Jelajahi Kurikulum Merdeka: Mata Pelajaran, Fase, Capaian, dan Tujuan Pembelajaran.",
          href: "/dashboard/kurikulum", labelTombol: "Buka Kurikulum",
          tampilan: "ringkas",
        },
      ],
    },
    {
      judul: "Dokumen & AI",
      deskripsi: "Penilaian, dokumen ajar, E-Raport, cetak, dan bantuan AI.",
      modules: [
        {
          visible: bolehLihatPenilaian, icon: ClipboardList,
          judul: "Penilaian",
          deskripsi: "Kelola Komponen Nilai, Penilaian, dan lihat Nilai Akhir.",
          href: "/dashboard/penilaian", labelTombol: "Buka Penilaian",
          tampilan: "utama",
        },
        {
          visible: bolehLihatEraport, icon: FileText,
          judul: "E-Raport",
          deskripsi: "Kelola Draf, Terbit, dan Revisi E-Raport.",
          href: "/dashboard/eraport", labelTombol: "Buka E-Raport",
        },
        {
          visible: bolehLihatCetak, icon: Printer,
          judul: "Cetak E-Raport",
          deskripsi: "Pratinjau dan cetak E-Raport dengan Template Cetak.",
          href: "/dashboard/cetak", labelTombol: "Buka Cetak",
        },
        {
          visible: bolehLihatBankSoal, icon: FileQuestion,
          judul: "Bank Soal",
          deskripsi: "Kelola Butir Soal dan rakit Paket Soal.",
          href: "/dashboard/bank-soal", labelTombol: "Buka Bank Soal",
        },
        {
          visible: bolehLihatPerangkatAjar, icon: BookMarked,
          judul: "Perangkat Ajar",
          deskripsi: "Buat dan kelola Modul Ajar, RPP, Silabus, dan dokumen ajar lainnya.",
          href: "/dashboard/perangkat-ajar", labelTombol: "Buka Perangkat Ajar",
        },
        {
          visible: bolehLihatPermintaanAi, icon: Bot,
          judul: "Permintaan AI",
          deskripsi: "Buat permintaan AI dan verifikasi draf.",
          href: "/dashboard/permintaan-ai", labelTombol: "Buka Permintaan AI",
          tampilan: "ringkas",
        },
      ],
    },
    {
      judul: "Akses & tata kelola",
      deskripsi: "Peran, impor data, retensi, dan pemulihan arsip.",
      modules: [
        {
          visible: bolehLihatAkses, icon: KeyRound,
          judul: "Manajemen Akses",
          deskripsi: "Kelola PTK, Pengguna, Izin, dan Pembatasan untuk Satuan Pendidikan ini.",
          href: "/dashboard/akses", labelTombol: "Buka Manajemen Akses",
          tampilan: "utama",
        },
        {
          visible: bolehLihatImporPesertaDidik, icon: Upload,
          judul: "Impor/Ekspor Peserta Didik",
          deskripsi: "Impor dan ekspor data Peserta Didik.",
          href: "/dashboard/impor-peserta-didik", labelTombol: "Buka Impor/Ekspor",
        },
        {
          visible: bolehLihatArsip, icon: Archive,
          judul: "Arsip Data",
          deskripsi: "Kelola arsip, pemulihan data, retensi, dan riwayat perubahan.",
          href: "/dashboard/arsip", labelTombol: "Buka Arsip Data",
        },
      ],
    },
  ];

  return (
    <nav aria-label="Modul Satuan Pendidikan" className="flex flex-col gap-6">
      {grupModul.map((grup) => {
        const modules = grup.modules.filter((modul) => modul.visible);
        if (modules.length === 0) return null;
        const headingId = `modul-${grup.judul
          .toLowerCase()
          .replaceAll(" & ", "-")
          .replaceAll(" ", "-")}`;

        return (
          <section
            key={grup.judul}
            aria-labelledby={headingId}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <h2
                id={headingId}
                className="font-display text-xl tracking-tight text-foreground"
              >
                {grup.judul}
              </h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {grup.deskripsi}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {modules.map((modul) => (
                <KartuModul
                  key={modul.href}
                  icon={modul.icon}
                  judul={modul.judul}
                  deskripsi={modul.deskripsi}
                  href={modul.href}
                  labelTombol={modul.labelTombol}
                  tampilan={modul.tampilan}
                />
              ))}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
