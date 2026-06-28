import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, catatAudit, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  arsipkan,
  aturRetensi,
  getRetensi,
  listArsip,
  listRiwayatPerubahan,
  pulihkan,
} from "./arsip";

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

// Tenant seeds — PRIVATE to this file (org_AR1_*). Distinct per arsip test file
// so parallel vitest runs cannot delete each other's seed rows.
const SEED_A = "org_AR1_a";
const SEED_B = "org_AR1_b";

let _seq = 0;
const seq = (): number => ++_seq;

describeOrSkip(
  "arsip repository (queries/arsip.ts — #19)",
  () => {
    let migDb: Db;
    let db: Db;

    let ptkAId: string;
    let ptkBId: string;
    let penilaianAId: string;
    let bebanAId: string;
    let waliAId: string;

    beforeAll(async () => {
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_AR1_a', 'Satuan Pendidikan AR1 A'),
          ('org_AR1_b', 'Satuan Pendidikan AR1 B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from retensi_data     where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from catatan_audit    where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from nilai_peserta_didik where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from penilaian        where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from komponen_nilai   where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from beban_mengajar   where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from wali_kelas       where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from rombongan_belajar where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from tingkat          where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from tahun_ajaran     where tenant_id in ('org_AR1_a', 'org_AR1_b');
        delete from ptk              where tenant_id in ('org_AR1_a', 'org_AR1_b');
      `);
      await seed.query(`delete from mata_pelajaran where kode like 'AR1-MP-%';`);
      await seed.end();

      migDb = createDb(MIG_URL!).db;
      db = createDb(APP_URL!).db;

      // Seed a ptk in each tenant.
      [ptkAId, ptkBId] = await Promise.all([
        withTenant(db, SEED_A, (tx: Tx) =>
          tx
            .insert(schema.ptk)
            .values({ nama: "PTK AR1 A", jenis: "pendidik" })
            .returning()
            .then((r) => r[0].id)
        ),
        withTenant(db, SEED_B, (tx: Tx) =>
          tx
            .insert(schema.ptk)
            .values({ nama: "PTK AR1 B", jenis: "pendidik" })
            .returning()
            .then((r) => r[0].id)
        ),
      ]);

      // Seed the FK chain for penilaian/beban_mengajar/wali_kelas in SEED_A.
      const [mp] = await migDb
        .insert(schema.mataPelajaran)
        .values({
          kode: `AR1-MP-${seq()}`,
          nama: `Arsip AR1 Mapel ${seq()}`,
        })
        .returning();

      await withTenant(db, SEED_A, async (tx: Tx) => {
        const [ta] = await tx
          .insert(schema.tahunAjaran)
          .values({ nama: `TA AR1 ${seq()}`, aktif: false })
          .returning();
        const [tk] = await tx
          .insert(schema.tingkat)
          .values({ nama: "Tingkat AR1 1", urutan: seq() })
          .returning();
        const [rb] = await tx
          .insert(schema.rombonganBelajar)
          .values({
            nama: `Rombel AR1 ${seq()}`,
            tingkatId: tk.id,
            tahunAjaranId: ta.id,
          })
          .returning();
        const [beban] = await tx
          .insert(schema.bebanMengajar)
          .values({
            ptkId: ptkAId,
            mataPelajaranId: mp.id,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
          })
          .returning();
        bebanAId = beban.id;
        const [kn] = await tx
          .insert(schema.komponenNilai)
          .values({
            bebanMengajarId: beban.id,
            nama: `Komponen AR1 ${seq()}`,
            bobot: "100",
          })
          .returning();
        const [pen] = await tx
          .insert(schema.penilaian)
          .values({
            komponenNilaiId: kn.id,
            nama: `Penilaian AR1 ${seq()}`,
            tanggal: "2026-01-15",
          })
          .returning();
        penilaianAId = pen.id;
        const [wali] = await tx
          .insert(schema.waliKelas)
          .values({
            ptkId: ptkAId,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
          })
          .returning();
        waliAId = wali.id;
      });
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    // 1. ptk round-trip: arsipkan sets arsip_pada + arsip_oleh; pulihkan clears.
    itOrSkip(
      "1. arsipkan(ptk) sets arsip_pada+arsip_oleh; pulihkan(ptk) clears both (round-trip)",
      async () => {
        const n = await withTenant(db, SEED_A, (tx) =>
          arsipkan(tx, "ptk", ptkAId, "user_ar1")
        );
        expect(n).toBe(1);

        const archived = await withTenant(db, SEED_A, (tx) =>
          tx.select().from(schema.ptk).where(eq(schema.ptk.id, ptkAId))
        );
        expect(archived).toHaveLength(1);
        expect(archived[0].arsipPada).toBeInstanceOf(Date);
        expect(archived[0].arsipOleh).toBe("user_ar1");

        const m = await withTenant(db, SEED_A, (tx) =>
          pulihkan(tx, "ptk", ptkAId)
        );
        expect(m).toBe(1);

        const recovered = await withTenant(db, SEED_A, (tx) =>
          tx.select().from(schema.ptk).where(eq(schema.ptk.id, ptkAId))
        );
        expect(recovered).toHaveLength(1);
        expect(recovered[0].arsipPada).toBeNull();
        expect(recovered[0].arsipOleh).toBeNull();
      }
    );

    // 2. penilaian round-trip (proves the generic switch handles penilaian).
    itOrSkip("2. arsipkan(penilaian) + pulihkan(penilaian) round-trip", async () => {
      const n = await withTenant(db, SEED_A, (tx) =>
        arsipkan(tx, "penilaian", penilaianAId, "user_ar1")
      );
      expect(n).toBe(1);

      const archived = await withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.penilaian)
          .where(eq(schema.penilaian.id, penilaianAId))
      );
      expect(archived[0].arsipOleh).toBe("user_ar1");

      const m = await withTenant(db, SEED_A, (tx) =>
        pulihkan(tx, "penilaian", penilaianAId)
      );
      expect(m).toBe(1);
      expect(
        (
          await withTenant(db, SEED_A, (tx) =>
            tx
              .select()
              .from(schema.penilaian)
              .where(eq(schema.penilaian.id, penilaianAId))
          )
        )[0].arsipPada
      ).toBeNull();
    });

    // 3. beban_mengajar round-trip (proves the generic switch handles beban).
    itOrSkip("3. arsipkan(beban_mengajar) + pulihkan round-trip", async () => {
      const n = await withTenant(db, SEED_A, (tx) =>
        arsipkan(tx, "beban_mengajar", bebanAId, "user_ar1")
      );
      expect(n).toBe(1);
      const m = await withTenant(db, SEED_A, (tx) =>
        pulihkan(tx, "beban_mengajar", bebanAId)
      );
      expect(m).toBe(1);
    });

    // 4. wali_kelas round-trip (proves the generic switch handles wali_kelas).
    itOrSkip("4. arsipkan(wali_kelas) + pulihkan round-trip", async () => {
      const n = await withTenant(db, SEED_A, (tx) =>
        arsipkan(tx, "wali_kelas", waliAId, "user_ar1")
      );
      expect(n).toBe(1);
      const m = await withTenant(db, SEED_A, (tx) =>
        pulihkan(tx, "wali_kelas", waliAId)
      );
      expect(m).toBe(1);
    });

    // 5. AC#1 PROOF: arsipkan does NOT hard-delete — the row persists, only
    //    arsip_pada is set. The row is still readable by id.
    itOrSkip(
      "5. AC#1: arsipkan does NOT hard-delete — row persists with arsip_pada set",
      async () => {
        await withTenant(db, SEED_A, (tx) =>
          arsipkan(tx, "ptk", ptkAId, "user_ar1")
        );
        const rows = await withTenant(db, SEED_A, (tx) =>
          tx.select().from(schema.ptk).where(eq(schema.ptk.id, ptkAId))
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].arsipPada).toBeInstanceOf(Date);
        expect(rows[0].nama).toBe("PTK AR1 A");
        await withTenant(db, SEED_A, (tx) => pulihkan(tx, "ptk", ptkAId));
      }
    );

    // 6. listArsip returns archived rows (arsip_pada IS NOT NULL); active rows
    //    are excluded. Filter narrows by tabel.
    itOrSkip(
      "6. listArsip returns archived rows only; active rows excluded; filter by tabel narrows",
      async () => {
        await withTenant(db, SEED_A, (tx) =>
          arsipkan(tx, "ptk", ptkAId, "user_ar1")
        );

        const all = await withTenant(db, SEED_A, (tx) => listArsip(tx));
        const found = all.find((r) => r.id === ptkAId && r.tabel === "ptk");
        expect(found).toBeDefined();
        expect(found?.arsipOleh).toBe("user_ar1");
        expect(found?.label).toBe("PTK AR1 A");

        const ptksOnly = await withTenant(db, SEED_A, (tx) =>
          listArsip(tx, "ptk")
        );
        expect(ptksOnly.every((r) => r.tabel === "ptk")).toBe(true);
        expect(ptksOnly.find((r) => r.id === ptkAId)).toBeDefined();

        await withTenant(db, SEED_A, (tx) => pulihkan(tx, "ptk", ptkAId));
      }
    );

    // 7. RLS isolation: arsipkan from SEED_A is invisible to listArsip in
    //    SEED_B; a pulihkan from SEED_B is a silent no-op.
    itOrSkip(
      "7. listArsip is tenant-isolated: SEED_B cannot see SEED_A's archived row (RLS)",
      async () => {
        await withTenant(db, SEED_A, (tx) =>
          arsipkan(tx, "ptk", ptkAId, "user_ar1")
        );

        const bList = await withTenant(db, SEED_B, (tx) => listArsip(tx));
        expect(bList.find((r) => r.id === ptkAId)).toBeUndefined();

        const m = await withTenant(db, SEED_B, (tx) =>
          pulihkan(tx, "ptk", ptkAId)
        );
        expect(m).toBe(0);

        const aList = await withTenant(db, SEED_A, (tx) => listArsip(tx));
        expect(aList.find((r) => r.id === ptkAId)).toBeDefined();

        await withTenant(db, SEED_A, (tx) => pulihkan(tx, "ptk", ptkAId));
      }
    );

    // 8. arsipkan returns 0 for a cross-tenant id (RLS scopes the UPDATE).
    itOrSkip(
      "8. arsipkan returns 0 for a cross-tenant id (RLS scopes the UPDATE)",
      async () => {
        const n = await withTenant(db, SEED_A, (tx) =>
          arsipkan(tx, "ptk", ptkBId, "user_ar1")
        );
        expect(n).toBe(0);
      }
    );

    // 9. arsipkan rejects an unsupported table (AC#5 whitelist).
    itOrSkip("9. arsipkan rejects an unsupported table (AC#5 whitelist)", async () => {
      await expect(
        withTenant(db, SEED_A, (tx) =>
          arsipkan(tx, "satuan_pendidikan; drop table ptk" as never, ptkAId, "x")
        )
      ).rejects.toThrow(/Tabel tidak didukung/i);
    });

    // 10. aturRetensi inserts a new policy; getRetensi reads it.
    itOrSkip("10. aturRetensi inserts a new policy; getRetensi reads it", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        aturRetensi(tx, { tabel: "ptk", periodeBulan: 60, keterangan: "5 tahun" })
      );
      expect(created.tabel).toBe("ptk");
      expect(created.periodeBulan).toBe(60);
      expect(created.keterangan).toBe("5 tahun");

      const rows = await withTenant(db, SEED_A, (tx) => getRetensi(tx, "ptk"));
      expect(rows).toHaveLength(1);
      expect(rows[0].periodeBulan).toBe(60);
    });

    // 11. aturRetensi updates an existing policy (same tabel -> UPDATE, not duplicate).
    itOrSkip(
      "11. aturRetensi updates an existing policy (UNIQUE tabel -> UPDATE)",
      async () => {
        const updated = await withTenant(db, SEED_A, (tx) =>
          aturRetensi(tx, { tabel: "ptk", periodeBulan: 120 })
        );
        expect(updated.periodeBulan).toBe(120);
        expect(updated.keterangan).toBeNull();

        const rows = await withTenant(db, SEED_A, (tx) => getRetensi(tx, "ptk"));
        expect(rows).toHaveLength(1);
        expect(rows[0].periodeBulan).toBe(120);
      }
    );

    // 12. getRetensi unfiltered returns all policies for the tenant.
    itOrSkip("12. getRetensi() unfiltered returns all tenant policies", async () => {
      await withTenant(db, SEED_A, (tx) =>
        aturRetensi(tx, { tabel: "penilaian", periodeBulan: 36 })
      );
      const rows = await withTenant(db, SEED_A, (tx) => getRetensi(tx));
      const tabels = rows.map((r) => r.tabel).sort();
      expect(tabels).toContain("ptk");
      expect(tabels).toContain("penilaian");
    });

    // 13. RLS on retensi_data: SEED_B cannot see SEED_A's policies.
    itOrSkip("13. retensi_data is tenant-isolated (RLS)", async () => {
      const bRows = await withTenant(db, SEED_B, (tx) => getRetensi(tx));
      expect(bRows).toHaveLength(0);
    });

    // 14. listRiwayatPerubahan reads catatan_audit (filtered by tenant); opts
    //     narrow by aktor and limit.
    itOrSkip(
      "14. listRiwayatPerubahan reads catatan_audit; filter by aktor + limit honored",
      async () => {
        await withTenant(db, SEED_A, async (tx) => {
          await catatAudit(tx, {
            aktor: "riwayat_user_a",
            aksi: "uji_aksi_a",
            target: "ptk:uji_a",
          });
          await catatAudit(tx, {
            aktor: "riwayat_user_b",
            aksi: "uji_aksi_b",
            target: "ptk:uji_b",
          });
        });

        const all = await withTenant(db, SEED_A, (tx) =>
          listRiwayatPerubahan(tx)
        );
        expect(
          all.find((r) => r.aksi === "uji_aksi_a" || r.aksi === "uji_aksi_b")
        ).toBeDefined();

        const byA = await withTenant(db, SEED_A, (tx) =>
          listRiwayatPerubahan(tx, { aktor: "riwayat_user_a" })
        );
        expect(byA.every((r) => r.aktor === "riwayat_user_a")).toBe(true);
        expect(byA.find((r) => r.aksi === "uji_aksi_a")).toBeDefined();

        const limited = await withTenant(db, SEED_A, (tx) =>
          listRiwayatPerubahan(tx, { limit: 1 })
        );
        expect(limited).toHaveLength(1);
      }
    );

    // 15. listRiwayatPerubahan is tenant-isolated: SEED_B cannot see SEED_A's audit.
    itOrSkip(
      "15. listRiwayatPerubahan is tenant-isolated (RLS on catatan_audit)",
      async () => {
        const bRows = await withTenant(db, SEED_B, (tx) =>
          listRiwayatPerubahan(tx)
        );
        expect(
          bRows.find((r) => r.aksi === "uji_aksi_a" || r.aksi === "uji_aksi_b")
        ).toBeUndefined();
      }
    );
  }
);
