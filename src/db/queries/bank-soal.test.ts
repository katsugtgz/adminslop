import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";

import {
  arsipkanButirSoal,
  buatButirSoal,
  buatPaketSoal,
  cariButirSoalById,
  cariPaketSoalById,
  hapusButirDariPaket,
  listButirInPaket,
  listButirSoal,
  listPaketSoal,
  tambahButirKePaket,
  ubahButirSoal,
} from "./bank-soal";
import { buatDrafAi } from "./draf-ai";
import { buatPermintaanAi } from "./permintaan-ai";

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

// Tenant seeds — PRIVATE to this file (org_BS_*). Distinct per bank-soal test
// file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_BS_a";
const SEED_B = "org_BS_b";

// Monotonic counter for unique tenant-scoped + GLOBAL literals across tests.
// mata_pelajaran is GLOBAL (no tenant isolation); distinct kode/nama avoid
// cross-test collisions. tingkat has UNIQUE (tenant, urutan) and (tenant,
// nama); tahun_ajaran has UNIQUE (tenant, nama).
let _seq = 0;
const seq = (): number => ++_seq;

describeOrSkip(
  "bank-soal repository (queries/bank-soal.ts — #16 Wave 2 / T4)",
  () => {
    let migDb: Db;
    let db: Db;

    beforeAll(async () => {
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_BS_a', 'Satuan Pendidikan BS A'),
          ('org_BS_b', 'Satuan Pendidikan BS B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from paket_soal_butir where tenant_id in ('org_BS_a', 'org_BS_b');
        delete from paket_soal        where tenant_id in ('org_BS_a', 'org_BS_b');
        delete from butir_soal        where tenant_id in ('org_BS_a', 'org_BS_b');
        delete from draf_ai           where tenant_id in ('org_BS_a', 'org_BS_b');
        delete from permintaan_ai     where tenant_id in ('org_BS_a', 'org_BS_b');
        delete from tingkat           where tenant_id in ('org_BS_a', 'org_BS_b');
        delete from tahun_ajaran      where tenant_id in ('org_BS_a', 'org_BS_b');
      `);
      await seed.query(`delete from mata_pelajaran where kode like 'BS-MP-%';`);
      await seed.end();

      migDb = createDb(MIG_URL!).db;
      db = createDb(APP_URL!).db;
    });

    /**
     * Seed the GLOBAL mata pelajaran (migrator superuser — app_user has SELECT
     * only on GLOBAL refs) + the tenant-scoped FK chain under `tenantId`:
     * tingkat + tahun_ajaran. `tag` keeps every UNIQUE literal distinct.
     */
    async function seedParents(
      tenantId: string,
      tag: string
    ): Promise<{ mapelId: string; taId: string; tingkatId: string }> {
      const [mp] = await migDb
        .insert(schema.mataPelajaran)
        .values({
          kode: `BS-MP-${seq()}`,
          nama: `Bank Soal Mapel ${tag}`,
        })
        .returning();

      const { taId, tingkatId } = await withTenant(db, tenantId, async (tx) => {
        const [tk] = await tx
          .insert(schema.tingkat)
          .values({ nama: `Tingkat BS ${tag}`, urutan: seq() + 3000 })
          .returning();
        const [ta] = await tx
          .insert(schema.tahunAjaran)
          .values({ nama: `TA BS ${tag}`, aktif: false })
          .returning();
        return { taId: ta.id, tingkatId: tk.id };
      });

      return { mapelId: mp.id, taId, tingkatId };
    }

    // -------------------------------------------------------------------------
    // Butir Soal — CRUD + search + arsip
    // -------------------------------------------------------------------------

    itOrSkip("buatButirSoal round-trips pertanyaan + kunci_jawaban + jenis (no draf_ai)", async () => {
      const { mapelId, tingkatId } = await seedParents(SEED_A, "buat");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          tingkatId,
          jenis: "pg",
          pertanyaan: "Berapakah 2 + 2?",
          pilihan: { A: "3", B: "4", C: "5", D: "6" },
          kunciJawaban: "B",
          pembahasan: "2 + 2 = 4.",
          dibuatOleh: "user_a",
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.mataPelajaranId).toBe(mapelId);
      expect(created.tingkatId).toBe(tingkatId);
      expect(created.jenis).toBe("pg");
      expect(created.pertanyaan).toBe("Berapakah 2 + 2?");
      expect(created.kunciJawaban).toBe("B");
      expect(created.pembahasan).toBe("2 + 2 = 4.");
      expect(created.drafAiId).toBeNull();
      expect(created.status).toBe("aktif");
      expect(created.dibuatPada).toBeTruthy();
    });

    itOrSkip("ubahButirSoal updates pertanyaan only; untouched fields stay", async () => {
      const { mapelId } = await seedParents(SEED_A, "ubah");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          jenis: "essay",
          pertanyaan: "Jelaskan fotosintesis.",
          kunciJawaban: "Proses pembuatan makanan oleh tumbuhan.",
        })
      );

      const updated = await withTenant(db, SEED_A, (tx) =>
        ubahButirSoal(tx, created.id, {
          pertanyaan: "Jelaskan proses fotosintesis secara singkat.",
        })
      );

      expect(updated.id).toBe(created.id);
      expect(updated.pertanyaan).toBe(
        "Jelaskan proses fotosintesis secara singkat."
      );
      expect(updated.kunciJawaban).toBe("Proses pembuatan makanan oleh tumbuhan.");
      expect(updated.jenis).toBe("essay");
    });

    itOrSkip("arsipkanButirSoal flips status aktif -> arsip (soft delete)", async () => {
      const { mapelId } = await seedParents(SEED_A, "arsip");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          jenis: "isian",
          pertanyaan: "Ibu kota Indonesia adalah ...",
          kunciJawaban: "Jakarta",
        })
      );
      expect(created.status).toBe("aktif");

      const archived = await withTenant(db, SEED_A, (tx) =>
        arsipkanButirSoal(tx, created.id)
      );
      expect(archived.status).toBe("arsip");
      expect(archived.id).toBe(created.id);

      // Row still present (soft delete — list still includes it).
      const found = await withTenant(db, SEED_A, (tx) =>
        cariButirSoalById(tx, created.id)
      );
      expect(found).not.toBeNull();
      expect(found!.status).toBe("arsip");
    });

    itOrSkip("cariButirSoalById missing id -> null (no throw)", async () => {
      const found = await withTenant(db, SEED_A, (tx) =>
        cariButirSoalById(tx, "00000000-0000-0000-0000-000000000000")
      );
      expect(found).toBeNull();
    });

    itOrSkip("listButirSoal filters by mataPelajaranId + tingkatId + search ILIKE", async () => {
      const { mapelId, tingkatId } = await seedParents(SEED_A, "list");
      await withTenant(db, SEED_A, async (tx) => {
        await buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          tingkatId,
          jenis: "pg",
          pertanyaan: "Berapakah hasil 5 kali 3?",
          kunciJawaban: "15",
        });
        await buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          tingkatId,
          jenis: "pg",
          pertanyaan: "Sebutkan ibu kota Jepang.",
          kunciJawaban: "Tokyo",
        });
        await buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          tingkatId: null,
          jenis: "essay",
          pertanyaan: "Jelaskan sebab manusia perlu bernapas.",
          kunciJawaban: "Untuk memperoleh oksigen.",
        });
      });

      // Filter by mataPelajaranId only -> all three.
      const byMapel = await withTenant(db, SEED_A, (tx) =>
        listButirSoal(tx, { mataPelajaranId: mapelId })
      );
      expect(byMapel.length).toBeGreaterThanOrEqual(3);

      // Filter by mataPelajaranId + tingkatId -> first two only.
      const byMapelTingkat = await withTenant(db, SEED_A, (tx) =>
        listButirSoal(tx, { mataPelajaranId: mapelId, tingkatId })
      );
      const allHaveTingkat = byMapelTingkat.every(
        (b) => b.tingkatId === tingkatId
      );
      expect(allHaveTingkat).toBe(true);
      expect(byMapelTingkat.length).toBeGreaterThanOrEqual(2);

      // Filter by search ILIKE on pertanyaan -> only "hasil" matches.
      const bySearch = await withTenant(db, SEED_A, (tx) =>
        listButirSoal(tx, { mataPelajaranId: mapelId, search: "hasil" })
      );
      expect(bySearch.length).toBeGreaterThanOrEqual(1);
      expect(
        bySearch.every((b) => b.pertanyaan.toLowerCase().includes("hasil"))
      ).toBe(true);
    });

    // -------------------------------------------------------------------------
    // AC#2 — Draf AI verification gate
    // -------------------------------------------------------------------------

    itOrSkip("AC#2: buatButirSoal accepts a 'disetujui' draf_ai_id (provenance linked)", async () => {
      const { mapelId } = await seedParents(SEED_A, "ac2-ok");
      const { drafId } = await withTenant(db, SEED_A, async (tx) => {
        const permintaan = await buatPermintaanAi(tx, {
          jenis: "deskripsi_cp",
          konteks: { tag: "bs-ac2-ok" },
          dibuatOleh: "user_bs_ac2_ok",
        });
        const draf = await buatDrafAi(tx, {
          permintaanAiId: permintaan.id,
          konten: "Konten AI disetujui untuk butir.",
          provenance: "model=test;prompt_hash=bs-ok;ts=t",
        });
        // Flip to disetujui via the schema (the repo's verifikasiDrafAi would
        // also work; using the table directly keeps this test independent of
        // the draf-ai repo surface beyond buatDrafAi).
        await tx
          .update(schema.drafAi)
          .set({
            statusVerifikasi: "disetujui",
            diverifikasiOleh: "verifier_bs",
            diverifikasiPada: new Date(),
          })
          .where(eq(schema.drafAi.id, draf.id));
        return { drafId: draf.id };
      });

      const butir = await withTenant(db, SEED_A, (tx) =>
        buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          jenis: "essay",
          pertanyaan: "[AI] Jelaskan respirasi sel.",
          kunciJawaban: "Pertukaran gas di mitokondria.",
          drafAiId: drafId,
        })
      );
      expect(butir.drafAiId).toBe(drafId);
    });

    itOrSkip("AC#2: buatButirSoal REJECTS a 'menunggu' draf_ai_id (unverified AI cannot be canonical)", async () => {
      const { mapelId } = await seedParents(SEED_A, "ac2-menunggu");
      const { drafId } = await withTenant(db, SEED_A, async (tx) => {
        const permintaan = await buatPermintaanAi(tx, {
          jenis: "deskripsi_cp",
          konteks: { tag: "bs-ac2-m" },
          dibuatOleh: "user_bs_ac2_m",
        });
        const draf = await buatDrafAi(tx, {
          permintaanAiId: permintaan.id,
          konten: "Konten AI belum diverifikasi.",
          provenance: "model=test;prompt_hash=bs-m;ts=t",
        });
        return { drafId: draf.id };
      });

      await expect(
        withTenant(db, SEED_A, (tx) =>
          buatButirSoal(tx, {
            mataPelajaranId: mapelId,
            jenis: "essay",
            pertanyaan: "[AI] Jelaskan pokok bahasan.",
            kunciJawaban: "—",
            drafAiId: drafId,
          })
        )
      ).rejects.toThrow(/belum diverifikasi/i);
    });

    itOrSkip("AC#2: buatButirSoal REJECTS a 'ditolak' draf_ai_id", async () => {
      const { mapelId } = await seedParents(SEED_A, "ac2-ditolak");
      const { drafId } = await withTenant(db, SEED_A, async (tx) => {
        const permintaan = await buatPermintaanAi(tx, {
          jenis: "deskripsi_cp",
          konteks: { tag: "bs-ac2-d" },
          dibuatOleh: "user_bs_ac2_d",
        });
        const draf = await buatDrafAi(tx, {
          permintaanAiId: permintaan.id,
          konten: "Konten AI ditolak.",
          provenance: "model=test;prompt_hash=bs-d;ts=t",
        });
        await tx
          .update(schema.drafAi)
          .set({
            statusVerifikasi: "ditolak",
            diverifikasiOleh: "verifier_bs",
            diverifikasiPada: new Date(),
          })
          .where(eq(schema.drafAi.id, draf.id));
        return { drafId: draf.id };
      });

      await expect(
        withTenant(db, SEED_A, (tx) =>
          buatButirSoal(tx, {
            mataPelajaranId: mapelId,
            jenis: "essay",
            pertanyaan: "[AI] Jelaskan.",
            kunciJawaban: "—",
            drafAiId: drafId,
          })
        )
      ).rejects.toThrow(/belum diverifikasi/i);
    });

    itOrSkip("AC#2: buatButirSoal with missing draf_ai_id -> throws 'tidak ditemukan'", async () => {
      const { mapelId } = await seedParents(SEED_A, "ac2-missing");
      await expect(
        withTenant(db, SEED_A, (tx) =>
          buatButirSoal(tx, {
            mataPelajaranId: mapelId,
            jenis: "essay",
            pertanyaan: "[AI] ...",
            kunciJawaban: "—",
            drafAiId: "00000000-0000-0000-0000-000000000000",
          })
        )
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    // -------------------------------------------------------------------------
    // Paket Soal — CRUD
    // -------------------------------------------------------------------------

    itOrSkip("buatPaketSoal + cariPaketSoalById + listPaketSoal round-trip", async () => {
      const { mapelId, taId, tingkatId } = await seedParents(SEED_A, "paket");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatPaketSoal(tx, {
          nama: "Paket UTS Ganjil",
          mataPelajaranId: mapelId,
          tingkatId,
          tahunAjaranId: taId,
          semester: "ganjil",
          dibuatOleh: "user_a",
        })
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.nama).toBe("Paket UTS Ganjil");
      expect(created.mataPelajaranId).toBe(mapelId);
      expect(created.tahunAjaranId).toBe(taId);
      expect(created.semester).toBe("ganjil");

      const found = await withTenant(db, SEED_A, (tx) =>
        cariPaketSoalById(tx, created.id)
      );
      expect(found!.id).toBe(created.id);

      const list = await withTenant(db, SEED_A, (tx) =>
        listPaketSoal(tx, { tahunAjaranId: taId })
      );
      expect(list.find((p) => p.id === created.id)).toBeDefined();
    });

    itOrSkip("listPaketSoal filters by semester + mataPelajaranId", async () => {
      const { mapelId, taId } = await seedParents(SEED_A, "paket-filter");
      await withTenant(db, SEED_A, async (tx) => {
        await buatPaketSoal(tx, {
          nama: "Paket Genap A",
          mataPelajaranId: mapelId,
          tahunAjaranId: taId,
          semester: "genap",
        });
        await buatPaketSoal(tx, {
          nama: "Paket Ganjil A",
          mataPelajaranId: mapelId,
          tahunAjaranId: taId,
          semester: "ganjil",
        });
      });

      const genap = await withTenant(db, SEED_A, (tx) =>
        listPaketSoal(tx, { mataPelajaranId: mapelId, semester: "genap" })
      );
      expect(genap.every((p) => p.semester === "genap")).toBe(true);
      expect(genap.length).toBeGreaterThanOrEqual(1);
    });

    // -------------------------------------------------------------------------
    // Paket Soal Butir — junction add / remove / list
    // -------------------------------------------------------------------------

    itOrSkip("tambahButirKePaket adds butir with urutan + bobot; listButirInPaket returns ordered", async () => {
      const { mapelId, taId } = await seedParents(SEED_A, "junction");
      const { paketId, butir1Id, butir2Id } = await withTenant(db, SEED_A,
        async (tx) => {
          const paket = await buatPaketSoal(tx, {
            nama: "Paket Junction",
            mataPelajaranId: mapelId,
            tahunAjaranId: taId,
          });
          const b1 = await buatButirSoal(tx, {
            mataPelajaranId: mapelId,
            jenis: "pg",
            pertanyaan: "Soal 1?",
            kunciJawaban: "A",
          });
          const b2 = await buatButirSoal(tx, {
            mataPelajaranId: mapelId,
            jenis: "pg",
            pertanyaan: "Soal 2?",
            kunciJawaban: "B",
          });
          return { paketId: paket.id, butir1Id: b1.id, butir2Id: b2.id };
        }
      );

      // Add butir2 first (urutan 1), then butir1 (urutan 2) — order in list
      // must follow `urutan`, not insertion order.
      await withTenant(db, SEED_A, async (tx) => {
        await tambahButirKePaket(tx, {
          paketSoalId: paketId,
          butirSoalId: butir2Id,
          urutan: 1,
          bobot: "2",
        });
        await tambahButirKePaket(tx, {
          paketSoalId: paketId,
          butirSoalId: butir1Id,
          urutan: 2,
          bobot: "1.5",
        });
      });

      const members = await withTenant(db, SEED_A, (tx) =>
        listButirInPaket(tx, paketId)
      );
      expect(members).toHaveLength(2);
      expect(members[0].butirSoalId).toBe(butir2Id);
      expect(members[0].urutan).toBe(1);
      expect(members[0].bobot).toBe("2");
      expect(members[1].butirSoalId).toBe(butir1Id);
      expect(members[1].urutan).toBe(2);
      expect(members[1].bobot).toBe("1.5");
    });

    itOrSkip("hapusButirDariPaket removes the (paket, butir) pair; other members stay", async () => {
      const { mapelId, taId } = await seedParents(SEED_A, "junction-rm");
      const { paketId, b1Id, b2Id } = await withTenant(db, SEED_A, async (tx) => {
        const paket = await buatPaketSoal(tx, {
          nama: "Paket Hapus Junction",
          mataPelajaranId: mapelId,
          tahunAjaranId: taId,
        });
        const b1 = await buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          jenis: "pg",
          pertanyaan: "Q1?",
          kunciJawaban: "A",
        });
        const b2 = await buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          jenis: "pg",
          pertanyaan: "Q2?",
          kunciJawaban: "B",
        });
        await tambahButirKePaket(tx, {
          paketSoalId: paket.id,
          butirSoalId: b1.id,
          urutan: 1,
        });
        await tambahButirKePaket(tx, {
          paketSoalId: paket.id,
          butirSoalId: b2.id,
          urutan: 2,
        });
        return { paketId: paket.id, b1Id: b1.id, b2Id: b2.id };
      });

      await withTenant(db, SEED_A, (tx) =>
        hapusButirDariPaket(tx, paketId, b1Id)
      );

      const remaining = await withTenant(db, SEED_A, (tx) =>
        listButirInPaket(tx, paketId)
      );
      expect(remaining).toHaveLength(1);
      expect(remaining[0].butirSoalId).toBe(b2Id);
    });

    // -------------------------------------------------------------------------
    // RLS isolation (§13)
    // -------------------------------------------------------------------------

    itOrSkip("butir_soal is tenant-isolated: SEED_B cannot see/modify SEED_A's butir (RLS)", async () => {
      const { mapelId } = await seedParents(SEED_A, "rls");
      const created = await withTenant(db, SEED_A, (tx) =>
        buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          jenis: "pg",
          pertanyaan: "Butir rahasia SEED_A.",
          kunciJawaban: "A",
        })
      );

      // Sanity: A sees its own.
      const aFound = await withTenant(db, SEED_A, (tx) =>
        cariButirSoalById(tx, created.id)
      );
      expect(aFound).not.toBeNull();

      // Cross-tenant: B cannot see A's butir by id.
      const bFound = await withTenant(db, SEED_B, (tx) =>
        cariButirSoalById(tx, created.id)
      );
      expect(bFound).toBeNull();

      // RLS gates writes: arsipkan from B throws (UPDATE...returning sees 0
      // rows under B's tenant scope — the repo refuses to silent-no-op); A's
      // butir stays aktif.
      await expect(
        withTenant(db, SEED_B, (tx) => arsipkanButirSoal(tx, created.id))
      ).rejects.toThrow(/tidak ditemukan/i);
      const aAfter = await withTenant(db, SEED_A, (tx) =>
        cariButirSoalById(tx, created.id)
      );
      expect(aAfter!.status).toBe("aktif");
    });

    itOrSkip("paket_soal + paket_soal_butir are tenant-isolated (RLS)", async () => {
      const { mapelId, taId } = await seedParents(SEED_A, "rls-paket");
      const { paketId } = await withTenant(db, SEED_A, async (tx) => {
        const paket = await buatPaketSoal(tx, {
          nama: "Paket rahasia SEED_A",
          mataPelajaranId: mapelId,
          tahunAjaranId: taId,
        });
        return { paketId: paket.id };
      });

      // SEED_B cannot see A's paket.
      const bFound = await withTenant(db, SEED_B, (tx) =>
        cariPaketSoalById(tx, paketId)
      );
      expect(bFound).toBeNull();

      // SEED_B's view of A's paket members is empty.
      const bMembers = await withTenant(db, SEED_B, (tx) =>
        listButirInPaket(tx, paketId)
      );
      expect(bMembers).toEqual([]);
    });

    // -------------------------------------------------------------------------
    // FK CASCADE
    // -------------------------------------------------------------------------

    itOrSkip("cascades paket_soal -> paket_soal_butir (FK CASCADE)", async () => {
      const { mapelId, taId } = await seedParents(SEED_A, "casc-paket");
      const { paketId, butirId } = await withTenant(db, SEED_A, async (tx) => {
        const paket = await buatPaketSoal(tx, {
          nama: "Paket Cascade",
          mataPelajaranId: mapelId,
          tahunAjaranId: taId,
        });
        const b = await buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          jenis: "pg",
          pertanyaan: "Cascade Q?",
          kunciJawaban: "A",
        });
        await tambahButirKePaket(tx, {
          paketSoalId: paket.id,
          butirSoalId: b.id,
          urutan: 1,
        });
        return { paketId: paket.id, butirId: b.id };
      });

      // Sanity: junction row exists.
      const before = await withTenant(db, SEED_A, (tx) =>
        listButirInPaket(tx, paketId)
      );
      expect(before).toHaveLength(1);

      await withTenant(db, SEED_A, async (tx) => {
        await tx
          .delete(schema.paketSoal)
          .where(eq(schema.paketSoal.id, paketId));
      });

      const after = await withTenant(db, SEED_A, (tx) =>
        listButirInPaket(tx, paketId)
      );
      expect(after).toEqual([]);
      // Butir survives (only the junction row cascaded).
      const butirSurvived = await withTenant(db, SEED_A, (tx) =>
        cariButirSoalById(tx, butirId)
      );
      expect(butirSurvived).not.toBeNull();
    });

    itOrSkip("ON DELETE SET NULL: deleting a disetujui draf_ai detaches the butir (drafAiId -> null)", async () => {
      const { mapelId } = await seedParents(SEED_A, "setnull-draf");
      const { drafId } = await withTenant(db, SEED_A, async (tx) => {
        const permintaan = await buatPermintaanAi(tx, {
          jenis: "deskripsi_cp",
          konteks: { tag: "bs-setnull" },
          dibuatOleh: "user_bs_sn",
        });
        const draf = await buatDrafAi(tx, {
          permintaanAiId: permintaan.id,
          konten: "Konten AI untuk butir SET NULL.",
          provenance: "model=test;prompt_hash=bs-sn;ts=t",
        });
        await tx
          .update(schema.drafAi)
          .set({
            statusVerifikasi: "disetujui",
            diverifikasiOleh: "v_bs",
            diverifikasiPada: new Date(),
          })
          .where(eq(schema.drafAi.id, draf.id));
        return { drafId: draf.id };
      });

      const butir = await withTenant(db, SEED_A, (tx) =>
        buatButirSoal(tx, {
          mataPelajaranId: mapelId,
          jenis: "essay",
          pertanyaan: "[AI] Jelaskan ekosistem.",
          kunciJawaban: "—",
          drafAiId: drafId,
        })
      );
      expect(butir.drafAiId).toBe(drafId);

      // Delete the draf -> the butir survives with drafAiId=NULL (SET NULL).
      await withTenant(db, SEED_A, async (tx) => {
        await tx
          .delete(schema.drafAi)
          .where(eq(schema.drafAi.id, drafId));
      });

      const after = await withTenant(db, SEED_A, (tx) =>
        cariButirSoalById(tx, butir.id)
      );
      expect(after).not.toBeNull();
      expect(after!.drafAiId).toBeNull();
    });
  }
);
