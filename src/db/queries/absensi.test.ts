import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  catatAbsensi,
  getAbsensiByTanggal,
  getRekapAbsensi,
  getRekapByRombonganBelajar,
  ubahAbsensi,
  type StatusKehadiran,
} from "./absensi";

// Load .env (Node native; no-op if missing).
try {
  process.loadEnvFile?.();
} catch {
  /* rely on real environment */
}

const APP_URL = process.env.DATABASE_URL;
const MIG_URL = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
const ready = Boolean(APP_URL && MIG_URL);

const itOrSkip = ready ? it : it.skip;
const describeOrSkip = ready ? describe : describe.skip;

// Tenant seeds — PRIVATE to this file (org_AB_*). Distinct per absensi test
// file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only. SEED_A is the
// primary tenant (FK parents seeded there); SEED_B is used only for the
// RLS-isolation assertion (#5).
const SEED_A = "org_AB_a";
const SEED_B = "org_AB_b";

// Monotonic counter for unique tenant-scoped keys (tingkat urutan/nama,
// tahun_ajaran nama, rombel nama). Keeps per-tenant UNIQUE constraints
// satisfied across cases + re-runs.
let _seq = 0;
const seq = (): number => ++_seq;

describeOrSkip(
  "absensi repository (queries/absensi.ts — #15 Wave 2 / T5)",
  () => {
    let db: Db;
    // Shared FK parents in SEED_A + SEED_B (seeded in beforeAll; reused by
    // every case via seedRombel + buatPesertaA). Absensi references
    // peserta_didik + rombongan_belajar; rombel references tingkat + tahun
    // ajaran. Seeding these once avoids per-case UNIQUE collisions.
    let tingkatAId: string;
    let taAId: string;
    let _rombelAId: string;
    let _tingkatBId: string;
    let _taBId: string;
    let rombelBId: string;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT) and clear the absensi layer + its FK
      //    parents in FK-safe order (children first) so each run starts clean
      //    (superuser bypasses RLS). Scoped to this file's tenants only.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_AB_a', 'Satuan Pendidikan AB A'),
          ('org_AB_b', 'Satuan Pendidikan AB B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from absensi_harian     where tenant_id in ('org_AB_a', 'org_AB_b');
        delete from peserta_didik      where tenant_id in ('org_AB_a', 'org_AB_b');
        delete from rombongan_belajar  where tenant_id in ('org_AB_a', 'org_AB_b');
        delete from tingkat            where tenant_id in ('org_AB_a', 'org_AB_b');
        delete from tahun_ajaran       where tenant_id in ('org_AB_a', 'org_AB_b');
      `);
      await seed.end();

      // 3. App client uses the non-superuser role — RLS enforced.
      db = createDb(APP_URL!).db;

      // 4. Seed shared FK parents in both tenants (one tingkat + tahun_ajaran
      //    + rombel per tenant). Seeded in parallel; reused by every case.
      const [aIds, bIds] = await Promise.all([
        withTenant(db, SEED_A, async (tx: Tx) => {
          const [tk] = await tx
            .insert(schema.tingkat)
            .values({ nama: `Tingkat AB A ${seq()}`, urutan: seq() + 3000 })
            .returning();
          const [ta] = await tx
            .insert(schema.tahunAjaran)
            .values({ nama: `TA AB A ${seq()}`, aktif: false })
            .returning();
          const [rb] = await tx
            .insert(schema.rombonganBelajar)
            .values({
              nama: `Rombel AB A ${seq()}`,
              tingkatId: tk.id,
              tahunAjaranId: ta.id,
            })
            .returning();
          return { tingkatId: tk.id, taId: ta.id, rombelId: rb.id };
        }),
        withTenant(db, SEED_B, async (tx: Tx) => {
          const [tk] = await tx
            .insert(schema.tingkat)
            .values({ nama: `Tingkat AB B ${seq()}`, urutan: seq() + 4000 })
            .returning();
          const [ta] = await tx
            .insert(schema.tahunAjaran)
            .values({ nama: `TA AB B ${seq()}`, aktif: false })
            .returning();
          const [rb] = await tx
            .insert(schema.rombonganBelajar)
            .values({
              nama: `Rombel AB B ${seq()}`,
              tingkatId: tk.id,
              tahunAjaranId: ta.id,
            })
            .returning();
          return { tingkatId: tk.id, taId: ta.id, rombelId: rb.id };
        }),
      ]);
      tingkatAId = aIds.tingkatId;
      taAId = aIds.taId;
      _rombelAId = aIds.rombelId;
      _tingkatBId = bIds.tingkatId;
      _taBId = bIds.taId;
      rombelBId = bIds.rombelId;
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    /** Mint a fresh peserta_didik in SEED_A — keeps cases isolated. */
    async function buatPesertaA(nama: string): Promise<string> {
      const [pd] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.pesertaDidik)
          .values({
            nama,
            tanggalLahir: "2014-01-01",
            jenisKelamin: "L",
          })
          .returning()
      );
      return pd.id;
    }

    /** Mint a fresh rombongan_belajar in SEED_A — keeps cases isolated. */
    async function buatRombelA(nama: string): Promise<string> {
      const [rb] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.rombonganBelajar)
          .values({
            nama,
            tingkatId: tingkatAId,
            tahunAjaranId: taAId,
          })
          .returning()
      );
      return rb.id;
    }

    // 1. catatAbsensi round-trips every input field, defaults metodeInput
    //    'manual' when omitted, and writes sumber_qr NULL for manual entry.
    itOrSkip("catatAbsensi round-trips fields; defaults metodeInput=manual", async () => {
      const pdId = await buatPesertaA("Andi Catat");
      const rombelId = await buatRombelA("Rombel Catat 1");

      const row = await withTenant(db, SEED_A, (tx) =>
        catatAbsensi(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tanggal: "2026-04-01",
          statusKehadiran: "hadir",
          catatan: "Tepat waktu",
          dibuatOleh: "user_ab_1",
        })
      );

      expect(row.id).toBeTruthy();
      expect(row.tenantId).toBe(SEED_A);
      expect(row.pesertaDidikId).toBe(pdId);
      expect(row.rombonganBelajarId).toBe(rombelId);
      expect(row.tanggal).toBe("2026-04-01");
      expect(row.statusKehadiran).toBe("hadir");
      // default metode_input when omitted.
      expect(row.metodeInput).toBe("manual");
      expect(row.catatan).toBe("Tepat waktu");
      expect(row.sumberQr).toBeNull();
      expect(row.dibuatOleh).toBe("user_ab_1");
      expect(row.dibuatPada).toBeTruthy();
      expect(row.diperbaruiPada).toBeTruthy();
    });

    // 2. catatAbsensi with metodeInput='qr' carries sumberQr AND remains
    //    just an INSERT — AC#3 (QR assists, never locks).
    itOrSkip("catatAbsensi qr carries sumberQr (AC#3 — qr is still just an INSERT)", async () => {
      const pdId = await buatPesertaA("Budi QR");
      const rombelId = await buatRombelA("Rombel QR 1");

      const row = await withTenant(db, SEED_A, (tx) =>
        catatAbsensi(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tanggal: "2026-04-02",
          statusKehadiran: "hadir",
          metodeInput: "qr",
          sumberQr: "qr-session-token-xyz",
          dibuatOleh: "user_ab_2",
        })
      );

      expect(row.metodeInput).toBe("qr");
      expect(row.sumberQr).toBe("qr-session-token-xyz");
    });

    // 3. getAbsensiByTanggal returns ONLY the rombel+tanggal rows; cross-day
    //    and cross-rombel rows are excluded. Order is by dibuat_pada ASC.
    itOrSkip("getAbsensiByTanggal returns only matching rombel+tanggal rows", async () => {
      const rombelId = await buatRombelA("Rombel Tanggal 1");
      const pd1 = await buatPesertaA("Cici Tgl 1");
      const pd2 = await buatPesertaA("Didi Tgl 2");

      // Two rows on 2026-04-10 for this rombel.
      await withTenant(db, SEED_A, (tx) =>
        catatAbsensi(tx, {
          pesertaDidikId: pd1,
          rombonganBelajarId: rombelId,
          tanggal: "2026-04-10",
          statusKehadiran: "hadir",
          dibuatOleh: "user_ab_3",
        })
      );
      await withTenant(db, SEED_A, (tx) =>
        catatAbsensi(tx, {
          pesertaDidikId: pd2,
          rombonganBelajarId: rombelId,
          tanggal: "2026-04-10",
          statusKehadiran: "sakit",
          dibuatOleh: "user_ab_3",
        })
      );
      // Decoy: same rombel, DIFFERENT tanggal — must NOT appear.
      await withTenant(db, SEED_A, (tx) =>
        catatAbsensi(tx, {
          pesertaDidikId: pd1,
          rombonganBelajarId: rombelId,
          tanggal: "2026-04-11",
          statusKehadiran: "hadir",
          dibuatOleh: "user_ab_3",
        })
      );

      const list = await withTenant(db, SEED_A, (tx) =>
        getAbsensiByTanggal(tx, rombelId, "2026-04-10")
      );

      expect(list).toHaveLength(2);
      expect(list.every((r) => r.rombonganBelajarId === rombelId)).toBe(true);
      expect(list.every((r) => r.tanggal === "2026-04-10")).toBe(true);
      const pdIds = list.map((r) => r.pesertaDidikId).sort();
      expect(pdIds).toEqual([pd1, pd2].sort());
    });

    // 4. AC#3 (load-bearing): a QR-captured row is still CORRECTABLE via
    //    ubahAbsensi. The status + catatan are advanced; metode_input +
    //    sumber_qr are preserved (the "scanned, then corrected" trail).
    //    diperbarui_pada advances past dibuat_pada.
    itOrSkip("AC#3 — ubahAbsensi corrects a QR row; metode_input + sumber_qr preserved", async () => {
      const pdId = await buatPesertaA("Eka Koreksi");
      const rombelId = await buatRombelA("Rombel Koreksi 1");

      const created = await withTenant(db, SEED_A, (tx) =>
        catatAbsensi(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tanggal: "2026-04-15",
          statusKehadiran: "hadir",
          metodeInput: "qr",
          sumberQr: "qr-session-abc",
          dibuatOleh: "user_ab_4",
        })
      );

      // Force a measurable gap so diperbarui_pada > dibuat_pada after UPDATE.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const updated = await withTenant(db, SEED_A, (tx) =>
        ubahAbsensi(tx, created.id, {
          statusKehadiran: "izin",
          catatan: "Diperbaiki: sebenarnya izin",
        })
      );

      expect(updated.id).toBe(created.id);
      expect(updated.statusKehadiran).toBe("izin");
      expect(updated.catatan).toBe("Diperbaiki: sebenarnya izin");
      // AC#3: metode_input + sumber_qr are PRESERVED by the correction — the
      // "scanned, then corrected" audit trail stays intact.
      expect(updated.metodeInput).toBe("qr");
      expect(updated.sumberQr).toBe("qr-session-abc");
      expect(updated.diperbaruiPada.getTime()).toBeGreaterThan(
        created.diperbaruiPada.getTime()
      );
    });

    // 5. AC#4 — getRekapAbsensi: per-bucket counts for one student. Seeds a
    //    mix across multiple tanggal + statuses; expects the recap to mirror.
    itOrSkip("AC#4 — getRekapAbsensi aggregates per-bucket counts for a student", async () => {
      const pdId = await buatPesertaA("Fajar Rekap");
      const rombelId = await buatRombelA("Rombel Rekap 1");
      const status: StatusKehadiran[] = [
        "hadir",
        "hadir",
        "hadir",
        "izin",
        "sakit",
        "alpa",
        "alpa",
      ];
      // One row per day; the unique (tenant, pd, tanggal) constraint means
      // every row is on a distinct tanggal.
      await withTenant(db, SEED_A, async (tx: Tx) => {
        for (let i = 0; i < status.length; i++) {
          await catatAbsensi(tx, {
            pesertaDidikId: pdId,
            rombonganBelajarId: rombelId,
            tanggal: `2026-04-${String(20 + i).padStart(2, "0")}`,
            statusKehadiran: status[i]!,
            dibuatOleh: "user_ab_5",
          });
        }
      });

      const rekap = await withTenant(db, SEED_A, (tx) =>
        getRekapAbsensi(tx, pdId)
      );

      expect(rekap).toEqual({
        hadir: 3,
        izin: 1,
        sakit: 1,
        alpa: 2,
        total: 7,
      });
    });

    // 6. AC#4 — getRekapAbsensi with a date range: only counts rows in
    //    [dari, sampai] inclusive. Out-of-range rows are excluded.
    itOrSkip("AC#4 — getRekapAbsensi bounds by [dari, sampai] inclusive", async () => {
      const pdId = await buatPesertaA("Gita Range");
      const rombelId = await buatRombelA("Rombel Range 1");
      // 4 rows: 04-01, 04-02, 04-03, 04-04. Range 04-02..04-03 -> 2 rows.
      await withTenant(db, SEED_A, async (tx: Tx) => {
        await catatAbsensi(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tanggal: "2026-05-01",
          statusKehadiran: "hadir",
          dibuatOleh: "user_ab_6",
        });
        await catatAbsensi(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tanggal: "2026-05-02",
          statusKehadiran: "izin",
          dibuatOleh: "user_ab_6",
        });
        await catatAbsensi(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tanggal: "2026-05-03",
          statusKehadiran: "alpa",
          dibuatOleh: "user_ab_6",
        });
        await catatAbsensi(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tanggal: "2026-05-04",
          statusKehadiran: "hadir",
          dibuatOleh: "user_ab_6",
        });
      });

      const rekap = await withTenant(db, SEED_A, (tx) =>
        getRekapAbsensi(tx, pdId, { dari: "2026-05-02", sampai: "2026-05-03" })
      );

      expect(rekap).toEqual({
        hadir: 0,
        izin: 1,
        sakit: 0,
        alpa: 1,
        total: 2,
      });
    });

    // 7. AC#4 — getRekapByRombonganBelajar: per-student recap across a whole
    //    rombel. Returns a Map keyed by every student who has any row.
    itOrSkip("AC#4 — getRekapByRombonganBelajar recaps per student in the rombel", async () => {
      const rombelId = await buatRombelA("Rombel RekapRombel 1");
      const pd1 = await buatPesertaA("Hadi Rombel 1");
      const pd2 = await buatPesertaA("Ira Rombel 2");

      await withTenant(db, SEED_A, async (tx: Tx) => {
        await catatAbsensi(tx, {
          pesertaDidikId: pd1,
          rombonganBelajarId: rombelId,
          tanggal: "2026-06-01",
          statusKehadiran: "hadir",
          dibuatOleh: "user_ab_7",
        });
        await catatAbsensi(tx, {
          pesertaDidikId: pd1,
          rombonganBelajarId: rombelId,
          tanggal: "2026-06-02",
          statusKehadiran: "izin",
          dibuatOleh: "user_ab_7",
        });
        await catatAbsensi(tx, {
          pesertaDidikId: pd2,
          rombonganBelajarId: rombelId,
          tanggal: "2026-06-01",
          statusKehadiran: "alpa",
          dibuatOleh: "user_ab_7",
        });
      });

      const rekap = await withTenant(db, SEED_A, (tx) =>
        getRekapByRombonganBelajar(tx, rombelId)
      );

      expect(rekap.size).toBe(2);
      expect(rekap.get(pd1)).toEqual({
        hadir: 1,
        izin: 1,
        sakit: 0,
        alpa: 0,
        total: 2,
      });
      expect(rekap.get(pd2)).toEqual({
        hadir: 0,
        izin: 0,
        sakit: 0,
        alpa: 1,
        total: 1,
      });
    });

    // 8. RLS isolation (§13): a full absensi chain seeded in SEED_B is
    //    INVISIBLE to SEED_A. getAbsensiByTanggal under SEED_A's tenant GUC
    //    returns []; getRekapAbsensi returns {0,0,0,0,0}; getRekapByRombonganBelajar
    //    returns an empty Map.
    itOrSkip("RLS isolation — SEED_A cannot read SEED_B's absensi", async () => {
      // Seed an attendance row in SEED_B.
      const bPdId = await withTenant(db, SEED_B, async (tx: Tx) => {
        const [pd] = await tx
          .insert(schema.pesertaDidik)
          .values({
            nama: "PD AB B 1",
            tanggalLahir: "2014-01-01",
            jenisKelamin: "L",
          })
          .returning();
        await catatAbsensi(tx, {
          pesertaDidikId: pd.id,
          rombonganBelajarId: rombelBId,
          tanggal: "2026-07-01",
          statusKehadiran: "hadir",
          dibuatOleh: "user_ab_b",
        });
        return pd.id;
      });

      // Sanity: SEED_B sees its own data.
      const bList = await withTenant(db, SEED_B, (tx) =>
        getAbsensiByTanggal(tx, rombelBId, "2026-07-01")
      );
      expect(bList).toHaveLength(1);

      // Cross-tenant: SEED_A cannot read SEED_B's rombel — RLS hides the
      // rows under SEED_A's GUC.
      const aList = await withTenant(db, SEED_A, (tx) =>
        getAbsensiByTanggal(tx, rombelBId, "2026-07-01")
      );
      expect(aList).toEqual([]);

      const aRekap = await withTenant(db, SEED_A, (tx) =>
        getRekapAbsensi(tx, bPdId)
      );
      expect(aRekap).toEqual({
        hadir: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0,
      });

      const aRekapRombel = await withTenant(db, SEED_A, (tx) =>
        getRekapByRombonganBelajar(tx, rombelBId)
      );
      expect(aRekapRombel.size).toBe(0);
    });

    // 9. FK cascade: deleting a peserta_didik cascades to its absensi rows
    //    (ON DELETE CASCADE on the absensi_harian.peserta_didik_id FK).
    itOrSkip("FK cascade — deleting peserta_didik removes their absensi rows", async () => {
      const pdId = await buatPesertaA("Joko Cascade");
      const rombelId = await buatRombelA("Rombel Cascade 1");

      await withTenant(db, SEED_A, async (tx: Tx) => {
        await catatAbsensi(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tanggal: "2026-08-01",
          statusKehadiran: "hadir",
          dibuatOleh: "user_ab_8",
        });
      });

      // Sanity: the row exists.
      const before = await withTenant(db, SEED_A, (tx) =>
        getRekapAbsensi(tx, pdId)
      );
      expect(before.total).toBe(1);

      // Delete the peserta_didik as superuser (cascades to absensi_harian).
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`delete from peserta_didik where id = $1`, [pdId]);
      await seed.end();

      // After: the absensi row is gone (RLS read by id returns nothing).
      const rows = await withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.absensiHarian)
          .where(eq(schema.absensiHarian.pesertaDidikId, pdId))
      );
      expect(rows).toHaveLength(0);
    });

    // 10. FK cascade: deleting a rombongan_belajar cascades to its absensi
    //     rows (ON DELETE CASCADE on the absensi_harian.rombongan_belajar_id
    //     FK).
    itOrSkip("FK cascade — deleting rombongan_belajar removes its absensi rows", async () => {
      const pdId = await buatPesertaA("Kiki Rombel Cascade");
      const rombelId = await buatRombelA("Rombel Cascade 2");

      await withTenant(db, SEED_A, async (tx: Tx) => {
        await catatAbsensi(tx, {
          pesertaDidikId: pdId,
          rombonganBelajarId: rombelId,
          tanggal: "2026-09-01",
          statusKehadiran: "hadir",
          dibuatOleh: "user_ab_9",
        });
      });

      // Sanity: the rombel has one absensi row.
      const before = await withTenant(db, SEED_A, (tx) =>
        getRekapByRombonganBelajar(tx, rombelId)
      );
      expect(before.size).toBe(1);

      // Delete the rombongan_belajar as superuser (cascades to absensi_harian).
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`delete from rombongan_belajar where id = $1`, [
        rombelId,
      ]);
      await seed.end();

      // After: the absensi row is gone (RLS read by rombel returns nothing).
      const rows = await withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.absensiHarian)
          .where(eq(schema.absensiHarian.rombonganBelajarId, rombelId))
      );
      expect(rows).toHaveLength(0);
    });
  }
);
