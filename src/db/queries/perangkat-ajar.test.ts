import path from "node:path";

import pg, { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";
import { buatPermintaanAi } from "./permintaan-ai";
import { buatDrafAi } from "./draf-ai";

import {
  buatPerangkatAjar,
  cariPerangkatAjarById,
  listByJenis,
  listPerangkatAjar,
  ubahPerangkatAjar,
  verifikasiDokumenAi,
} from "./perangkat-ajar";

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

// Tenant seeds — PRIVATE to this file (org_PA_*). Distinct per perangkat-ajar
// test file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_PA_a";
const SEED_B = "org_PA_b";

/**
 * Assert that `promise` rejects with a Postgres integrity-constraint violation
 * (SQLSTATE 23xxx — covers CHECK 23514, UNIQUE 23505, FOREIGN KEY 23503).
 * Drizzle wraps the raw `pg` error as a `DrizzleQueryError` with the original
 * on `.cause`, so we walk the cause chain. No `as any`; a non-pg error is
 * rethrown so a genuine failure is not masked as a false pass.
 */
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

// Monotonic counter for unique literals (GLOBAL mata_pelajaran nama/kode +
// tenant-scoped UNIQUE tahun_ajaran nama).
let _seq = 0;
const seq = (): number => ++_seq;

describeOrSkip(
  "perangkat ajar repository (queries/perangkat-ajar.ts — #17)",
  () => {
    // Insert/DELETE on GLOBAL mata_pelajaran run as the migrator superuser
    // (app_user has SELECT only — ADR 0001). Tenant-scoped writes use the app
    // client (`db`) inside `withTenant` so RLS is enforced.
    let migDb: Db;
    let db: Db;

    // Shared FK parents in SEED_A (seeded in beforeAll; reused across cases).
    let mpId: string;
    let taAId: string;
    let _taBId: string;
    let _tingkatAId: string;

    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT) and clear the perangkat-ajar layer +
      //    its tenant-scoped FK parents in FK-safe order (children first) so
      //    each run starts clean. Scoped to this file's tenants only. The
      //    GLOBAL mata_pelajaran clear is scoped to this file's kode prefix
      //    (PA-MP-*) and runs AFTER perangkat_ajar so ON DELETE RESTRICT FK
      //    cannot fire. Superuser bypasses RLS.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_PA_a', 'Satuan Pendidikan PA A'),
          ('org_PA_b', 'Satuan Pendidikan PA B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from perangkat_ajar  where tenant_id in ('org_PA_a', 'org_PA_b');
        delete from draf_ai         where tenant_id in ('org_PA_a', 'org_PA_b');
        delete from permintaan_ai   where tenant_id in ('org_PA_a', 'org_PA_b');
        delete from tingkat         where tenant_id in ('org_PA_a', 'org_PA_b');
        delete from tahun_ajaran    where tenant_id in ('org_PA_a', 'org_PA_b');
      `);
      await seed.query(`delete from mata_pelajaran where kode like 'PA-MP-%';`);
      await seed.end();

      // 3. Clients: migrator (GLOBAL mata_pelajaran writes) + app_user (RLS).
      migDb = createDb(MIG_URL!).db;
      db = createDb(APP_URL!).db;

      // 4. Seed a shared GLOBAL mata_pelajaran (RESTRICT parent).
      const [mp] = await migDb
        .insert(schema.mataPelajaran)
        .values({ kode: `PA-MP-${seq()}`, nama: `Perangkat Ajar Mapel` })
        .returning();
      mpId = mp.id;

      // 5. Seed shared tenant-scoped FK parents: tahun_ajaran in each tenant +
      //    a tingkat in SEED_A (RLS-aware via app role).
      taAId = await withTenant(db, SEED_A, async (tx) => {
        const [ta] = await tx
          .insert(schema.tahunAjaran)
          .values({ nama: `TA PA A ${seq()}`, aktif: false })
          .returning();
        const [tk] = await tx
          .insert(schema.tingkat)
          .values({ nama: `Tingkat PA ${seq()}`, urutan: seq() })
          .returning();
        _tingkatAId = tk.id;
        return ta.id;
      });
      _taBId = await withTenant(db, SEED_B, async (tx) => {
        const [ta] = await tx
          .insert(schema.tahunAjaran)
          .values({ nama: `TA PA B ${seq()}`, aktif: false })
          .returning();
        return ta.id;
      });
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    /** Seed a GLOBAL mata_pelajaran with a unique nama (for RESTRICT test). */
    async function seedMataPelajaran(tag: string) {
      const [mp] = await migDb
        .insert(schema.mataPelajaran)
        .values({ kode: `PA-MP-${seq()}`, nama: `PA Mapel ${tag}` })
        .returning();
      return mp;
    }

    /** Seed a permintaan_ai + its 1:1 draf_ai under the current tenant. */
    async function seedDrafAi(tx: Tx, tag: string) {
      const permintaan = await buatPermintaanAi(tx, {
        jenis: "deskripsi_cp",
        konteks: { tag },
        dibuatOleh: `user_pa_${tag}`,
      });
      const draf = await buatDrafAi(tx, {
        permintaanAiId: permintaan.id,
        konten: `konten AI ${tag}`,
        provenance: `model=test;prompt_hash=${tag};ts=t`,
      });
      return { permintaan, draf };
    }

    /** Build a default non-AI input (caller may override fields). */
    const baseInput = (over: Partial<Parameters<typeof buatPerangkatAjar>[1]>) =>
      ({
        jenis: "modul_ajar",
        mataPelajaranId: mpId,
        tahunAjaranId: taAId,
        semester: "ganjil",
        judul: `Modul Ajar ${seq()}`,
        konten: { tujuan: "contoh" },
        dibuatOleh: "user_pa_test",
        ...over,
      }) as Parameters<typeof buatPerangkatAjar>[1];

    // 1. CRUD happy path (non-AI): insert -> read back every field including
    //    defaults. statusDokumenAi is NULL (not AI-assisted — already resmi).
    itOrSkip("buatPerangkatAjar (non-AI) round-trips every field; statusDokumenAi NULL", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatPerangkatAjar(tx, baseInput({ judul: "Modul Ajar CRUD" }))
      );

      expect(created.id).toBeTruthy();
      expect(created.tenantId).toBe(SEED_A);
      expect(created.jenis).toBe("modul_ajar");
      expect(created.mataPelajaranId).toBe(mpId);
      expect(created.tahunAjaranId).toBe(taAId);
      expect(created.semester).toBe("ganjil");
      expect(created.judul).toBe("Modul Ajar CRUD");
      expect(created.konten).toEqual({ tujuan: "contoh" });
      expect(created.drafAiId).toBeNull();
      expect(created.statusDokumenAi).toBeNull(); // not AI-assisted
      expect(created.dibuatOleh).toBe("user_pa_test");
      expect(created.dibuatPada).toBeTruthy();

      // cari reads it back; unknown id -> null (no throw).
      const found = await withTenant(db, SEED_A, (tx) =>
        cariPerangkatAjarById(tx, created.id)
      );
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      const missing = await withTenant(db, SEED_A, (tx) =>
        cariPerangkatAjarById(tx, "00000000-0000-0000-0000-000000000000")
      );
      expect(missing).toBeNull();
    });

    // 2. AC#3: buatPerangkatAjar with drafAiId -> statusDokumenAi='menunggu'
    //    (AI-assisted — NOT resmi until verified). The draf link round-trips.
    itOrSkip("AC#3: buatPerangkatAjar with drafAiId -> statusDokumenAi='menunggu'", async () => {
      const { draf } = await withTenant(db, SEED_A, (tx) => seedDrafAi(tx, "ai"));
      const created = await withTenant(db, SEED_A, (tx) =>
        buatPerangkatAjar(
          tx,
          baseInput({ judul: "Modul AI", drafAiId: draf.id })
        )
      );
      expect(created.drafAiId).toBe(draf.id);
      expect(created.statusDokumenAi).toBe("menunggu");
    });

    // 3. jenis CHECK: invalid jenis -> rejected. status_dokumen_ai CHECK:
    //    invalid value -> rejected. semester CHECK: invalid -> rejected;
    //    NULL semester is allowed.
    itOrSkip("rejects invalid jenis, status_dokumen_ai, semester (CHECK); allows NULL semester", async () => {
      // invalid jenis
      await expectConstraintViolation(
        withTenant(db, SEED_A, (tx) =>
          tx
            .insert(schema.perangkatAjar)
            .values({
              jenis: "tidak_ada",
              mataPelajaranId: mpId,
              tahunAjaranId: taAId,
              judul: "x",
            })
            .returning()
        )
      );
      // invalid status_dokumen_ai
      await expectConstraintViolation(
        withTenant(db, SEED_A, (tx) =>
          tx
            .insert(schema.perangkatAjar)
            .values({
              jenis: "rpp",
              mataPelajaranId: mpId,
              tahunAjaranId: taAId,
              judul: "x",
              statusDokumenAi: "aneh",
            })
            .returning()
        )
      );
      // invalid semester
      await expectConstraintViolation(
        withTenant(db, SEED_A, (tx) =>
          tx
            .insert(schema.perangkatAjar)
            .values({
              jenis: "silabus",
              mataPelajaranId: mpId,
              tahunAjaranId: taAId,
              semester: "q3",
              judul: "x",
            })
            .returning()
        )
      );
      // NULL semester is allowed (semester optional)
      const [nullSem] = await withTenant(db, SEED_A, (tx) =>
        tx
          .insert(schema.perangkatAjar)
          .values({
            jenis: "silabus",
            mataPelajaranId: mpId,
            tahunAjaranId: taAId,
            judul: "Silabus no-semester",
          })
          .returning()
      );
      expect(nullSem.semester).toBeNull();
    });

    // 4. ubahPerangkatAjar: updates judul + konten; throws on missing id.
    itOrSkip("ubahPerangkatAjar updates judul/konten; throws on missing id", async () => {
      const created = await withTenant(db, SEED_A, (tx) =>
        buatPerangkatAjar(tx, baseInput({ judul: "RPP Lama" }))
      );
      const updated = await withTenant(db, SEED_A, (tx) =>
        ubahPerangkatAjar(tx, created.id, {
          judul: "RPP Baru",
          konten: { aktif: true },
        })
      );
      expect(updated.judul).toBe("RPP Baru");
      expect(updated.konten).toEqual({ aktif: true });
      expect(updated.jenis).toBe("modul_ajar"); // unchanged

      await expect(
        withTenant(db, SEED_A, (tx) =>
          ubahPerangkatAjar(tx, "00000000-0000-0000-0000-000000000000", {
            judul: "x",
          })
        )
      ).rejects.toThrow(/tidak ditemukan/);
    });

    // 5. AC#4: listByJenis returns ONLY the matching jenis; listPerangkatAjar
    //    filters by jenis. Types stay separate (not one monolithic format).
    itOrSkip("AC#4: listByJenis returns only matching jenis; listPerangkatAjar filters", async () => {
      await withTenant(db, SEED_A, async (tx) => {
        await buatPerangkatAjar(tx, baseInput({ jenis: "rpp", judul: "RPP A" }));
        await buatPerangkatAjar(
          tx,
          baseInput({ jenis: "silabus", judul: "Silabus A" })
        );
        await buatPerangkatAjar(
          tx,
          baseInput({ jenis: "rpp", judul: "RPP B" })
        );
      });

      const rppOnly = await withTenant(db, SEED_A, (tx) =>
        listByJenis(tx, "rpp")
      );
      expect(rppOnly.length).toBeGreaterThanOrEqual(2);
      expect(semuaBerjenis(rppOnly, "rpp")).toBe(true);

      const silabusOnly = await withTenant(db, SEED_A, (tx) =>
        listByJenis(tx, "silabus")
      );
      expect(silabusOnly.every((p) => p.jenis === "silabus")).toBe(true);

      const filtered = await withTenant(db, SEED_A, (tx) =>
        listPerangkatAjar(tx, { jenis: "rpp" })
      );
      expect(filtered.every((p) => p.jenis === "rpp")).toBe(true);
    });

    // 6. AC#3 verification gate: menunggu -> disetujui / ditolak. Idempotent:
    //    a second verdict throws. A NULL-status (non-AI) doc throws (nothing to
    //    verify). A missing id throws.
    itOrSkip("AC#3: verifikasiDokumenAi menunggu->disetujui/ditolak; idempotent; NULL/missing throw", async () => {
      const { aiId, plainId } = await withTenant(db, SEED_A, async (tx) => {
        const { draf } = await seedDrafAi(tx, "verif");
        const ai = await buatPerangkatAjar(
          tx,
          baseInput({ judul: "Modul verif", drafAiId: draf.id })
        );
        const plain = await buatPerangkatAjar(
          tx,
          baseInput({ judul: "Modul plain" })
        );
        return { aiId: ai.id, plainId: plain.id };
      });

      // menunggu -> disetujui
      const approved = await withTenant(db, SEED_A, (tx) =>
        verifikasiDokumenAi(tx, aiId, "disetujui")
      );
      expect(approved.statusDokumenAi).toBe("disetujui");

      // re-verify throws (idempotent)
      await expect(
        withTenant(db, SEED_A, (tx) =>
          verifikasiDokumenAi(tx, aiId, "ditolak")
        )
      ).rejects.toThrow(/sudah diverifikasi/);

      // a second AI doc -> ditolak
      const { draf: draf2 } = await withTenant(db, SEED_A, (tx) =>
        seedDrafAi(tx, "verif2")
      );
      const ai2 = await withTenant(db, SEED_A, (tx) =>
        buatPerangkatAjar(tx, baseInput({ judul: "Modul verif2", drafAiId: draf2.id }))
      );
      const rejected = await withTenant(db, SEED_A, (tx) =>
        verifikasiDokumenAi(tx, ai2.id, "ditolak")
      );
      expect(rejected.statusDokumenAi).toBe("ditolak");

      // NULL-status (non-AI) doc -> throws (nothing to verify)
      await expect(
        withTenant(db, SEED_A, (tx) =>
          verifikasiDokumenAi(tx, plainId, "disetujui")
        )
      ).rejects.toThrow(/sudah diverifikasi/);

      // missing id -> throws
      await expect(
        withTenant(db, SEED_A, (tx) =>
          verifikasiDokumenAi(
            tx,
            "00000000-0000-0000-0000-000000000000",
            "disetujui"
          )
        )
      ).rejects.toThrow(/tidak ditemukan/);
    });

    // 7. RLS isolation: SEED_B cannot see SEED_A's perangkat_ajar by id, and
    //    listByJenis under SEED_B excludes SEED_A's rows. RLS gates reads.
    itOrSkip("perangkat_ajar is tenant-isolated: SEED_B cannot see SEED_A (RLS)", async () => {
      const aId = await withTenant(db, SEED_A, async (tx) => {
        const p = await buatPerangkatAjar(tx, baseInput({ judul: "RLS A" }));
        return p.id;
      });

      // SEED_A sees its own row
      const aFound = await withTenant(db, SEED_A, (tx) =>
        cariPerangkatAjarById(tx, aId)
      );
      expect(aFound).not.toBeNull();

      // SEED_B cannot see SEED_A's row by id
      const bFound = await withTenant(db, SEED_B, (tx) =>
        cariPerangkatAjarById(tx, aId)
      );
      expect(bFound).toBeNull();

      // SEED_B's listByJenis excludes SEED_A's rows
      const bList = await withTenant(db, SEED_B, (tx) =>
        listByJenis(tx, "modul_ajar")
      );
      expect(bList.every((p) => p.id !== aId)).toBe(true);
    });

    // 8. RLS gates writes: SEED_B cannot verify SEED_A's AI doc (row not found
    //    under B's tenant scope — no silent cross-tenant mutation).
    itOrSkip("RLS gates writes: SEED_B verify of SEED_A doc throws (not found)", async () => {
      const { draf } = await withTenant(db, SEED_A, (tx) => seedDrafAi(tx, "rls-w"));
      const ai = await withTenant(db, SEED_A, (tx) =>
        buatPerangkatAjar(tx, baseInput({ judul: "RLS write", drafAiId: draf.id }))
      );

      await expect(
        withTenant(db, SEED_B, (tx) =>
          verifikasiDokumenAi(tx, ai.id, "disetujui")
        )
      ).rejects.toThrow(/tidak ditemukan/);

      // SEED_A's doc is still 'menunggu' after the rejected B verify
      const after = await withTenant(db, SEED_A, (tx) =>
        cariPerangkatAjarById(tx, ai.id)
      );
      expect(after!.statusDokumenAi).toBe("menunggu");
    });

    // 9. FK behaviors: deleting tahun_ajaran CASCADE-removes its perangkat_ajar;
    //    deleting the linked draf_ai SET NULL on draf_ai_id (keeps the doc);
    //    deleting a referenced mata_pelajaran is RESTRICTed.
    itOrSkip("FK: tahun_ajaran CASCADE, draf_ai SET NULL, mata_pelajaran RESTRICT", async () => {
      // tahun_ajaran CASCADE: a doc tied to its own TA vanishes with the TA.
      const { docId, taId } = await withTenant(db, SEED_A, async (tx) => {
        const [ta] = await tx
          .insert(schema.tahunAjaran)
          .values({ nama: `TA cascade ${seq()}`, aktif: false })
          .returning();
        const doc = await buatPerangkatAjar(
          tx,
          baseInput({ judul: "Cascade TA", tahunAjaranId: ta.id })
        );
        return { docId: doc.id, taId: ta.id };
      });
      const before = await withTenant(db, SEED_A, (tx) =>
        cariPerangkatAjarById(tx, docId)
      );
      expect(before).not.toBeNull();
      await withTenant(db, SEED_A, async (tx) => {
        await tx.delete(schema.tahunAjaran).where(eq(schema.tahunAjaran.id, taId));
      });
      const after = await withTenant(db, SEED_A, (tx) =>
        cariPerangkatAjarById(tx, docId)
      );
      expect(after).toBeNull();

      // draf_ai SET NULL: deleting the linked draf keeps the doc, nulls the link.
      const { draf, doc } = await withTenant(db, SEED_A, async (tx) => {
        const d = await seedDrafAi(tx, "setnull");
        const p = await buatPerangkatAjar(
          tx,
          baseInput({ judul: "Set null", drafAiId: d.draf.id })
        );
        return { draf: d.draf, doc: p };
      });
      expect(doc.drafAiId).toBe(draf.id);
      await withTenant(db, SEED_A, async (tx) => {
        await tx.delete(schema.drafAi).where(eq(schema.drafAi.id, draf.id));
      });
      const docAfter = await withTenant(db, SEED_A, (tx) =>
        cariPerangkatAjarById(tx, doc.id)
      );
      expect(docAfter).not.toBeNull();
      expect(docAfter!.drafAiId).toBeNull();

      // mata_pelajaran RESTRICT: a referenced subject cannot be dropped.
      const restrictMp = await seedMataPelajaran("restrict");
      await withTenant(db, SEED_A, (tx) =>
        buatPerangkatAjar(
          tx,
          baseInput({ judul: "Restrict MP", mataPelajaranId: restrictMp.id })
        )
      );
      await expectConstraintViolation(
        migDb
          .delete(schema.mataPelajaran)
          .where(eq(schema.mataPelajaran.id, restrictMp.id))
      );
    });
  }
);

/** True iff every row in `rows` has `jenis === expected`. */
function semuaBerjenis(
  rows: readonly { jenis: string }[],
  expected: string
): boolean {
  return rows.every((r) => r.jenis === expected);
}
