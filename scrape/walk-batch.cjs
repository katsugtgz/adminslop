// BATCH_INDEX placeholder
const eduBatch = [];
const ALL = ['Profil Saya','Pengaturan Sekolah','Panduan Kurikulum','Data Siswa','Jadwal Pelajaran','Kalender Akademik','Rencana Kerja','Manajemen Ekskul','Portofolio Prestasi','Jurnal Agenda Guru','Penilaian Siswa','E-Raport Siswa','Absensi Scan Real-time','Input Nilai Mapel','Input Nilai Ekskul','Input Rekap Absensi','Cover Administrasi','Program Tahunan','Program Semester','Alur Tujuan Pemb.','Modul Ajar / RPM','Bahan Ajar','Modul Kokurikuler','Program Asesmen','LKPD','KKTP (Kriteria)','Bank Soal AI','Lembar Jawaban Siswa'];
const START = BATCH_START;
const END = BATCH_END;
const targets = ALL.slice(START, END);
for (const name of targets) {
  const btn = page.locator('button', { hasText: name }).first();
  try { await btn.click({ timeout: 4000 }); }
  catch (_e) { await btn.scrollIntoViewIfNeeded().catch(()=>{}); await btn.click({ timeout: 4000 }).catch(()=>{}); }
  await page.waitForTimeout(1500);
  const modalBtn = page.locator('button', { hasText: /^(Baik, Saya Paham|Saya Mengerti & Lanjut)$/ }).first();
  if (await modalBtn.count() > 0) { await modalBtn.click().catch(()=>{}); await page.waitForTimeout(400); }
  await page.waitForTimeout(900);
  const text = await page.evaluate(() => {
    const el = document.querySelector('#document-preview') ||
               document.querySelector('main') ||
               document.querySelector('.bank-soal-content') ||
               document.querySelector('.perencanaan-content') ||
               document.querySelector('.penilaian-content') ||
               document.body;
    return el ? el.innerText.slice(0, 8000) : '';
  });
  eduBatch.push({ name, text });
}
JSON.stringify(eduBatch);
