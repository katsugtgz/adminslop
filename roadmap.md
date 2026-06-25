# EduAdmin Pro Premium — Roadmap MVP

Roadmap ini memisahkan urutan kerja MVP dari catatan hyperplan yang lebih
panjang. Detail teknis dan alasan arsitektur tetap ada di `hyperplan/plan.md`;
daftar fitur yang sengaja ditunda ada di `postmvp.md`.

## Prinsip MVP

- Bangun hanya 7 modul MVP hasil collapse dari 28 modul sumber.
- Gunakan Bahasa Indonesia untuk UI.
- HP/mobile adalah target utama; desktop mengikuti secara responsif.
- WCAG/A11Y adalah baseline: teks terbaca, tap target besar, label jelas,
  fokus keyboard, kontras, dan semantik screen reader.
- **Panduan Penggunaan** wajib ada di core flow melalui **Tur Awal** dan
  **Bantuan Kontekstual**. AI help bukan pengganti UI yang jelas.
- **Notifikasi** dan **Pengingat** MVP bersifat in-app untuk **Tugas Tertunda**
  di konteks **Satuan Pendidikan** yang relevan.
- Channel eksternal seperti WhatsApp, email, atau notifikasi orang tua tidak
  termasuk MVP; lihat `postmvp.md`.

## Boundary MVP dari Interview Domain

Ringkasan ini hanya mengambil keputusan yang berdampak ke scope MVP, bukan
menyalin seluruh glossary `CONTEXT.md`.

- **Tenant/context:** semua operasi berjalan di satu **Satuan Pendidikan Aktif**.
  Dashboard lintas Satuan Pendidikan bukan MVP.
- **Akses:** **Peran Akses**, **Izin Akses**, dan **Pembatasan Akses** selalu
  scoped ke satu Satuan Pendidikan melalui Keanggotaan Satuan Pendidikan. Tidak
  ada superuser global.
- **Peserta Didik:** data Peserta Didik adalah record operasional di satu
  Satuan Pendidikan. Riwayat nilai, absensi, E-Raport, rombel, dan lifecycle
  tidak dihapus diam-diam.
- **Wali Peserta Didik:** MVP menyimpan kontak/penanggung jawab administratif;
  wali/orang tua tidak otomatis menjadi Pengguna aplikasi.
- **AI:** **Permintaan AI** menghasilkan **Draf AI**, bukan konten final.
  Dokumen AI tetap perlu Verifikasi Dokumen AI oleh Guru.
- **Kurikulum:** MVP memakai seed CP/TP/ATP yang approved, curated, dan
  versioned. AI-assisted deterministic seeding tetap Post-MVP.
- **Print/export:** MVP memakai **Template Cetak** product-controlled,
  **Preferensi Cetak** terbatas, **Identitas Cetak**, **Tanda Tangan Cetak**,
  dan **Stempel Cetak** sebagai elemen output cetak — bukan legal digital
  signature atau approval otomatis.
- **Import/export:** **Impor Data** dan **Ekspor Data** scoped ke Satuan
  Pendidikan Aktif, memakai Template/Validasi/Hasil Impor, dan tidak melakukan
  silent overwrite/merge.
- **Arsip/delete:** data penting memakai Arsip Data/Penghapusan Data terkontrol,
  Pemulihan Data, Retensi Data, dan Catatan Audit; hard delete hanya kasus khusus.
- **Offline:** Mode Offline hanya untuk tugas aman terbatas seperti Absensi
  Harian, draft Nilai Peserta Didik, jadwal/jurnal, dan cached print. Aksi
  sensitif tetap online-only.

## Modul MVP

