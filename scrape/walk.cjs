const eduWalk2026 = [];
const eduBtns = await page.locator('button', { hasText: /^(Profil Saya|Pengaturan Sekolah|Panduan Kurikulum|Data Siswa|Jadwal Pelajaran|Kalender Akademik|Rencana Kerja|Manajemen Ekskul|Portofolio Prestasi|Jurnal Agenda Guru|Penilaian Siswa|E-Raport Siswa|Absensi Scan Real-time|Input Nilai Mapel|Input Nilai Ekskul|Input Rekap Absensi|Cover Administrasi|Program Tahunan|Program Semester|Alur Tujuan Pemb\.|Modul Ajar \/ RPM|Bahan Ajar|Modul Kokurikuler|Program Asesmen|LKPD|KKTP|Bank Soal AI|Lembar Jawaban Siswa)$/ }).all();
for (const btn of eduBtns) {
  const name = (await btn.innerText()).trim();
  try { await btn.click({ timeout: 5000 }); }
  catch (_e) { await btn.scrollIntoViewIfNeeded().catch(()=>{}); await btn.click({ timeout: 5000 }); }
  await page.waitForTimeout(2200);
  for (const txt of ['Baik, Saya Paham', 'Saya Mengerti & Lanjut', 'Tutup']) {
    const b = page.locator('button', { hasText: txt });
    if (await b.count() > 0) { await b.first().click().catch(()=>{}); await page.waitForTimeout(600); }
  }
  await page.waitForTimeout(1200);
  const text = await page.evaluate(() => {
    const el = document.querySelector('#document-preview') ||
               document.querySelector('main') ||
               document.querySelector('.bank-soal-content') ||
               document.querySelector('.perencanaan-content') ||
               document.querySelector('.penilaian-content') ||
               document.body;
    return el ? el.innerText.slice(0, 10000) : '';
  });
  eduWalk2026.push({ name, text });
}
JSON.stringify(eduWalk2026);
