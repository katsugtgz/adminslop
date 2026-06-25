import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";

import {
  hapusMutasi,
  listMutasi,
  tambahMutasi,
  type InputMutasi,
} from "./mutasi-peserta-didik";

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

// Tenant seeds — PRIVATE to this file (org_pdM_*). Distinct per peserta-didik
// test file so parallel vitest runs cannot delete each other's seed rows:
// all beforeAll DELETEs are scoped to these tenant IDs only. SEED_B is the
// primary tenant; SEED_A is used only for the RLS-isolation assertion (#7).
const SEED_A = "org_pdM_a";
const SEED_B = "org_pdM_b";

describeOrSkip(
  "mutasiPesertaDidik repository (queries/mutasi-peserta-didik.ts — #7 Wave 2 T5)",
  () => {
    let db: Db;
    // Shared peserta_didik row in SEED_B (seeded in beforeAll; reused by the
    // RLS-isolation case). Each other case mints its own student for isolation.
    let pesertaBId: string;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT) and clear peserta-didik-layer rows in
      //    FK-safe order (children first, then parent) so each run starts
      //    clean (superuser bypasses RLS).
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_pdM_a', 'Satuan Pendidikan A'),
          ('org_pdM_b', 'Satuan Pendidikan B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from kontak_darurat where tenant_id in ('org_pdM_a', 'org_pdM_b');
        delete from wali_peserta_didik where tenant_id in ('org_pdM_a', 'org_pdM_b');
        delete from mutasi_peserta_didik where tenant_id in ('org_pdM_a', 'org_pdM_b');
        delete from riwayat_status_peserta_didik where tenant_id in ('org_pdM_a', 'org_pdM_b');
        delete from peserta_didik where tenant_id in ('org_pdM_a', 'org_pdM_b');
      `);
      await seed.end();

      // 3. App client uses the non-superuser role — RLS enforced.
      db = createDb(APP_URL!).db;

      // 4. Seed a peserta_didik row in SEED_B (primary tenant).
      const [pd] = await withTenant(db, SEED_B, (tx) =>
        tx
          .insert(schema.pesertaDidik)
          .values({
            nama: "Peserta Didik Mutasi B",
            nisn: "1234567890",
            tanggalLahir: "2010-01-01",
            jenisKelamin: "L",
          })
          .returning()
      );
      pesertaBId = pd.id;
    });

    // Helper: mint a fresh peserta_didik in SEED_B so each case is isolated
    // from the others (no shared mutable state between cases).
    async function buatPesertaB(nama: string): Promise<string> {
      const [pd] = await withTenant(db, SEED_B, (tx) =>
        tx
          .insert(schema.pesertaDidik)
          .values({
            nama,
            tanggalLahir: "2011-05-05",
            jenisKelamin: "P",
          })
          .returning()
      );
      return pd.id;
    }

    // 1. tambahMutasi (arah='keluar') inserts and round-trips every field.
    itOrSkip("tambahMutasi (keluar) inserts and returns all fields", async () => {
      const pdId = await buatPesertaB("Siti Keluar");
      const input: InputMutasi = {
        pesertaDidikId: pdId,
        arah: "keluar",
        asalSekolah: "SMP Asal",
        tujuanSekolah: "SMP Tujuan",
        tanggal: "2024-06-15",
        alasan: "Pindah domisili",
        dibuatOleh: "user_t5_1",
      };

      const row = await withTenant(db, SEED_B, (tx) => tambahMutasi(tx, input));

      expect(row.id).toBeTruthy();
      expect(row.tenantId).toBe(SEED_B);
      expect(row.pesertaDidikId).toBe(pdId);
      expect(row.arah).toBe("keluar");
      expect(row.asalSekolah).toBe("SMP Asal");
      expect(row.tujuanSekolah).toBe("SMP Tujuan");
      expect(row.tanggal).toBe("2024-06-15");
      expect(row.alasan).toBe("Pindah domisili");
      expect(row.dibuatOleh).toBe("user_t5_1");
      expect(row.dibuatPada).toBeTruthy();
    });

    // 2. tambahMutasi (arah='masuk') stores arah; absent optionals → null.
    itOrSkip("tambahMutasi (masuk) stores arah='masuk'; optionals null", async () => {
      const pdId = await buatPesertaB("Andi Masuk");

      const row = await withTenant(db, SEED_B, (tx) =>
        tambahMutasi(tx, {
          pesertaDidikId: pdId,
          arah: "masuk",
          tujuanSekolah: "SMP Tujuan Masuk",
          tanggal: "2024-07-01",
        })
      );

      expect(row.arah).toBe("masuk");
      expect(row.pesertaDidikId).toBe(pdId);
      expect(row.tujuanSekolah).toBe("SMP Tujuan Masuk");
      expect(row.tanggal).toBe("2024-07-01");
      // Optionals omitted → null.
      expect(row.asalSekolah).toBeNull();
      expect(row.alasan).toBeNull();
      expect(row.dibuatOleh).toBeNull();
    });

    // 3. listMutasi(pesertaDidikId) returns that student's transfers only.
    itOrSkip("listMutasi(pesertaDidikId) returns transfers for that student", async () => {
      const pdId = await buatPesertaB("Budi List");
      await withTenant(db, SEED_B, (tx) =>
        tambahMutasi(tx, {
          pesertaDidikId: pdId,
          arah: "keluar",
          tanggal: "2024-01-01",
        })
      );
      await withTenant(db, SEED_B, (tx) =>
        tambahMutasi(tx, {
          pesertaDidikId: pdId,
          arah: "masuk",
          tanggal: "2024-02-01",
        })
      );

      const list = await withTenant(db, SEED_B, (tx) => listMutasi(tx, pdId));

      expect(list).toHaveLength(2);
      expect(list.every((m) => m.pesertaDidikId === pdId)).toBe(true);
      // ORDER BY tanggal DESC: 2024-02-01 first, then 2024-01-01.
      expect(list[0].tanggal).toBe("2024-02-01");
      expect(list[1].tanggal).toBe("2024-01-01");
    });

    // 4. listMutasi() (no arg) returns ALL transfers visible in the tenant.
    itOrSkip("listMutasi() returns all transfers in the tenant", async () => {
      const pdId = await buatPesertaB("Cici All");
      await withTenant(db, SEED_B, (tx) =>
        tambahMutasi(tx, {
          pesertaDidikId: pdId,
          arah: "keluar",
          tanggal: "2024-03-01",
        })
      );

      const all = await withTenant(db, SEED_B, (tx) => listMutasi(tx));

      // Earlier cases in this run leave rows behind, so assert >= 1 and that
      // ours is present (robust against accumulation, not brittle on count).
      expect(all.length).toBeGreaterThanOrEqual(1);
      expect(all.some((m) => m.pesertaDidikId === pdId)).toBe(true);
    });

    // 5. hapusMutasi removes the row.
    itOrSkip("hapusMutasi removes the row", async () => {
      const pdId = await buatPesertaB("Dewi Hapus");
      const created = await withTenant(db, SEED_B, (tx) =>
        tambahMutasi(tx, {
          pesertaDidikId: pdId,
          arah: "keluar",
          tanggal: "2024-04-01",
        })
      );

      await withTenant(db, SEED_B, (tx) => hapusMutasi(tx, created.id));

      const after = await withTenant(db, SEED_B, (tx) => listMutasi(tx, pdId));
      expect(after.find((m) => m.id === created.id)).toBeUndefined();
    });

    // 6. RLS isolation (core §13): a mutasi in SEED_B is invisible from SEED_A.
    itOrSkip("listMutasi is tenant-isolated: SEED_A cannot see SEED_B mutasi", async () => {
      await withTenant(db, SEED_B, (tx) =>
        tambahMutasi(tx, {
          pesertaDidikId: pesertaBId,
          arah: "keluar",
          tanggal: "2024-05-01",
        })
      );

      const aList = await withTenant(db, SEED_A, (tx) => listMutasi(tx));
      // §13: SEED_B's mutasi must not leak to SEED_A.
      expect(aList.find((m) => m.pesertaDidikId === pesertaBId)).toBeUndefined();
    });

    // 7. FK CASCADE: deleting the parent peserta_didik removes its mutasi rows.
    itOrSkip("deleting peserta_didik cascades to its mutasi rows", async () => {
      const pdId = await buatPesertaB("Eka Cascade");
      await withTenant(db, SEED_B, (tx) =>
        tambahMutasi(tx, {
          pesertaDidikId: pdId,
          arah: "keluar",
          tanggal: "2024-08-01",
        })
      );

      // Mutasi exists before the parent delete.
      let list = await withTenant(db, SEED_B, (tx) => listMutasi(tx, pdId));
      expect(list).toHaveLength(1);

      // Delete the parent peserta_didik (own-tenant; RLS permits it).
      await withTenant(db, SEED_B, (tx) =>
        tx.delete(schema.pesertaDidik).where(eq(schema.pesertaDidik.id, pdId))
      );

      // CASCADE removed the child mutasi rows.
      list = await withTenant(db, SEED_B, (tx) => listMutasi(tx, pdId));
      expect(list).toHaveLength(0);
    });
  }
);
