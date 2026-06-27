import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { AKTOR_SEED, cleanupTenant, DEMO_TENANTS, seedTenant } from "./tenant";
import { seedReferensiKurikulum } from "./referensi";
import { uuidDeterministik } from "./names";

// Load .env.
try {
  process.loadEnvFile?.();
} catch {
  /* rely on real env */
}

const APP_URL = process.env.DATABASE_URL;
const MIG_URL = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
const ready = Boolean(APP_URL && MIG_URL);
const describeOrSkip = ready ? describe : describe.skip;

/**
 * Integration smoke test untuk seed dev/e2e (TDD guard). Migrasi + seed dua
 * tenant demo lalu assertions:
 *  - counts per tenant > 0 (semua form terisi)
 *  - 5 jenis butir soal hadir
 *  - RLS: no-GUC = 0 baris tenant-scoped; cross-tenant read = 0
 *  - eraport invariant (revisi row ⟺ status='revisi'); dokumen_cetak only terbit
 *  - id deterministik (idempotensi: re-seed = id sama)
 *
 * Berjalan sequential (db project, fileParallelism:false) — tak berkontaminasi
 * test db lain (tenant demo berbeda dari org_A/org_B rls.test.ts).
 */
describeOrSkip("seed dev (e2e fixture)", () => {
  let db: Db;
  let mig: pg.Pool;
  const t = DEMO_TENANTS[0]!; // org_smp_harapan

  beforeAll(async () => {
    // 1. Migrasi superuser.
    await runMigrations(MIG_URL!, path.join(process.cwd(), "src/db/migrations"));
    mig = new pg.Pool({ connectionString: MIG_URL! });

    // 2. Referensi GLOBAL + registrasi satuan (idempotent).
    await seedReferensiKurikulum(mig);
    for (const demo of DEMO_TENANTS) {
      await mig.query(
        `INSERT INTO satuan_pendidikan (id, nama, npsn, jenjang, alamat, nama_kepala,
            tahun_ajaran_aktif, semester_aktif, zona_waktu)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ganjil','Asia/Jakarta')
         ON CONFLICT (id) DO UPDATE SET nama=EXCLUDED.nama`,
        [demo.id, demo.nama, demo.npsn, demo.jenjang, demo.alamat, demo.kepalaNama, demo.taAktif],
      );
      await cleanupTenant(mig, demo.id);
    }

    // 3. Seed tenant via app_user (RLS WITH CHECK tervalidasi).
    db = createDb(APP_URL!).db;
    for (const demo of DEMO_TENANTS) {
      await seedTenant(db, demo);
    }
  }, 60_000);

  it("semua entitas inti terisi (>0) per tenant", async () => {
    const rows = await withTenant(db, t.id, async (tx) => {
      const pd = await tx.select().from(schema.pesertaDidik);
      const ptkR = await tx.select().from(schema.ptk);
      const rombel = await tx.select().from(schema.rombonganBelajar);
      const beban = await tx.select().from(schema.bebanMengajar);
      const butir = await tx.select().from(schema.butirSoal);
      const eraport = await tx.select().from(schema.drafEraport);
      return [pd, ptkR, rombel, beban, butir, eraport] as const;
    });
    const [pd, ptkR, rombel, beban, butir, eraport] = rows;
    expect(pd.length).toBeGreaterThan(0);
    expect(ptkR.length).toBeGreaterThan(0);
    expect(rombel.length).toBeGreaterThan(0);
    expect(beban.length).toBeGreaterThan(0);
    expect(butir.length).toBeGreaterThan(0);
    expect(eraport.length).toBeGreaterThan(0);
  });

  it("5 jenis butir soal hadir (pg/essay/isian/jodohkan/benar_salah)", async () => {
    const butir = await withTenant(db, t.id, (tx) =>
      tx.select().from(schema.butirSoal),
    );
    const jenis = new Set(butir.map((b) => b.jenis));
    for (const j of ["pg", "essay", "isian", "jodohkan", "benar_salah"] as const) {
      expect(jenis.has(j), `jenis ${j} hilang`).toBe(true);
    }
  });

  it("RLS: tanpa GUC → 0 baris tenant-scoped", async () => {
    const n = await db.select().from(schema.butirSoal);
    expect(n).toHaveLength(0);
  });

  it("RLS: cross-tenant read = 0 (SMA tak lihat butir SMP)", async () => {
    const smp = await withTenant(db, "org_smp_harapan", (tx) =>
      tx.select().from(schema.butirSoal),
    );
    const sma = await withTenant(db, "org_sma_negeri1", (tx) =>
      tx.select().from(schema.butirSoal),
    );
    const smpIds = new Set(smp.map((b) => b.id));
    const overlap = sma.filter((b) => smpIds.has(b.id));
    expect(overlap).toHaveLength(0);
  });

  it("eraport invariant: revisi_eraport ⟺ parent status='revisi'", async () => {
    const rows = await withTenant(db, t.id, async (tx) => {
      const eraport = await tx.select().from(schema.drafEraport);
      const out: { id: string; status: string; revisiN: number }[] = [];
      for (const e of eraport) {
        const r = await tx
          .select({ n: schema.revisiEraport.id })
          .from(schema.revisiEraport)
          .where(eq(schema.revisiEraport.eraportId, e.id));
        out.push({ id: e.id, status: e.status, revisiN: r.length });
      }
      return out;
    });
    for (const r of rows) {
      const hasRevisi = r.revisiN > 0;
      expect(hasRevisi, `eraport ${r.id} status=${r.status} revisi=${r.revisiN}`).toBe(
        r.status === "revisi",
      );
    }
  });

  it("dokumen_cetak hanya pada draf_eraport status='terbit'", async () => {
    const rows = await withTenant(db, t.id, async (tx) => {
      const docs = await tx.select().from(schema.dokumenCetak);
      const out: { status: string }[] = [];
      for (const d of docs) {
        const e = await tx
          .select({ status: schema.drafEraport.status })
          .from(schema.drafEraport)
          .where(eq(schema.drafEraport.id, d.drafEraportId));
        if (e[0]) out.push({ status: e[0].status });
      }
      return out;
    });
    for (const r of rows) expect(r.status).toBe("terbit");
  });

  it("pengguna + izin_akses terisi dari PERAN_KE_IZIN_DEFAULT", async () => {
    const pengguna = await withTenant(db, t.id, (tx) =>
      tx.select().from(schema.pengguna),
    );
    expect(pengguna.length).toBeGreaterThanOrEqual(3); // admin + guru + kepala
    const perans = new Set(pengguna.map((p) => p.peranAkses));
    expect(perans.has("admin_satuan_pendidikan")).toBe(true);
    expect(perans.has("guru")).toBe(true);
    expect(perans.has("kepala_sekolah")).toBe(true);
  });

  it("id deterministik: idempotensi re-seed = id sama", async () => {
    // Ambil id tingkat-7 sebelum re-seed.
    const before = await withTenant(db, t.id, (tx) =>
      tx
        .select({ id: schema.tingkat.id })
        .from(schema.tingkat)
        .where(eq(schema.tingkat.urutan, 7)),
    );
    const expected = uuidDeterministik(`${t.id}:tingkat:7`);
    expect(before[0]?.id).toBe(expected);

    // Re-seed (cleanup + insert ulang).
    await cleanupTenant(mig, t.id);
    await seedTenant(db, t);

    const after = await withTenant(db, t.id, (tx) =>
      tx
        .select({ id: schema.tingkat.id })
        .from(schema.tingkat)
        .where(eq(schema.tingkat.urutan, 7)),
    );
    expect(after[0]?.id).toBe(expected);
  });

  it("semua row seed ditandai aktor penanda (dibuat_oleh)", async () => {
    // Contoh: butir_soal + penilaian → dibuat_oleh = AKTOR_SEED.
    const butir = await withTenant(db, t.id, (tx) =>
      tx.select({ o: schema.butirSoal.dibuatOleh }).from(schema.butirSoal).limit(1),
    );
    expect(butir[0]?.o).toBe(AKTOR_SEED);
  });
});
