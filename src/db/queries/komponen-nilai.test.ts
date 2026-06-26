import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";

import {
  buatKomponenNilai,
  hapusKomponenNilai,
  listKomponenNilai,
  ubahKomponenNilai,
} from "./komponen-nilai";

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

// Tenant seeds — PRIVATE to this file (org_KN_*). Distinct per komponen-nilai
// query test file (the schema-level komponen test, if added, would use a
// different prefix) so parallel vitest runs cannot delete each other's seed
// rows: all beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_KN_a";
const SEED_B = "org_KN_b";

// Monotonic counter for unique GLOBAL mata_pelajaran names + tenant-scoped
// UNIQUE keys (tingkat urutan/nama, tahun_ajaran nama, rombel nama). mata_
// pelajaran is GLOBAL (UNIQUE nama/kode, no tenant isolation) so distinct
// names avoid cross-test collisions.
let _seq = 0;
const seq = (): number => ++_seq;

describeOrSkip(
  "komponen nilai repository (queries/komponen-nilai.ts — #11 Wave 2 / T3)",
  () => {
    // Insert/DELETE on GLOBAL mata_pelajaran run as the migrator superuser
    // (app_user has SELECT only — ADR 0001). Tenant-scoped writes use the app
    // client (`db`) inside `withTenant` so RLS is enforced.
    let migDb: Db;
    let db: Db;

    // Shared FK parents in SEED_A (seeded in beforeAll; reused across cases).
    // komponen_nilai -> beban_mengajar -> ptk + mata_pelajaran + (rombel XOR
    // tingkat) + tahun_ajaran. Seeding these once avoids per-case UNIQUE
    // collisions on tingkat/tahun_ajaran/rombel.
    let bebanAId: string;
    let bebanA2Id: string;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT) and clear the komponen-nilai layer +
      //    its FK ancestors in FK-safe order (children first) so each run
      //    starts clean. Scoped to this file's tenants only — parallel test
      //    files use distinct tenants. Superuser bypasses RLS. The GLOBAL
      //    mata_pelajaran clear is scoped to this file's kode prefix (KN-MP-*)
      //    and runs AFTER beban_mengajar so the ON DELETE RESTRICT FK cannot
      //    fire.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_KN_a', 'Satuan Pendidikan KN A'),
          ('org_KN_b', 'Satuan Pendidikan KN B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from komponen_nilai      where tenant_id in ('org_KN_a', 'org_KN_b');
        delete from beban_mengajar      where tenant_id in ('org_KN_a', 'org_KN_b');
        delete from rombongan_belajar   where tenant_id in ('org_KN_a', 'org_KN_b');
        delete from tingkat             where tenant_id in ('org_KN_a', 'org_KN_b');
        delete from tahun_ajaran        where tenant_id in ('org_KN_a', 'org_KN_b');
        delete from ptk                 where tenant_id in ('org_KN_a', 'org_KN_b');
      `);
      await seed.query(`delete from mata_pelajaran where kode like 'KN-MP-%';`);
      await seed.end();

      // 3. Clients: migrator (GLOBAL mata_pelajaran writes) + app_user (RLS).
      migDb = createDb(MIG_URL!).db;
      db = createDb(APP_URL!).db;

      // 4. Seed the beban_mengajar parents in SEED_A + two beban rows (RLS-
      //    aware via app role). Two beban rows let the list filter case prove
      //    the bebanMengajarId filter narrows (a komponen under beban #1 is
      //    excluded when listing beban #2).
      const [mpA, mpB] = await Promise.all([
        migDb
          .insert(schema.mataPelajaran)
          .values({ kode: `KN-MP-${seq()}`, nama: `Komponen Mapel A` })
          .returning()
          .then((r) => r[0]),
        migDb
          .insert(schema.mataPelajaran)
          .values({ kode: `KN-MP-${seq()}`, nama: `Komponen Mapel B` })
          .returning()
          .then((r) => r[0]),
      ]);

      const [b1, b2] = await withTenant(db, SEED_A, async (tx: Tx) => {
        const [p] = await tx
          .insert(schema.ptk)
          .values({ nama: "PTK Komponen KN", jenis: "pendidik" })
          .returning();
        const [tk] = await tx
          .insert(schema.tingkat)
          .values({ nama: "Tingkat KN 1", urutan: seq() })
          .returning();
        const [ta] = await tx
          .insert(schema.tahunAjaran)
          .values({ nama: `TA KN ${seq()}`, aktif: false })
          .returning();
        const [rb] = await tx
          .insert(schema.rombonganBelajar)
          .values({
            nama: `Rombel KN ${seq()}`,
            tingkatId: tk.id,
            tahunAjaranId: ta.id,
          })
          .returning();
        const [row1] = await tx
          .insert(schema.bebanMengajar)
          .values({
            ptkId: p.id,
            mataPelajaranId: mpA.id,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
          })
          .returning();
        const [row2] = await tx
          .insert(schema.bebanMengajar)
          .values({
            ptkId: p.id,
            mataPelajaranId: mpB.id,
            rombonganBelajarId: rb.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
          })
          .returning();
        return [row1, row2] as const;
      });
      bebanAId = b1.id;
      bebanA2Id = b2.id;
    });

    // 1. buatKomponenNilai: insert referencing beban_mengajar with nama +
    //    bobot, then assert nama + bobot round-trip. tenant_id defaults from
    //    the session GUC; bebanMengajarId + dibuatPada must be populated.
    itOrSkip("buatKomponenNilai round-trips nama and bobot", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatKomponenNilai(tx, {
          bebanMengajarId: bebanAId,
          nama: "UTS",
          bobot: 30,
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.bebanMengajarId).toBe(bebanAId);
      expect(created.nama).toBe("UTS");
      // numeric column returns string; compare by numeric value.
      expect(Number(created.bobot)).toBe(30);
      expect(created.dibuatPada).toBeTruthy();
    });

    // 2. listKomponenNilai(bebanMengajarId): filtered list narrows to that
    //    beban's komponen only. A komponen seeded under beban #1 must not
    //    appear when listing beban #2. Uses baseline+delta so the case is
    //    order-independent of sibling cases.
    itOrSkip("listKomponenNilai(bebanMengajarId) returns the filtered list", async () => {
      const beforeTarget = await withTenant(db, SEED_A, (tx) =>
        listKomponenNilai(tx, bebanAId)
      );
      const beforeOther = await withTenant(db, SEED_A, (tx) =>
        listKomponenNilai(tx, bebanA2Id)
      );

      const k = await withTenant(db, SEED_A, (tx) =>
        buatKomponenNilai(tx, {
          bebanMengajarId: bebanAId,
          nama: "Tugas Harian",
          bobot: 40,
        })
      );

      const afterTarget = await withTenant(db, SEED_A, (tx) =>
        listKomponenNilai(tx, bebanAId)
      );
      expect(afterTarget).toHaveLength(beforeTarget.length + 1);
      expect(afterTarget.find((r) => r.id === k.id)).toBeDefined();

      // The other beban is unaffected.
      const afterOther = await withTenant(db, SEED_A, (tx) =>
        listKomponenNilai(tx, bebanA2Id)
      );
      expect(afterOther).toHaveLength(beforeOther.length);
      expect(afterOther.find((r) => r.id === k.id)).toBeUndefined();

      // Unfiltered list includes the new row too.
      const allList = await withTenant(db, SEED_A, (tx) =>
        listKomponenNilai(tx)
      );
      expect(allList.find((r) => r.id === k.id)).toBeDefined();
    });

    // 3. ubahKomponenNilai: update nama only; assert the changed field
    //    round-trips and id/tenantId/bebanMengajarId stay stable.
    itOrSkip("ubahKomponenNilai updates nama", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatKomponenNilai(tx, {
          bebanMengajarId: bebanAId,
          nama: "UAS Orig",
          bobot: 35,
        })
      );

      const updated = await withTenant(db, SEED_A, (tx) =>
        ubahKomponenNilai(tx, created.id, { nama: "UAS Baru" })
      );

      expect(updated.id).toBe(created.id);
      expect(updated.tenantId).toBe(SEED_A);
      expect(updated.bebanMengajarId).toBe(bebanAId);
      expect(updated.nama).toBe("UAS Baru");
      // Untouched bobot stays put.
      expect(Number(updated.bobot)).toBe(35);
    });

    // 4. hapusKomponenNilai: buat then hapus; the row is gone (read by id
    //    returns nothing under RLS).
    itOrSkip("hapusKomponenNilai removes the row", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatKomponenNilai(tx, {
          bebanMengajarId: bebanAId,
          nama: "Quiz Hapus",
          bobot: 10,
        })
      );

      await withTenant(db, SEED_A, (tx) => hapusKomponenNilai(tx, created.id));

      const rows = await withTenant(db, SEED_A, (tx) =>
        tx
          .select()
          .from(schema.komponenNilai)
          .where(eq(schema.komponenNilai.id, created.id))
      );
      expect(rows).toHaveLength(0);
    });

    // 5. RLS isolation (§13): a komponen created in SEED_A is NOT visible via
    //    listKomponenNilai from SEED_B (which is never written to in this
    //    file, so it is empty).
    itOrSkip("listKomponenNilai is tenant-isolated: SEED_B cannot see SEED_A's komponen", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatKomponenNilai(tx, {
          bebanMengajarId: bebanAId,
          nama: "RLS Komponen",
          bobot: 20,
        })
      );

      // Sanity: A can see its own row.
      const aList = await withTenant(db, SEED_A, (tx) =>
        listKomponenNilai(tx)
      );
      expect(aList.find((r) => r.id === created.id)).toBeDefined();

      // Cross-tenant: B's list does not include A's row (RLS hides it). SEED_B
      // is never written to in this file, so the empty assertion is robust
      // against future additions.
      const bList = await withTenant(db, SEED_B, (tx) =>
        listKomponenNilai(tx)
      );
      expect(bList.find((r) => r.id === created.id)).toBeUndefined();
    });
  }
);
