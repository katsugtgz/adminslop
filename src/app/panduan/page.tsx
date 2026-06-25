import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Panduan Penggunaan",
  description:
    "Panduan Penggunaan dan Tur Awal untuk EduAdmin Pro Premium dalam Bahasa Indonesia.",
};

export default function PanduanPage() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1>Panduan Penggunaan</h1>
      <p className="text-muted-foreground">
        Halaman ini akan menjadi titik masuk <strong>Tur Awal</strong> dan
        <strong> Bantuan Kontekstual</strong> bagi Pengguna baru. Konten
        lengkap akan ditambahkan ketika modul mulai aktif.
      </p>

      <h2>Langkah berikutnya</h2>
      <ol>
        <li>Pengguna masuk dengan akun yang terdaftar.</li>
        <li>Pengguna memilih Satuan Pendidikan Aktif.</li>
        <li>Pengguna mulai mengelola Peserta Didik dan Nilai.</li>
      </ol>

      <Button asChild className="not-prose">
        <Link href="/">Kembali ke Beranda</Link>
      </Button>
    </article>
  );
}
