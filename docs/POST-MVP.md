# Post-MVP — Fitur yang Dikecualikan secara Eksplisit

Dokumen ini mencantumkan fitur yang **tidak termasuk** dalam MVP EduAdmin Pro
Premium beserta alasan singkat pengecualiannya. Tujuannya agar tim, pemilik
produk, dan agen tidak secara keliru memasukkan pekerjaan ini ke dalam cakupan
MVP. Setiap fitur memerlukan keputusan terpisah (ADR) sebelum dikerjakan.

MVP berfokus pada identitas, tenancy multi-Satuan Pendidikan, data Pokok,
Penilaian, Permintaan AI dengan verifikasi, dan dasar E-Raport berbasis cetak
pratinjau. Fitur di bawah ini ditangguhkan.

## 1. Portal Wali Murid (parent portal)

Antarmuka terpisah untuk orang tua/wali Peserta Didik melihat nilai, absensi,
dan E-Raport anak.

**Kenapa dikecualikan:** memerlukan model data wali-murid yang terpisah,
autentikasi terpisah untuk peran non-PTK, dan alur persetujuan privasi yang
belum disepakati pemilik produk. Di luar cakupan MVP.

## 2. Otomasi WhatsApp/email

Pengiriman otomatis rapor, tagihan, pengumuman, atau notifikasi absensi ke
PTK/wali murid via WhatsApp Gateway atau SMTP relayer.

**Kenapa dikecualikan:** biaya gateway per-pesan, kompleksitas manajemen
template multi-bahasa, dan kepatuhan terhadap UU PDP (Pemberitahuan,
Persetujuan) yang belum di-ADR-kan. Ditangguhkan.

## 3. Tanda tangan digital legal (Sertifikat Elektronik / TTD BSrE)

Validasi identitas penandatanganan E-Raport dengan sertifikat elektronik
tersertifikasi (BSrE / penyelenggara tersertifikasi).

**Kenapa dikecualikan:** kompleksitas hukum-regulatoris (UU ITE, PerMenkominfo
tentang Tanda Tangan Elektronik), biaya integrasi Kominfo/BSrE, dan ketergantungan
pada KTP-e / identitas digital. Tanda Tangan di MVP hanya elemen cetak statis
di pratinjau E-Raport. Ditangguhkan.

## 4. Editor WYSIWYG rapor

Editor visual seret-jatuh untuk mendesain tata letak E-Raport kustom per
Satuan Pendidikan (logo, kop, font, blok nilai).

**Kenapa dikecualikan:** kompleksitas rendering tinggi (Canvas/HTML-to-PDF),
pertukaran desain vs. konsistensi cetak lintas browser, dan dependensi pustaka
berat yang belum dipilih. MVP menggunakan pratinjau cetak standar A4/F4.
Ditangguhkan.

## 5. Dashboard lintas Satuan Pendidikan

Agregasi data (jumlah Peserta Didik, rata-rata nilai, status PTK) lintas
beberapa Satuan Pendidikan untuk pengguna multi-tenant (mis. yayasan).

**Kenapa dikecualikan:** model otorisasi saat ini membatasi pengguna ke
**satu** Satuan Pendidikan Aktif pada satu waktu. Agregasi lintas-tenant
memerlukan lapisan izin baru (`lintas_satuan:baca`), RLS khusus, dan
pertimbangan privasi antar-yayasan. Di luar cakupan MVP.

## 6. Kolaborasi real-time

Edit paralel oleh beberapa PTK pada entitas yang sama (mis. Penilaian kelas
yang sama oleh dua guru) dengan sinkronisasi langsung (CRDT/WebSocket).

**Kenapa dikecualikan:** memerlukan infrastruktur realtime (WebSocket/SSE),
strategi resolusi konflik, dan model kunci-entitas yang belum dirancang.
MVP menggunakan model optimistic-concurrency sederhana di tingkat server action.
Ditangguhkan.

## 7. Analitik lanjutan

Dashboard analitik prediktif (identifikasi Peserta Didik berisiko, prediksi
ketuntasan, clustering kelas) berbasis ML / pgvector.

**Kenapa dikecualikan:** skema pelatihan model, pipeline fitur, biaya inferensi,
dan tata kelola data (HIPAA-equivalent untuk data Peserta Didik di bawah umur)
belum diselesaikan. `pgvector` tersedia di infrastruktur, tetapi tidak ada
konsumen pada MVP. Ditangguhkan.

---

## Catatan untuk Agen & Kontributor

- Jika sebuah issue menyentuh salah satu fitur di atas, **tandai sebagai
  `wontfix` untuk MVP** dan rujuk dokumen ini, kecuali pemilik produk sudah
  menulis ADR yang secara eksplisit mengaktifkannya.
- Fitur enterprise WorkOS (SSO, Directory Sync/SCIM, MFA enforcement, Admin
  Portal, Widgets, FGA, Vault, Radar, Custom Domains) juga ditangguhkan —
  lihat `AGENTS.md` § "Identity and access".
- Untuk daftar positif apa saja yang ADA di MVP, lihat `hyperplan/plan.md`
  dan ringkasan modul di `src/components/dashboard-aktif.tsx`.
