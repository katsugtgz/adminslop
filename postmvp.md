# EduAdmin Pro Premium — Post-MVP / Deferred

File ini memisahkan hal-hal yang sengaja **tidak** masuk MVP. Tujuannya agar
roadmap MVP tetap sempit dan agen implementasi tidak menghidupkan kembali scope
yang sudah dipotong.

## Prinsip Deferred

- Jangan sequence item di file ini ke MVP tanpa keputusan baru dari owner.
- Item deferred boleh diteliti, tetapi tidak dibangun sebagai bagian MVP.
- Jika ada item yang menyentuh data anak/orang tua/channel eksternal, keputusan
  berikutnya harus membahas consent, audit, minimization, retention, dan abuse.

## Daftar Post-MVP

| Item | Alasan ditunda | Trigger revisit |
|---|---|---|
| **GTM final shape** — school-first + free parent layer; Dinas/Kecamatan license | Butuh validasi market; Dinas-first terlalu lambat untuk awal. | Post-MVP business review. |
| **Dapodik retention duty** | Kewajiban legal belum tersumber jelas. | Compliance review post-MVP. |
| **Monetization final numbers** | Perlu validasi willingness-to-pay dan segmentasi sekolah. | Business review. |
| **Starter scaffold alternatif** | MVP dipilih build-from-scratch untuk security posture; starter hanya disposable jika velocity stall. | Jika velocity benar-benar menghambat. |
| **k-anonymity threshold** untuk leaderboard kecamatan | Re-identification risk belum terselesaikan. | Sebelum analytics/leaderboard publik. |
| **Gamification leaderboards** | Butuh k-anon gate dan desain anti-shaming. | Setelah k-anon resolved. |
| **Parent WhatsApp channel** | Channel eksternal untuk principal/orang tua membutuhkan consent, withdrawal, minimization, audit, anti-spam. | Setelah consent infra dan preferensi channel tersedia. |
| **WhatsApp Audit Pack** | Branded weekly cards tetap channel eksternal/consent-gated. | Bersama parent WhatsApp channel. |
| **Email notification automation** | Sama seperti WhatsApp: butuh consent, audit, anti-spam, dan preferensi channel. | Setelah pola Notifikasi in-app stabil. |
| **Parent-facing routine notifications** | Orang tua/wali bukan Pengguna MVP; perlu keputusan akses, consent, audit, dan bahasa komunikasi. | Setelah Wali Peserta Didik/consent model matang. |
| **Wali/parent login portal** | MVP hanya menyimpan Wali Peserta Didik sebagai kontak administratif, bukan Pengguna aplikasi. | Setelah model consent, akses, audit, dan data-minimization untuk wali matang. |
| **EduExam / CBT** | Anti-cheat online-required menjadi sistem terpisah. | Separate project. |
| **Lembar Jawaban config** | Config-only dan low value untuk MVP. | Post-MVP jika Bank Soal/Penilaian stabil. |
| **Cover Administrasi** | Tidak AI-heavy dan trivial. | Killed; build inline jika benar-benar dibutuhkan. |
| **Panduan Kurikulum** | Static docs, bukan core product flow. | Killed; host sebagai static assets jika perlu. |
| **Deterministic AI-assisted curriculum seeding** | MVP butuh approved CP/TP/ATP seed dulu; AI extraction baru aman dengan source snapshots, repeatable prompts/parsers, schema validation, golden diffs, provenance, human approval. | Setelah schema seed dan review workflow stabil. |
| **pgvector RAG over curriculum** | Retrieval belum perlu jika seed corpus cukup. | Jika seed-corpus retrieval terbukti kurang. |
| **Bantuan AI / RAG-based product help** | Butuh curated help corpus, retrieval safety, answer evaluation, dan baseline Panduan Penggunaan yang stabil. | Setelah core flows dan guidance copy stabil. |
| **Free-form/WYSIWYG print template editor** | MVP butuh Template Cetak product-controlled agar stabil, mudah dipakai pengguna nonteknis, dan testable dengan pixel-diff. | Setelah format resmi stabil dan ada QA layout yang mampu menangani variasi. |
| **Legal digital signature workflow** | MVP Tanda Tangan Cetak/Stempel Cetak hanya elemen output cetak, bukan legal digital signing. | Setelah kebutuhan hukum, audit, sertifikat, dan approval workflow jelas. |
| **Full offline product / offline sensitive actions** | MVP Mode Offline hanya untuk tugas aman; issuing E-Raport, Koreksi Data, dan Verifikasi Dokumen AI tetap online-only. | Setelah conflict rules, authorization, dan audit offline matang. |
| **Dashboard lintas Satuan Pendidikan / Instansi Pengelola** | MVP boundary operasional adalah satu Satuan Pendidikan Aktif; org-of-orgs berisiko memperluas tenancy. | Setelah kebutuhan pembelian/oversight multi-sekolah tervalidasi. |

## Boundary Channel Eksternal

Keputusan Q31: MVP memakai **Notifikasi/Pengingat in-app** untuk
**Tugas Tertunda**. Channel eksternal seperti WhatsApp, email, atau parent-facing
messages ditunda sampai tersedia:

- consent eksplisit dan withdrawal;
- Catatan Audit untuk pengiriman penting;
- minimization agar data anak tidak bocor;
- anti-spam/rate limit;
- Preferensi Notifikasi/channel;
- aturan siapa penerima yang sah, terutama untuk Wali Peserta Didik.
