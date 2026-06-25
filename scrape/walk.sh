#!/usr/bin/env bash
set -u
SESS="eduadmin"
OUT="/Users/ktz/adminslop/scrape"
mkdir -p "$OUT/pages"
i=0
while IFS= read -r name; do
  i=$((i+1))
  nn=$(printf "%02d" "$i")
  slug=$(echo "$name" | tr '[:upper:]' '[:lower:]' | tr ' /' '__' | tr -cd 'a-z0-9_')
  echo "=== [$nn] $name -> $slug ==="
  agent-browser --session "$SESS" eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='$name');if(b){b.click();return'ok';}return'no_match';})()" 2>&1 | tail -1
  agent-browser --session "$SESS" wait 2500 2>&1 | tail -1
  for txt in 'Saya Mengerti & Lanjut' 'Baik, Saya Paham' 'Tutup'; do
    agent-browser --session "$SESS" eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='$txt');if(b){b.click();return'ok';}return'no';})()" 2>/dev/null | tail -1
    agent-browser --session "$SESS" wait 400 2>&1 | tail -1
  done
  agent-browser --session "$SESS" wait 1200 2>&1 | tail -1
  agent-browser --session "$SESS" eval 'JSON.stringify({h:(document.querySelector("h1,h2,h3")||{}).innerText, main:(document.querySelector("#document-preview")||document.querySelector("main")||document.querySelector(".bank-soal-content")||document.querySelector(".perencanaan-content")||document.querySelector(".penilaian-content")||document.body).innerText.slice(0,9000)})' > "$OUT/pages/${nn}-${slug}.json" 2>&1
  agent-browser --session "$SESS" screenshot "$OUT/pages/${nn}-${slug}.png" 2>&1 | tail -1
done <<'MODULES'
Profil Saya
Pengaturan Sekolah
Panduan Kurikulum
Data Siswa
Jadwal Pelajaran
Kalender Akademik
Rencana Kerja
Manajemen Ekskul
Portofolio Prestasi
Jurnal Agenda Guru
Penilaian Siswa
E-Raport Siswa
Absensi Scan Real-time
Input Nilai Mapel
Input Nilai Ekskul
Input Rekap Absensi
Cover Administrasi
Program Tahunan
Program Semester
Alur Tujuan Pemb.
Modul Ajar / RPM
Bahan Ajar
Modul Kokurikuler
Program Asesmen
LKPD
KKTP (Kriteria)
Bank Soal AI
Lembar Jawaban Siswa
MODULES
echo "DONE"
