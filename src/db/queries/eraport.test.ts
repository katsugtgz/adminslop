import path from "node:path";

import pg, { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";

import { buatDrafAi } from "./draf-ai";
import { buatPermintaanAi, ubahStatusPermintaanAi } from "./permintaan-ai";
import { buatTahunAjaran } from "./tahun-ajaran";
import { buatPesertaDidik } from "./peserta-didik";
import {
  buatDrafEraport,
  catatRevisi,
  getDrafEraportById,
  listDrafEraport,
  listRevisiByEraport,
  terbitkanEraport,
} from "./eraport";

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

// Tenant seeds — PRIVATE to this file (org_ER_*). Distinct per eraport repo
// test file so parallel vitest runs cannot delete each other's seed rows.
const SEED_A = "org_ER_a";
const SEED_B = "org_ER_b";

function hasCause(e: unknown): e is { cause: unknown } {
  return typeof e === "object" && e !== null && "cause" in e;
}

function unwrapPgError(err: unknown): DatabaseError | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur != null; i++) {
    if (cur instanceof DatabaseError) return cur;
    cur = hasCause(cur) ? cur.cause : null;
  }
  return null;
}

async function expectConstraintViolation(
  promise: Promise<unknown>
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const pgErr = unwrapPgError(err);
    if (pgErr) {
      expect(pgErr.code).toMatch(/^23/);
      return;
    }
    throw err;
  }
  throw new Error(
    "expected promise to reject with a constraint violation, but it resolved"
  );
}

let db: Db;

