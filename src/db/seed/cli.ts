import path from "node:path";
import pg from "pg";

import { createDb } from "../client";
import { runMigrations } from "../migrate";
import { seedReferensiKurikulum } from "./referensi";
import { cleanupTenant, seedTenant, DEMO_TENANTS, AKTOR_SEED } from "./tenant";
import { assertLocalOrForced, assertSameDb } from "./guard";

// Load .env (Node native; no-op jika tak ada).
try {
  process.loadEnvFile?.();
} catch {
  /* .env absen — andalkan env asli */
}

const MIG_URL = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;

async function main() {
  if (!MIG_URL) {
    console.error("DATABASE_MIGRATOR_URL (atau DATABASE_URL) wajib untuk seed.");
    process.exit(1);
  }
  if (!APP_URL) {
    console.error("DATABASE_URL (app_user, RLS) wajib untuk seed data tenant.");
    process.exit(1);
  }

  // Safety guard: seed destruktif (migrasi + cleanupTenant). Tolak host
  // non-lokal kecuali SEED_FORCE=true di-set sadar.
  assertLocalOrForced("DATABASE_MIGRATOR_URL", MIG_URL);
  assertLocalOrForced("DATABASE_URL", APP_URL);
  // Migrasi + cleanup jalan di MIG; insert data di APP. Mismatch = inkonsisten.
  assertSameDb(MIG_URL, APP_URL);

  // 1. Migrasi sebagai superuser (idempotent — skip yang sudah terapan).
  const migDir = path.join(process.cwd(), "src", "db", "migrations");
  const applied = await runMigrations(MIG_URL, migDir);
  console.log(`[seed] migrasi: ${applied.length} file diperiksa.`);

  const mig = new pg.Pool({ connectionString: MIG_URL });

  // 2. Referensi kurikulum GLOBAL (migrator).
  await seedReferensiKurikulum(mig);
  console.log("[seed] referensi kurikulum (mapel/fase/CP/TP) di-upsert.");

  // 3. Registrasi satuan_pendidikan (migrator, no RLS) + profil/pengaturan.
  for (const t of DEMO_TENANTS) {
    await mig.query(
      `INSERT INTO satuan_pendidikan
         (id, nama, npsn, jenjang, alamat, nama_kepala,
          tahun_ajaran_aktif, semester_aktif, zona_waktu)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ganjil','Asia/Jakarta')
       ON CONFLICT (id) DO UPDATE SET
         nama = EXCLUDED.nama,
         npsn = EXCLUDED.npsn,
         jenjang = EXCLUDED.jenjang,
         alamat = EXCLUDED.alamat,
         nama_kepala = EXCLUDED.nama_kepala,
         tahun_ajaran_aktif = EXCLUDED.tahun_ajaran_aktif,
         semester_aktif = EXCLUDED.semester_aktif`,
      [t.id, t.nama, t.npsn, t.jenjang, t.alamat, t.kepalaNama, t.taAktif],
    );
  }
  console.log(`[seed] ${DEMO_TENANTS.length} satuan pendidikan demo di-upsert.`);

  // 4. Bersihkan + isi ulang tiap tenant. Cleanup = migrator (bypass RLS);
  //    insert data = app_user via withTenant (RLS WITH CHECK tervalidasi).
  const { db, pool } = createDb(APP_URL);
  for (const t of DEMO_TENANTS) {
    await cleanupTenant(mig, t.id);
    await seedTenant(db, t);
    console.log(`[seed] ✓ ${t.nama} (${t.id}) terisi.`);
  }
  await pool.end();
  await mig.end();

  console.log(
    `\n[seed] selesai. Aktor penanda: "${AKTOR_SEED}".\n` +
      `Login dev: set DEV_MEMBERSHIP_ALL=true, lalu pilih satuan pendidikan di UI.\n` +
      `(opsional) DEV_SEED_USER_ID=<userId WorkOS Anda> biar pengguna dev cocok dengan login Anda.)`,
  );
}

main().catch((err) => {
  console.error("[seed] gagal:", err);
  process.exit(1);
});
