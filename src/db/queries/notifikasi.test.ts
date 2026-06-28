import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  aturPreferensiNotifikasi,
  buatNotifikasi,
  cariNotifikasiById,
  getPreferensiNotifikasi,
  hitungBelumDibaca,
  listNotifikasiAktif,
  listNotifikasiByPengguna,
  tandaiDibaca,
  tandaiSemuaDibaca,
} from "./notifikasi";

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

// Tenant seeds — PRIVATE to this file (org_NF1_*). Distinct per notifikasi test
// file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_NF1_a";
const SEED_B = "org_NF1_b";

let _seq = 0;
const seq = (): number => ++_seq;

describeOrSkip(
  "notifikasi repository (queries/notifikasi.ts — #20 Wave 3)",
  () => {
    let db: Db;

    // Two pengguna in SEED_A (distinct recipients). SEED_B is never written
    // (RLS proof: B sees nothing for A's recipients).
    let penggunaA1Id: string;
    let penggunaA2Id: string;

    beforeAll(async () => {
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // Seed tenant registry + clear the notifikasi layer (and pengguna to
      // reset recipient identities) in FK-safe order. Scoped to this file's
      // tenants only. Superuser bypasses RLS.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_NF1_a', 'Satuan Pendidikan NF1 A'),
          ('org_NF1_b', 'Satuan Pendidikan NF1 B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from preferensi_notifikasi where tenant_id in ('org_NF1_a', 'org_NF1_b');
        delete from notifikasi          where tenant_id in ('org_NF1_a', 'org_NF1_b');
        delete from pengguna            where tenant_id in ('org_NF1_a', 'org_NF1_b');
      `);
      await seed.end();

      db = createDb(APP_URL!).db;

      // Seed two pengguna in SEED_A (RLS-aware via app role inside withTenant).
      const seedPengguna = async (
        tenant: string,
        userId: string
      ): Promise<string> => {
        return withTenant(db, tenant, async (tx: Tx) => {
          const [p] = await tx
            .insert(schema.pengguna)
            .values({ userId, peranAkses: "guru", nama: `Pengguna ${userId}` })
            .returning();
          return p.id;
        });
      };
      penggunaA1Id = await seedPengguna(SEED_A, `nf1-a1-${seq()}`);
      penggunaA2Id = await seedPengguna(SEED_A, `nf1-a2-${seq()}`);
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    // 1. buatNotifikasi: round-trips tipe/judul/pesan/konteks; tenant_id
    //    defaults from the GUC; dibaca defaults false; id/dibuatPada generated.
    itOrSkip("buatNotifikasi round-trips fields and defaults (dibaca=false, tenant from GUC)", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "tugas_nilai",
          judul: "Nilai belum diinput",
          pesan: "Nilai belum diinput untuk Matematika",
          konteks: { bebanId: "bm_1", penilaianId: "p_1" },
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.penggunaId).toBe(penggunaA1Id);
      expect(created.tipe).toBe("tugas_nilai");
      expect(created.judul).toBe("Nilai belum diinput");
      expect(created.pesan).toBe("Nilai belum diinput untuk Matematika");
      expect(created.dibaca).toBe(false);
      expect(created.konteks).toEqual({ bebanId: "bm_1", penilaianId: "p_1" });
      expect(created.dibuatPada).toBeTruthy();
    });

    // 2. buatNotifikasi: konteks optional (null when omitted).
    itOrSkip("buatNotifikasi allows optional konteks (null when omitted)", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "umum",
          judul: "Pengumuman",
          pesan: "Anda memiliki tugas yang tertunda.",
        })
      );
      expect(created.konteks).toBeNull();
    });

    // 3. listNotifikasiByPengguna: recipient-scoped — A1 sees only A1's rows,
    //    NOT A2's (same tenant). Ordered dibuatPada DESC.
    itOrSkip("listNotifikasiByPengguna is recipient-scoped (A1 cannot see A2's)", async () => {
      const a1 = await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "umum",
          judul: "Untuk A1",
          pesan: "Pesan A1",
        })
      );
      const a2 = await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA2Id,
          tipe: "umum",
          judul: "Untuk A2",
          pesan: "Pesan A2",
        })
      );

      const listA1 = await withTenant(db, SEED_A, (tx) =>
        listNotifikasiByPengguna(tx, penggunaA1Id)
      );
      expect(listA1.find((r) => r.id === a1.id)).toBeDefined();
      // recipient-scoping: A2's row is NOT in A1's list.
      expect(listA1.find((r) => r.id === a2.id)).toBeUndefined();

      // Ordering: newest first (DESC).
      const ts = listA1.map((r) => r.dibuatPada.getTime());
      expect(ts).toEqual([...ts].sort((x, y) => y - x));
    });

    // 4. hanyaBelumDibaca option: only dibaca=false rows returned.
    itOrSkip("listNotifikasiByPengguna({hanyaBelumDibaca}) returns only unread", async () => {
      const unread = await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "tugas_absensi",
          judul: "Absensi belum dicatat",
          pesan: "Absensi belum dicatat untuk hari ini",
        })
      );
      const read = await withTenant(db, SEED_A, async (tx) => {
        const n = await buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "umum",
          judul: "Sudah dibaca",
          pesan: "Pesan dibaca",
        });
        return tandaiDibaca(tx, n.id);
      });
      expect(read.dibaca).toBe(true);

      const unreadOnly = await withTenant(db, SEED_A, (tx) =>
        listNotifikasiByPengguna(tx, penggunaA1Id, { hanyaBelumDibaca: true })
      );
      expect(unreadOnly.find((r) => r.id === unread.id)).toBeDefined();
      expect(unreadOnly.find((r) => r.id === read.id)).toBeUndefined();
      // every row unread
      expect(unreadOnly.every((r) => r.dibaca === false)).toBe(true);
    });

    // 5. tandaiDibaca + tandaiSemuaDibaca: dibaca toggle. tandaiDibaca throws
    //    on missing/cross-tenant id (RLS hides it).
    itOrSkip("tandaiDibaca flips dibaca to true; throws on missing id", async () => {
      const n = await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "umum",
          judul: "Tandai saya",
          pesan: "Belum dibaca",
        })
      );
      expect(n.dibaca).toBe(false);

      const updated = await withTenant(db, SEED_A, (tx) =>
        tandaiDibaca(tx, n.id)
      );
      expect(updated.id).toBe(n.id);
      expect(updated.dibaca).toBe(true);

      // A bogus id resolves to nothing under RLS -> throws.
      await expect(
        withTenant(db, SEED_A, (tx) =>
          tandaiDibaca(tx, "00000000-0000-0000-0000-000000000000")
        )
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    itOrSkip("tandaiSemuaDibaca marks all unread for a recipient; returns count", async () => {
      // seed two fresh unread rows for A1
      await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "umum",
          judul: `Semua-${seq()}`,
          pesan: "akan ditandai",
        })
      );
      await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "umum",
          judul: `Semua-${seq()}`,
          pesan: "akan ditandai",
        })
      );

      const affected = await withTenant(db, SEED_A, (tx) =>
        tandaiSemuaDibaca(tx, penggunaA1Id)
      );
      expect(affected).toBeGreaterThanOrEqual(2);

      // After: zero unread for A1.
      const unread = await withTenant(db, SEED_A, (tx) =>
        listNotifikasiByPengguna(tx, penggunaA1Id, { hanyaBelumDibaca: true })
      );
      expect(unread).toHaveLength(0);
    });

    // 6. hitungBelumDibaca: badge count — only unread for the recipient.
    itOrSkip("hitungBelumDibaca counts unread for the recipient (badge)", async () => {
      // Seed one unread + one read for A1 (within this case).
      await withTenant(db, SEED_A, async (tx) => {
        await buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "tugas_eraport",
          judul: `Eraport-${seq()}`,
          pesan: "Belum diinput",
        });
        const read = await buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "umum",
          judul: `Dibaca-${seq()}`,
          pesan: "x",
        });
        await tandaiDibaca(tx, read.id);
      });

      const n = await withTenant(db, SEED_A, (tx) =>
        hitungBelumDibaca(tx, penggunaA1Id)
      );
      expect(typeof n).toBe("number");
      expect(n).toBeGreaterThanOrEqual(1);

      // A2 (no rows seeded here beyond earlier cases) — count is independent.
      const n2 = await withTenant(db, SEED_A, (tx) =>
        hitungBelumDibaca(tx, penggunaA2Id)
      );
      expect(n2).toBeGreaterThanOrEqual(0);
    });

    // 7. RLS isolation: SEED_B cannot see SEED_A's notifikasi; cross-tenant
    //    delete/toggle is a silent no-op.
    itOrSkip("RLS isolation: SEED_B cannot see/touch SEED_A's notifikasi", async () => {
      const aRow = await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "umum",
          judul: "Milik A",
          pesan: "rls proof",
        })
      );

      // Sanity: A can see its own row.
      const aList = await withTenant(db, SEED_A, (tx) =>
        listNotifikasiByPengguna(tx, penggunaA1Id)
      );
      expect(aList.find((r) => r.id === aRow.id)).toBeDefined();

      // Cross-tenant: B sees nothing for penggunaA1Id (RLS hides A's rows).
      const bList = await withTenant(db, SEED_B, (tx) =>
        listNotifikasiByPengguna(tx, penggunaA1Id)
      );
      expect(bList).toEqual([]);
      expect(bList.find((r) => r.id === aRow.id)).toBeUndefined();

      // RLS gates updates: tandaiDibaca from B throws (not found under RLS).
      await expect(
        withTenant(db, SEED_B, (tx) => tandaiDibaca(tx, aRow.id))
      ).rejects.toThrow(/tidak ditemukan/i);

      // A still sees the row as unread (B's attempt was a no-op).
      const found = await withTenant(db, SEED_A, (tx) =>
        cariNotifikasiById(tx, aRow.id)
      );
      expect(found?.dibaca).toBe(false);
    });

    // 8. aturPreferensiNotifikasi upsert on UNIQUE(tenant, pengguna, tipe):
    //    inserting the same (pengguna, tipe) twice updates aktif, not errors.
    itOrSkip("aturPreferensiNotifikasi upserts on UNIQUE(tenant, pengguna, tipe)", async () => {
      const first = await withTenant(db, SEED_A, (tx) =>
        aturPreferensiNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "tugas_nilai",
          aktif: false,
        })
      );
      expect(first.aktif).toBe(false);

      // Second call on same (pengguna, tipe) -> UPDATE not error.
      const second = await withTenant(db, SEED_A, (tx) =>
        aturPreferensiNotifikasi(tx, {
          penggunaId: penggunaA1Id,
          tipe: "tugas_nilai",
          aktif: true,
        })
      );
      expect(second.aktif).toBe(true);
      expect(second.id).toBe(first.id);

      // Only ONE row exists for (pengguna, tipe).
      const prefs = await withTenant(db, SEED_A, (tx) =>
        getPreferensiNotifikasi(tx, penggunaA1Id)
      );
      const forTipe = prefs.filter((p) => p.tipe === "tugas_nilai");
      expect(forTipe).toHaveLength(1);
    });

    // 9. listNotifikasiAktif: a tipe with aktif=false preference is excluded;
    //    a tipe with no preference (missing = aktif) is included.
    itOrSkip("listNotifikasiAktif filters by preferensi (aktif=false excluded, missing included)", async () => {
      // Use A2 to keep this case isolated. Seed two tipe.
      const nilaiN = await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA2Id,
          tipe: "tugas_nilai",
          judul: "Ditampilkan jika aktif",
          pesan: "pesan nilai",
        })
      );
      const absenN = await withTenant(db, SEED_A, (tx) =>
        buatNotifikasi(tx, {
          penggunaId: penggunaA2Id,
          tipe: "tugas_absensi",
          judul: "Akan disembunyikan",
          pesan: "pesan absen",
        })
      );

      // No preferences yet -> all aktif (all included).
      const beforePref = await withTenant(db, SEED_A, (tx) =>
        listNotifikasiAktif(tx, penggunaA2Id)
      );
      expect(beforePref.find((r) => r.id === nilaiN.id)).toBeDefined();
      expect(beforePref.find((r) => r.id === absenN.id)).toBeDefined();

      // Mute tugas_absensi for A2.
      await withTenant(db, SEED_A, (tx) =>
        aturPreferensiNotifikasi(tx, {
          penggunaId: penggunaA2Id,
          tipe: "tugas_absensi",
          aktif: false,
        })
      );

      const afterPref = await withTenant(db, SEED_A, (tx) =>
        listNotifikasiAktif(tx, penggunaA2Id)
      );
      // tugas_nilai still shown (no preference = aktif).
      expect(afterPref.find((r) => r.id === nilaiN.id)).toBeDefined();
      // tugas_absensi hidden (aktif=false).
      expect(afterPref.find((r) => r.id === absenN.id)).toBeUndefined();
      expect(afterPref.find((r) => r.tipe === "tugas_absensi")).toBeUndefined();

      // Un-mute -> shown again (upsert flips aktif back to true).
      await withTenant(db, SEED_A, (tx) =>
        aturPreferensiNotifikasi(tx, {
          penggunaId: penggunaA2Id,
          tipe: "tugas_absensi",
          aktif: true,
        })
      );
      const afterUnmute = await withTenant(db, SEED_A, (tx) =>
        listNotifikasiAktif(tx, penggunaA2Id)
      );
      expect(afterUnmute.find((r) => r.id === absenN.id)).toBeDefined();
    });

    // 10. cascade proof: deleting a pengguna removes their notifikasi +
    //     preferensi rows (ON DELETE CASCADE on the FK).
    itOrSkip("ON DELETE CASCADE: removing a pengguna removes their notifikasi + preferensi", async () => {
      const tmpUserId = `nf1-cascade-${seq()}`;
      const tmpTenant = SEED_A;
      const tmpPenggunaId = await withTenant(db, tmpTenant, async (tx) => {
        const [p] = await tx
          .insert(schema.pengguna)
          .values({ userId: tmpUserId, peranAkses: "guru", nama: "Cascade" })
          .returning();
        return p.id;
      });
      await withTenant(db, tmpTenant, async (tx) => {
        await buatNotifikasi(tx, {
          penggunaId: tmpPenggunaId,
          tipe: "umum",
          judul: "Akan terhapus",
          pesan: "cascade",
        });
        await aturPreferensiNotifikasi(tx, {
          penggunaId: tmpPenggunaId,
          tipe: "umum",
          aktif: false,
        });
      });

      // Sanity: rows exist.
      const beforeN = await withTenant(db, tmpTenant, (tx) =>
        listNotifikasiByPengguna(tx, tmpPenggunaId)
      );
      expect(beforeN.length).toBeGreaterThanOrEqual(1);
      const beforeP = await withTenant(db, tmpTenant, (tx) =>
        getPreferensiNotifikasi(tx, tmpPenggunaId)
      );
      expect(beforeP.length).toBeGreaterThanOrEqual(1);

      // Delete the pengguna as superuser (app role cannot due to FK/RLS scope).
      const pool = new pg.Pool({ connectionString: MIG_URL });
      await pool.query(`delete from pengguna where id = $1`, [tmpPenggunaId]);
      await pool.end();

      // Rows are gone (cascade). SELECT via raw app client scoped to tenant.
      const afterN = await withTenant(db, tmpTenant, (tx) =>
        tx
          .select()
          .from(schema.notifikasi)
          .where(eq(schema.notifikasi.penggunaId, tmpPenggunaId))
      );
      expect(afterN).toHaveLength(0);
      const afterP = await withTenant(db, tmpTenant, (tx) =>
        tx
          .select()
          .from(schema.preferensiNotifikasi)
          .where(eq(schema.preferensiNotifikasi.penggunaId, tmpPenggunaId))
      );
      expect(afterP).toHaveLength(0);
    });
  }
);