describeOrSkip(
  "eraport repository (queries/eraport.ts — #13 Wave 2 / T4)",
  () => {
    beforeAll(async () => {
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_ER_a', 'Satuan Pendidikan ER A'),
          ('org_ER_b', 'Satuan Pendidikan ER B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from revisi_eraport where tenant_id in ('org_ER_a', 'org_ER_b');
        delete from draf_eraport  where tenant_id in ('org_ER_a', 'org_ER_b');
        delete from tahun_ajaran  where tenant_id in ('org_ER_a', 'org_ER_b');
        delete from peserta_didik where tenant_id in ('org_ER_a', 'org_ER_b');
      `);
      await seed.end();

      db = createDb(APP_URL!).db;
    });

    /** Seed a Tahun Ajaran + Peserta Didik under the current tenant. */
    async function seedFixture(tx: Tx, tag: string) {
      const ta = await buatTahunAjaran(tx, { nama: `TA-${tag}` });
      const pd = await buatPesertaDidik(tx, {
        nama: `PD-${tag}`,
        tanggalLahir: "2010-01-01",
        jenisKelamin: "L",
      });
      return { ta, pd };
    }

    /** Seed a permintaan_ai + draf_ai and optionally verify it (disetujui). */
    async function seedDrafAi(
      tx: Tx,
      tag: string,
      opts?: { readonly disetujui?: boolean }
    ) {
      const permintaan = await buatPermintaanAi(tx, {
        jenis: "narasi_raport",
        konteks: { tag },
        dibuatOleh: `user_er_${tag}`,
      });
      const draf = await buatDrafAi(tx, {
        permintaanAiId: permintaan.id,
        konten: `AI konten ${tag}`,
        provenance: `model=test;prompt_hash=${tag};ts=2026-01-01T00:00:00Z`,
      });
      if (opts?.disetujui) {
        await ubahStatusPermintaanAi(tx, permintaan.id, "selesai");
        const [verified] = await tx
          .update(schema.drafAi)
          .set({
            statusVerifikasi: "disetujui",
            diverifikasiOleh: `user_verifier_${tag}`,
            diverifikasiPada: new Date(),
          })
          .where(eq(schema.drafAi.id, draf.id))
          .returning();
        return { permintaan, draf: verified };
      }
      return { permintaan, draf };
    }

    // 1. AC#1 happy path: a new draf_eraport starts at status='draf'. konten
    //    round-trips. getDrafEraportById reads it back. tenant_id defaults
    //    from the GUC.
    itOrSkip("buatDrafEraport creates a 'draf' row; getDrafEraportById reads it back", async () => {
      const { eraport, ta, pd } = await withTenant(db, SEED_A, async (tx) => {
        const f = await seedFixture(tx, "crud");
        const e = await buatDrafEraport(tx, {
          pesertaDidikId: f.pd.id,
          tahunAjaranId: f.ta.id,
          semester: "ganjil",
          konten: { nilaiAkhir: 87.5, sumber: "nilai_akhir" },
          dibuatOleh: "user_er_crud",
        });
        return { eraport: e, ta: f.ta, pd: f.pd };
      });

      expect(eraport.tenantId).toBe(SEED_A);
      expect(eraport.pesertaDidikId).toBe(pd.id);
      expect(eraport.tahunAjaranId).toBe(ta.id);
      expect(eraport.semester).toBe("ganjil");
      expect(eraport.status).toBe("draf");
      expect(eraport.konten).toEqual({ nilaiAkhir: 87.5, sumber: "nilai_akhir" });
      expect(eraport.drafAiId).toBeNull();
      expect(eraport.diterbitkanPada).toBeNull();
      expect(eraport.dibuatPada).toBeTruthy();

      const found = await withTenant(db, SEED_A, (tx) =>
        getDrafEraportById(tx, eraport.id)
      );
      expect(found).not.toBeNull();
      expect(found!.id).toBe(eraport.id);

      const missing = await withTenant(db, SEED_A, (tx) =>
        getDrafEraportById(tx, "00000000-0000-0000-0000-000000000000")
      );
      expect(missing).toBeNull();
    });

    // 2. AC#4 PROOF: an unverified (menunggu) draf_ai MUST be rejected. Only a
    //    disetujui draft may be linked. This is the core AI-trust gate.
    itOrSkip("AC#4: buatDrafEraport rejects an unverified (menunggu) draf_ai", async () => {
      const { drafAiIdMenunggu, drafAiIdDisetujui, ta, pd } = await withTenant(
        db,
        SEED_A,
        async (tx) => {
          const f = await seedFixture(tx, "ac4");
          const unverified = await seedDrafAi(tx, "ac4-unverified"); // menunggu
          const verified = await seedDrafAi(tx, "ac4-verified", {
            disetujui: true,
          });
          return {
            drafAiIdMenunggu: unverified.draf.id,
            drafAiIdDisetujui: verified.draf.id,
            ta: f.ta,
            pd: f.pd,
          };
        }
      );

      // menunggu -> throws (AI content NOT usable until verified).
      await expect(
        withTenant(db, SEED_A, (tx) =>
          buatDrafEraport(tx, {
            pesertaDidikId: pd.id,
            tahunAjaranId: ta.id,
            semester: "ganjil",
            konten: { sumber: "ai" },
            drafAiId: drafAiIdMenunggu,
            dibuatOleh: "user_er_ac4",
          })
        )
      ).rejects.toThrow(/belum diverifikasi/i);

      // disetujui -> ok (the link is accepted).
      const ok = await withTenant(db, SEED_A, (tx) =>
        buatDrafEraport(tx, {
          pesertaDidikId: pd.id,
          tahunAjaranId: ta.id,
          semester: "genap",
          konten: { sumber: "ai" },
          drafAiId: drafAiIdDisetujui,
          dibuatOleh: "user_er_ac4",
        })
      );
      expect(ok.drafAiId).toBe(drafAiIdDisetujui);
      expect(ok.status).toBe("draf");
    });

    // 3. UNIQUE per (tenant, peserta_didik, tahun_ajaran, semester): a second
    //    draf for the same triple is rejected (one report per student per
    //    period). A different semester for the same student succeeds.
    itOrSkip("rejects a second draf_eraport for the same (pd, ta, semester) UNIQUE", async () => {
      const { pdId, taId } = await withTenant(db, SEED_A, async (tx) => {
        const f = await seedFixture(tx, "uniq");
        await buatDrafEraport(tx, {
          pesertaDidikId: f.pd.id,
          tahunAjaranId: f.ta.id,
          semester: "ganjil",
          konten: {},
          dibuatOleh: "user_er_uniq",
        });
        return { pdId: f.pd.id, taId: f.ta.id };
      });

      // Same triple -> rejected (UNIQUE).
      await expectConstraintViolation(
        withTenant(db, SEED_A, (tx) =>
          buatDrafEraport(tx, {
            pesertaDidikId: pdId,
            tahunAjaranId: taId,
            semester: "ganjil",
            konten: {},
            dibuatOleh: "user_er_uniq_dup",
          })
        )
      );

      // Different semester -> ok.
      const other = await withTenant(db, SEED_A, (tx) =>
        buatDrafEraport(tx, {
          pesertaDidikId: pdId,
          tahunAjaranId: taId,
          semester: "genap",
          konten: {},
          dibuatOleh: "user_er_uniq_genap",
        })
      );
      expect(other.semester).toBe("genap");
    });

    // 4. AC#2 terbit: draf -> terbit stamps diterbitkanPada. Idempotent
    //    refusal: a second terbit THROWS (no silent re-stamp).
    itOrSkip("terbitkanEraport draf->terbit stamps diterbitkanPada; second terbit throws (AC#2)", async () => {
      const { eraportId } = await withTenant(db, SEED_A, async (tx) => {
        const f = await seedFixture(tx, "terbit");
        const e = await buatDrafEraport(tx, {
          pesertaDidikId: f.pd.id,
          tahunAjaranId: f.ta.id,
          semester: "ganjil",
          konten: { nilaiAkhir: 90 },
          dibuatOleh: "user_er_terbit",
        });
        return { eraportId: e.id };
      });

      // draf -> terbit.
      const terbit = await withTenant(db, SEED_A, (tx) =>
        terbitkanEraport(tx, eraportId)
      );
      expect(terbit.status).toBe("terbit");
      expect(terbit.diterbitkanPada).not.toBeNull();

      // Second terbit -> throws (idempotent refusal, AC#2).
      await expect(
        withTenant(db, SEED_A, (tx) => terbitkanEraport(tx, eraportId))
      ).rejects.toThrow(/sudah diterbitkan/i);

      // Final state observable via get.
      const after = await withTenant(db, SEED_A, (tx) =>
        getDrafEraportById(tx, eraportId)
      );
      expect(after!.status).toBe("terbit");
    });

    // 5. terbitkanEraport on a missing id -> throws (not found).
    itOrSkip("terbitkanEraport throws on missing id", async () => {
      await expect(
        withTenant(db, SEED_A, (tx) =>
          terbitkanEraport(tx, "00000000-0000-0000-0000-000000000000")
        )
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    // 6. AC#3 revisi: catatRevisi atomically appends a revisi_eraport row AND
    //    flips the parent status to 'revisi'. listRevisiByEraport returns the
    //    history newest-first. Append-only: multiple revisis accumulate.
    itOrSkip("catatRevisi appends revisi + flips status to 'revisi' atomically (AC#3)", async () => {
      const { eraportId } = await withTenant(db, SEED_A, async (tx) => {
        const f = await seedFixture(tx, "revisi");
        const e = await buatDrafEraport(tx, {
          pesertaDidikId: f.pd.id,
          tahunAjaranId: f.ta.id,
          semester: "ganjil",
          konten: { nilaiAkhir: 80 },
          dibuatOleh: "user_er_revisi",
        });
        return { eraportId: e.id };
      });

      // First revisi.
      const r1 = await withTenant(db, SEED_A, (tx) =>
        catatRevisi(tx, eraportId, {
          alasan: "Nilai tidak sesuai",
          kontenPerubahan: { nilaiAkhir: 85 },
          dibuatOleh: "user_er_rev1",
        })
      );
      expect(r1.eraportId).toBe(eraportId);
      expect(r1.alasan).toBe("Nilai tidak sesuai");
      expect(r1.kontenPerubahan).toEqual({ nilaiAkhir: 85 });

      // Parent status flipped to 'revisi'.
      const after1 = await withTenant(db, SEED_A, (tx) =>
        getDrafEraportById(tx, eraportId)
      );
      expect(after1!.status).toBe("revisi");

      // Second revisi (append-only: prior row preserved).
      await withTenant(db, SEED_A, (tx) =>
        catatRevisi(tx, eraportId, {
          alasan: "Tambah catatan",
          dibuatOleh: "user_er_rev2",
        })
      );

      const history = await withTenant(db, SEED_A, (tx) =>
        listRevisiByEraport(tx, eraportId)
      );
      expect(history.length).toBe(2);
      // newest-first ordering.
      expect(history[0].alasan).toBe("Tambah catatan");
      expect(history[1].alasan).toBe("Nilai tidak sesuai");
    });

    // 7. catatRevisi on a missing id -> throws (parent not found).
    itOrSkip("catatRevisi throws on missing eraport id", async () => {
      await expect(
        withTenant(db, SEED_A, (tx) =>
          catatRevisi(tx, "00000000-0000-0000-0000-000000000000", {
            alasan: "x",
          })
        )
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    // 8. §13 RLS isolation: SEED_B cannot see SEED_A's draf_eraport by id, and
    //    cannot terbit/catatRevisi on it (RLS gates both reads and writes).
    itOrSkip("draf_eraport is tenant-isolated: SEED_B cannot see/mutate SEED_A's eraport (RLS)", async () => {
      const { eraportId } = await withTenant(db, SEED_A, async (tx) => {
        const f = await seedFixture(tx, "rls");
        const e = await buatDrafEraport(tx, {
          pesertaDidikId: f.pd.id,
          tahunAjaranId: f.ta.id,
          semester: "ganjil",
          konten: {},
          dibuatOleh: "user_er_rls",
        });
        return { eraportId: e.id };
      });

      // SEED_A can see its own eraport.
      const aFound = await withTenant(db, SEED_A, (tx) =>
        getDrafEraportById(tx, eraportId)
      );
      expect(aFound).not.toBeNull();

      // SEED_B cannot see SEED_A's eraport (RLS hides it).
      const bFound = await withTenant(db, SEED_B, (tx) =>
        getDrafEraportById(tx, eraportId)
      );
      expect(bFound).toBeNull();

      // RLS also gates writes: terbit from SEED_B throws (not found under B).
      await expect(
        withTenant(db, SEED_B, (tx) => terbitkanEraport(tx, eraportId))
      ).rejects.toThrow(/tidak ditemukan/i);

      // RLS gates revisi writes too.
      await expect(
        withTenant(db, SEED_B, (tx) =>
          catatRevisi(tx, eraportId, { alasan: "attack" })
        )
      ).rejects.toThrow(/tidak ditemukan/i);

      // SEED_A's eraport is still 'draf' after the rejected B writes.
      const aAfter = await withTenant(db, SEED_A, (tx) =>
        getDrafEraportById(tx, eraportId)
      );
      expect(aAfter!.status).toBe("draf");
    });

    // 9. listDrafEraport: tenant-scoped, newest-first, optional filters.
    itOrSkip("listDrafEraport returns tenant rows newest-first; filters apply", async () => {
      const { pdId, taId } = await withTenant(db, SEED_A, async (tx) => {
        const f = await seedFixture(tx, "list");
        return { pdId: f.pd.id, taId: f.ta.id };
      });

      await withTenant(db, SEED_A, async (tx) => {
        await buatDrafEraport(tx, {
          pesertaDidikId: pdId,
          tahunAjaranId: taId,
          semester: "ganjil",
          konten: { i: 1 },
          dibuatOleh: "u1",
        });
        await buatDrafEraport(tx, {
          pesertaDidikId: pdId,
          tahunAjaranId: taId,
          semester: "genap",
          konten: { i: 2 },
          dibuatOleh: "u2",
        });
      });

      // All under SEED_A for this student.
      const all = await withTenant(db, SEED_A, (tx) =>
        listDrafEraport(tx, { pesertaDidikId: pdId })
      );
      expect(all.length).toBeGreaterThanOrEqual(2);

      // Filter by semester narrows the result.
      const ganjilOnly = await withTenant(db, SEED_A, (tx) =>
        listDrafEraport(tx, { pesertaDidikId: pdId, semester: "ganjil" })
      );
      expect(ganjilOnly.every((e) => e.semester === "ganjil")).toBe(true);

      // SEED_B sees none of SEED_A's rows.
      const bView = await withTenant(db, SEED_B, (tx) =>
        listDrafEraport(tx, { pesertaDidikId: pdId })
      );
      expect(bView).toEqual([]);
    });

    // 10. FK CASCADE: deleting peserta_didik removes its draf_eraport (and the
    //     cascade continues to revisi_eraport). Verified through the repo.
    itOrSkip("cascades peserta_didik -> draf_eraport -> revisi_eraport (FK CASCADE)", async () => {
      const { eraportId, pdId } = await withTenant(db, SEED_A, async (tx) => {
        const f = await seedFixture(tx, "casc");
        const e = await buatDrafEraport(tx, {
          pesertaDidikId: f.pd.id,
          tahunAjaranId: f.ta.id,
          semester: "ganjil",
          konten: {},
          dibuatOleh: "u_casc",
        });
        await catatRevisi(tx, e.id, { alasan: "casc-test" });
        return { eraportId: e.id, pdId: f.pd.id };
      });

      // Sanity: eraport + revisi exist.
      const before = await withTenant(db, SEED_A, (tx) =>
        getDrafEraportById(tx, eraportId)
      );
      expect(before).not.toBeNull();
      const revBefore = await withTenant(db, SEED_A, (tx) =>
        listRevisiByEraport(tx, eraportId)
      );
      expect(revBefore.length).toBe(1);

      await withTenant(db, SEED_A, async (tx) => {
        await tx
          .delete(schema.pesertaDidik)
          .where(eq(schema.pesertaDidik.id, pdId));
      });

      // After cascade: eraport gone.
      const after = await withTenant(db, SEED_A, (tx) =>
        getDrafEraportById(tx, eraportId)
      );
      expect(after).toBeNull();
      // Revisi gone too (cascade reached the leaf).
      const revAfter = await withTenant(db, SEED_A, (tx) =>
        listRevisiByEraport(tx, eraportId)
      );
      expect(revAfter).toEqual([]);
    });
  }
);
