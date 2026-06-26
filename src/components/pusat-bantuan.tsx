import Link from "next/link";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Bagaimana cara memilih Satuan Pendidikan?",
    a: "Setelah masuk, buka Dashboard. Jika Anda memiliki lebih dari satu Keanggotaan Satuan Pendidikan, Anda akan diminta memilih Satuan Pendidikan Aktif. Pilihan ini menentukan ruang data yang dapat Anda kelola; data antar Satuan Pendidikan selalu terisolasi.",
  },
  {
    q: "Bagaimana cara menambah Peserta Didik?",
    a: "Pada dashboard Satuan Pendidikan Aktif, pilih modul Peserta Didik. Admin dan Kepala Sekolah dapat menambah Peserta Didik baru lengkap dengan data Wali, Kontak Darurat, dan mutasi. Guru dan Wali Kelas dapat melihat data sesuai peran masing-masing.",
  },
  {
    q: "Bagaimana cara mencatat nilai?",
    a: "Buka modul Penilaian. Buat Komponen Nilai (misalnya Formatif, Sumatif), kemudian catat Penilaian per Peserta Didik. Nilai Akhir dihitung otomatis dari komponen yang Anda tentukan. Modul Penilaian menerapkan DUAL otorisasi: hanya pemilik data yang dapat mengubah catatan nilai.",
  },
  {
    q: "Bagaimana cara mencetak E-Raport?",
    a: "Pada versi MVP, cetak E-Raport berfokus pada pratinjau cetak (print preview) dengan dukungan kertas A4/F4 lewat media query CSS @page. Tombol cetak memunculkan dialog cetak browser; Anda dapat menyimpan hasil ke PDF atau mencetak langsung.",
  },
  {
    q: "Apa saja batasan MVP?",
    a: "MVP mencakup identitas, tenancy multi-Satuan Pendidikan, data Pokok, Penilaian, Permintaan AI dengan verifikasi, serta dasar E-Raport. Fitur lanjutan seperti portal wali murid, otomasi WhatsApp/email, tanda tangan digital legal, editor WYSIWYG untuk rapor, dashboard lintas Satuan Pendidikan, kolaborasi real-time, dan analitik lanjutan TIDAK termasuk MVP. Lihat docs/POST-MVP.md untuk detail.",
  },
];

export function PusatBantuan() {
  return (
    <article className="flex max-w-none flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Pusat Bantuan</h1>
        <p className="text-sm text-muted-foreground">
          Pertanyaan yang sering diajukan tentang penggunaan EduAdmin Pro
          Premium. Untuk panduan langkah demi langkah, lihat juga{" "}
          <Link
            href="/panduan"
            className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Panduan Penggunaan
          </Link>
          .
        </p>
      </header>

      <section aria-labelledby="faq-judul" className="flex flex-col gap-4">
        <h2 id="faq-judul" className="text-lg font-semibold tracking-tight">
          Pertanyaan yang sering diajukan
        </h2>
        <ul className="flex flex-col gap-4">
          {FAQ.map((item) => (
            <li
              key={item.q}
              className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm"
            >
              <h3 className="text-base font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="bantuan-kontak-judul"
        className="rounded-xl border border-border bg-muted/40 p-5"
      >
        <h2
          id="bantuan-kontak-judul"
          className="text-base font-semibold tracking-tight"
        >
          Masih butuh bantuan?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hubungi Admin Satuan Pendidikan Anda. Admin dapat mengelola Keanggotaan
          dan Izin melalui modul Manajemen Akses.
        </p>
      </section>
    </article>
  );
}
