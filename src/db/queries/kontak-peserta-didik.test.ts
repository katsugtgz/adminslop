import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  hapusKontakDarurat,
  hapusWali,
  listKontakDarurat,
  listWali,
  tambahKontakDarurat,
  tambahWali,
} from "./kontak-peserta-didik";

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

// Tenant seeds — PRIVATE to this file (org_pdK_*). Distinct per peserta-didik
// test file so parallel vitest runs cannot delete each other's seed rows:
// all beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_pdK_a";
const SEED_B = "org_pdK_b";

describeOrSkip(
  "kontak-peserta-didik repository (queries/kontak-peserta-didik.ts — #7 Wave 2)",
  () => {
    let db: Db;
    // Parent peserta_didik in SEED_B used as the FK target for cases 1-7.
    let parentB: string;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT) and clear peserta-didik-layer rows
      //    in FK-safe order so each run starts clean. Superuser bypasses RLS.
      //    No audit rows are written here (and never under tenant A).
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_pdK_a', 'Satuan Pendidikan A'),
          ('org_pdK_b', 'Satuan Pendidikan B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from kontak_darurat where tenant_id in ('org_pdK_a', 'org_pdK_b');
        delete from wali_peserta_didik where tenant_id in ('org_pdK_a', 'org_pdK_b');
        delete from mutasi_peserta_didik where tenant_id in ('org_pdK_a', 'org_pdK_b');
        delete from riwayat_status_peserta_didik where tenant_id in ('org_pdK_a', 'org_pdK_b');
        delete from peserta_didik where tenant_id in ('org_pdK_a', 'org_pdK_b');
      `);
      await seed.end();

      // 3. App client uses the non-superuser role — RLS enforced.
      db = createDb(APP_URL!).db;

      // 4. Seed one parent peserta_didik in SEED_B (RLS-aware via app role).
      const [pd] = await withTenant(db, SEED_B, (tx) =>
        tx
          .insert(schema.pesertaDidik)
          .values({
            nama: "Anak Uji Kontak",
            tanggalLahir: "2010-01-01",
            jenisKelamin: "L",
          })
          .returning()
      );
      parentB = pd.id;
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    // 1. tambahWali inserts and returns the row; every field round-trips.
    itOrSkip("tambahWali inserts a wali and round-trips all fields", async () => {
      const created = await withTenant(db, SEED_B, (tx) =>
        tambahWali(tx, {
          pesertaDidikId: parentB,
          nama: "Ayah Uji T1",
          hubungan: "Ayah",
          telepon: "08120001122",
          email: "ayah.t1@example.test",
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_B);
      expect(created.pesertaDidikId).toBe(parentB);
      expect(created.nama).toBe("Ayah Uji T1");
      expect(created.hubungan).toBe("Ayah");
      expect(created.telepon).toBe("08120001122");
      expect(created.email).toBe("ayah.t1@example.test");
      expect(created.dibuatPada).toBeTruthy();
    });

    // 2. listWali returns walis for the peserta_didik, ordered oldest-first.
    itOrSkip("listWali returns all walis for the peserta_didik (ordered)", async () => {
      const a = await withTenant(db, SEED_B, (tx) =>
        tambahWali(tx, {
          pesertaDidikId: parentB,
          nama: "Wali T2a",
          hubungan: "Ibu",
        })
      );
      const b = await withTenant(db, SEED_B, (tx) =>
        tambahWali(tx, {
          pesertaDidikId: parentB,
          nama: "Wali T2b",
          hubungan: "Wali",
        })
      );

      const all = await withTenant(db, SEED_B, (tx) => listWali(tx, parentB));
      const ids = all.map((w) => w.id);
      expect(ids).toContain(a.id);
      expect(ids).toContain(b.id);
      // Ordering: ascending dibuatPada — `a` was inserted before `b`, so it
      // must appear at a lower-or-equal index.
      expect(ids.indexOf(b.id)).toBeGreaterThan(ids.indexOf(a.id));
    });

    // 3. hapusWali removes the row.
    itOrSkip("hapusWali removes the wali", async () => {
      const created = await withTenant(db, SEED_B, (tx) =>
        tambahWali(tx, {
          pesertaDidikId: parentB,
          nama: "Wali Hapus T3",
        })
      );

      await withTenant(db, SEED_B, (tx) => hapusWali(tx, created.id));

      const all = await withTenant(db, SEED_B, (tx) => listWali(tx, parentB));
      expect(all.find((w) => w.id === created.id)).toBeUndefined();
    });

    // 4. tambahKontakDarurat inserts and returns the row (no email field).
    itOrSkip("tambahKontakDarurat inserts a kontak_darurat and round-trips fields", async () => {
      const created = await withTenant(db, SEED_B, (tx) =>
        tambahKontakDarurat(tx, {
          pesertaDidikId: parentB,
          nama: "Kontak T4",
          hubungan: "Kakek",
          telepon: "08130004455",
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_B);
      expect(created.pesertaDidikId).toBe(parentB);
      expect(created.nama).toBe("Kontak T4");
      expect(created.hubungan).toBe("Kakek");
      expect(created.telepon).toBe("08130004455");
      // kontak_darurat has no email column (AC#4 — contact record only).
      expect((created as Record<string, unknown>).email).toBeUndefined();
      expect(created.dibuatPada).toBeTruthy();
    });

    // 5. listKontakDarurat returns contacts for the peserta_didik.
    itOrSkip("listKontakDarurat returns all contacts for the peserta_didik", async () => {
      const a = await withTenant(db, SEED_B, (tx) =>
        tambahKontakDarurat(tx, {
          pesertaDidikId: parentB,
          nama: "Kontak T5a",
        })
      );
      const b = await withTenant(db, SEED_B, (tx) =>
        tambahKontakDarurat(tx, {
          pesertaDidikId: parentB,
          nama: "Kontak T5b",
        })
      );

      const all = await withTenant(db, SEED_B, (tx) =>
        listKontakDarurat(tx, parentB)
      );
      const ids = all.map((c) => c.id);
      expect(ids).toContain(a.id);
      expect(ids).toContain(b.id);
    });

    // 6. hapusKontakDarurat removes the row.
    itOrSkip("hapusKontakDarurat removes the contact", async () => {
      const created = await withTenant(db, SEED_B, (tx) =>
        tambahKontakDarurat(tx, {
          pesertaDidikId: parentB,
          nama: "Kontak Hapus T6",
        })
      );

      await withTenant(db, SEED_B, (tx) =>
        hapusKontakDarurat(tx, created.id)
      );

      const all = await withTenant(db, SEED_B, (tx) =>
        listKontakDarurat(tx, parentB)
      );
      expect(all.find((c) => c.id === created.id)).toBeUndefined();
    });

    // 7. RLS isolation (§13): wali inserted in SEED_B is invisible to SEED_A.
    itOrSkip("listWali is tenant-isolated: SEED_A cannot see SEED_B's wali", async () => {
      await withTenant(db, SEED_B, (tx) =>
        tambahWali(tx, {
          pesertaDidikId: parentB,
          nama: "Wali RLS T7",
          hubungan: "Ayah",
        })
      );

      const aList = await withTenant(db, SEED_A, (tx) =>
        listWali(tx, parentB)
      );
      // §13: B's wali must not leak to A. parentB belongs to B, so under A's
      // RLS the query sees zero rows regardless of the pesertaDidikId filter.
      expect(aList).toEqual([]);
    });

    // 8. FK CASCADE: deleting the parent peserta_didik cascades to wali +
    //    kontak_darurat (ON DELETE CASCADE declared in schema).
    itOrSkip("deleting parent peserta_didik cascades to wali and kontak_darurat", async () => {
      // Fresh parent in SEED_B for this test (don't disturb the shared parent).
      const [parent] = await withTenant(db, SEED_B, (tx) =>
        tx
          .insert(schema.pesertaDidik)
          .values({
            nama: "Anak Cascade T8",
            tanggalLahir: "2011-02-02",
            jenisKelamin: "P",
          })
          .returning()
      );

      const wali = await withTenant(db, SEED_B, (tx) =>
        tambahWali(tx, {
          pesertaDidikId: parent.id,
          nama: "Wali Cascade T8",
        })
      );
      const kontak = await withTenant(db, SEED_B, (tx) =>
        tambahKontakDarurat(tx, {
          pesertaDidikId: parent.id,
          nama: "Kontak Cascade T8",
        })
      );
      expect(wali.pesertaDidikId).toBe(parent.id);
      expect(kontak.pesertaDidikId).toBe(parent.id);

      // Delete the parent peserta_didik — CASCADE should remove both children.
      await withTenant(db, SEED_B, (tx) =>
        tx
          .delete(schema.pesertaDidik)
          .where(eq(schema.pesertaDidik.id, parent.id))
      );

      const walisAfter = await withTenant(db, SEED_B, (tx) =>
        listWali(tx, parent.id)
      );
      const kontakAfter = await withTenant(db, SEED_B, (tx) =>
        listKontakDarurat(tx, parent.id)
      );
      expect(walisAfter).toEqual([]);
      expect(kontakAfter).toEqual([]);
    });
  }
);