| # | Modul MVP | Fokus |
|---|---|---|
| 1 | **Profil Saya** | Profil pengguna/PTK minimal, kontak, data kerja. |
| 2 | **Pengaturan Sekolah** | Profil/Pengaturan Satuan Pendidikan, logo, zona waktu, tahun ajaran/semester aktif, preferensi cetak. |
| 3 | **Data Siswa** | Peserta Didik, rombel, import terkontrol, kartu QR. |
| 4 | **Input Nilai + E-Raport** | Tracer bullet: Nilai Peserta Didik → Nilai Akhir → E-Raport → cetak/export. |
| 5 | **Bank Soal** | Butir Soal, Bank Soal, Paket Soal, AI draft, kunci, pembahasan. |
| 6 | **Perangkat Ajar** | Shell generator terpadu untuk berbagai Jenis Perangkat Ajar. |
| 7 | **Absensi QR** | Absensi Harian dengan QR sebagai metode input; rekap untuk E-Raport. |

## Gelombang Eksekusi

| Wave | Fase | Tujuan | Gate |
|---|---|---|---|
| W1 | **Phase 0 — Bootstrap & Tooling** | Repo runnable, stack fixed, CI dasar, Bahasa baseline. | Build/typecheck/lint hijau, `/health` 200. |
| W2 | **Phase 1 — Tenancy & Compliance Foundation** | RLS setiap tabel, audit, tenant context, enkripsi PII, waktu/kalender. | Cross-tenant isolation dan RLS linter hijau. |
| W3 | **Phase 2 — Auth Foundation** | WorkOS AuthKit, session httpOnly, organisasi/membership/role mapping. | Tenant switch aman, no client JWT, role revoke efektif. |
| W4 | **Phase 3 ∥ Phase 4** | AI core dan print/export core berjalan paralel. | AI job/provenance/signature gate dan print matrix dasar hijau. |
| W5 | **Phase 5 — Tracer Bullet E-Raport** | Login → Data Siswa → Nilai → AI deskripsi → E-Raport → print/export. | E2E tracer bullet dan cross-tenant isolation hijau. |
| W6 | **Phase 6a ∥ 6b ∥ 6c** | Bank Soal, Perangkat Ajar, Absensi QR. | E2E per modul, provenance/signature/print sesuai modul. |
| W7 | **Phase 7 — Offline-first Terbatas** | Mode Offline untuk daily ops aman. | Draft offline sync, stale writes ditolak, cached print aman. |
| W8 | **Phase 8 — Ship Gate & Hardening** | Compliance, security, print matrix penuh, mobile/A11Y, UU PDP. | Semua gate rilis hijau. |

## Gate Produk yang Tidak Boleh Dinegosiasi

- RLS di setiap tabel tenant-scoped.
- `SET LOCAL app.tenant_id` per transaksi.
- Audit/Catatan Audit untuk sensitive writes.
- Provenance untuk setiap Dokumen AI.
- Verifikasi Dokumen AI oleh Guru sebelum dokumen digunakan sebagai siap pakai.
- `tenant_role` / Peran Akses tidak pernah menjadi superuser global.
- Session server-side opaque via httpOnly cookie.
- Print/export A4 + F4 saja untuk MVP, dengan Template Cetak terkontrol.
- Import/export tidak boleh silent-overwrite, auto-merge lintas sekolah, atau
  bypass Validasi Impor.
- Mode Offline tidak boleh menerbitkan E-Raport, melakukan Koreksi Data, atau
  menyelesaikan Verifikasi Dokumen AI.

## Notifikasi MVP

MVP hanya mencakup:

- **Notifikasi** in-app untuk hal yang perlu perhatian.
- **Pengingat** in-app untuk pekerjaan menjelang/sekitar tenggat.
- **Tugas Tertunda** seperti nilai belum diisi, E-Raport belum diterbitkan,
  Verifikasi Dokumen AI belum selesai, atau Perubahan Tertunda belum sinkron.
- **Preferensi Notifikasi** dasar untuk pilihan notifikasi di aplikasi.

MVP tidak mencakup WhatsApp/email automation, parent-facing routine messages,
atau broadcast eksternal. Semua channel eksternal masuk `postmvp.md` karena
membutuhkan consent, audit, anti-spam, dan preferensi channel.
