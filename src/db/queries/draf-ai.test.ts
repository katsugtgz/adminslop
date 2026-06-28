import path from "node:path";

import pg, { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  buatDrafAi,
  cariDrafAiByPermintaan,
  verifikasiDrafAi,
} from "./draf-ai";
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

// Tenant seeds — PRIVATE to this file (org_DA_*). Distinct per draf-ai repo
// test file so parallel vitest runs cannot delete each other's seed rows: all
// beforeAll DELETEs are scoped to these tenant IDs only.
const SEED_A = "org_DA_a";
const SEED_B = "org_DA_b";

/**
 * Assert that `promise` rejects with a Postgres integrity-constraint violation
 * (SQLSTATE 23xxx — covers UNIQUE 23505, etc.). Drizzle wraps the raw `pg`
 * error as a `DrizzleQueryError` with the original on `.cause`, so we walk the
 * cause chain. No `as any`; a non-pg error is rethrown so a genuine failure is
 * not masked as a false pass.
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

let db: Db;

describeOrSkip(
  "draf-ai repository (queries/draf-ai.ts — #12 Wave 2 / T4)",
  () => {
    beforeAll(async () => {
      // 1. Migrate as superuser (creates tables, RLS policies, grants).
      await runMigrations(
        MIG_URL!,
        path.join(process.cwd(), "src/db/migrations")
      );

      // 2. Seed tenant registry (UPSERT — survives concurrent runs) and clear
      //    the AI layer in FK-safe order so each run starts clean. Children
      //    first: draf_ai references permintaan_ai. Scoped to this file's
      //    tenants only.
      const seed = new pg.Pool({ connectionString: MIG_URL });
      await seed.query(`
        insert into satuan_pendidikan (id, nama) values
          ('org_DA_a', 'Satuan Pendidikan DA A'),
          ('org_DA_b', 'Satuan Pendidikan DA B')
        on conflict (id) do update set nama = excluded.nama;
      `);
      await seed.query(`
        delete from draf_ai       where tenant_id in ('org_DA_a', 'org_DA_b');
        delete from permintaan_ai where tenant_id in ('org_DA_a', 'org_DA_b');
      `);
      await seed.end();

      // 3. App client uses the non-superuser role — RLS enforced.
      db = createDb(APP_URL!).db;
    });

    afterAll(async () => {
      await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
    });

    /**
     * Seed a permintaan + its 1:1 draf under the current tenant. Returns both
     * rows so tests can assert on either side of the link. `tag` keeps
     * konten/provenance distinct across cases for easy identification.
     */
    async function seedPermintaanDanDraf(
      tx: Tx,
      tag: string,
      opts?: { readonly konten?: string; readonly provenance?: string }
    ) {
      const permintaan = await buatPermintaanAi(tx, {
        jenis: "deskripsi_cp",
        konteks: { tag },
        dibuatOleh: `user_da_${tag}`,
      });
      const draf = await buatDrafAi(tx, {
        permintaanAiId: permintaan.id,
        konten: opts?.konten ?? `konten ${tag}`,
        provenance:
          opts?.provenance ??
          `model=test;prompt_hash=${tag};ts=2026-01-01T00:00:00Z`,
      });
      return { permintaan, draf };
    }

    // 1. AC#2/AC#3 happy path: a new draf starts at statusVerifikasi='menunggu'
    //    (NOT final by default). cariDrafAiByPermintaan reads it back (1:1
    //    lookup). provenance (AC#2) round-trips verbatim.
    itOrSkip("buatDrafAi creates a 'menunggu' row; cariDrafAiByPermintaan reads it back", async () => {
      const { draf, permintaan } = await withTenant(db, SEED_A, async (tx) =>
        seedPermintaanDanDraf(tx, "crud", {
          konten: "Tujuan pembelajaran: ...",
          provenance: "model=gpt-4o;prompt_hash=abc123;ts=2026-01-01T00:00:00Z",
        })
      );

      // Insert returned the full row with defaults applied.
      expect(draf.tenantId).toBe(SEED_A);
      expect(draf.permintaanAiId).toBe(permintaan.id);
      expect(draf.konten).toBe("Tujuan pembelajaran: ...");
      expect(draf.provenance).toBe(
        "model=gpt-4o;prompt_hash=abc123;ts=2026-01-01T00:00:00Z"
      );
      expect(draf.statusVerifikasi).toBe("menunggu");
      expect(draf.diverifikasiOleh).toBeNull();
      expect(draf.diverifikasiPada).toBeNull();
      expect(draf.dibuatPada).toBeTruthy();

      // 1:1 lookup by permintaan id.
      const found = await withTenant(db, SEED_A, (tx) =>
        cariDrafAiByPermintaan(tx, permintaan.id)
      );
      expect(found).not.toBeNull();
      expect(found!.id).toBe(draf.id);
      expect(found!.permintaanAiId).toBe(permintaan.id);

      // Unknown permintaan id -> null (no throw).
      const missing = await withTenant(db, SEED_A, (tx) =>
        cariDrafAiByPermintaan(tx, "00000000-0000-0000-0000-000000000000")
      );
      expect(missing).toBeNull();
    });

    // 2. AC#3 verification gate happy paths: menunggu -> disetujui AND
    //    menunggu -> ditolak. Each stamps diverifikasiPada + records approver.
    itOrSkip("verifikasiDrafAi menunggu -> disetujui / ditolak stamps diverifikasiPada + approver", async () => {
      const { disetujui, ditolak } = await withTenant(db, SEED_A, async (tx) => {
        const a = await seedPermintaanDanDraf(tx, "approve");
        const approved = await verifikasiDrafAi(tx, a.draf.id, "disetujui", "user_approver_a");
        expect(approved.id).toBe(a.draf.id);
        expect(approved.statusVerifikasi).toBe("disetujui");
        expect(approved.diverifikasiOleh).toBe("user_approver_a");
        expect(approved.diverifikasiPada).not.toBeNull();

        const b = await seedPermintaanDanDraf(tx, "reject");
        const rejected = await verifikasiDrafAi(tx, b.draf.id, "ditolak", "user_approver_b");
        expect(rejected.statusVerifikasi).toBe("ditolak");
        expect(rejected.diverifikasiOleh).toBe("user_approver_b");
        expect(rejected.diverifikasiPada).not.toBeNull();

        return { disetujui: approved, ditolak: rejected };
      });

      // Final state observable via cari.
      const aFinal = await withTenant(db, SEED_A, (tx) =>
        cariDrafAiByPermintaan(tx, disetujui.permintaanAiId)
      );
      expect(aFinal!.statusVerifikasi).toBe("disetujui");
      expect(aFinal!.diverifikasiOleh).toBe("user_approver_a");

      const bFinal = await withTenant(db, SEED_A, (tx) =>
        cariDrafAiByPermintaan(tx, ditolak.permintaanAiId)
      );
      expect(bFinal!.statusVerifikasi).toBe("ditolak");
    });

    // 3. AC#3 idempotency: a second verifikasiDrafAi on an already-verified
    //    row throws (cannot re-verify). Applies from either terminal state.
    itOrSkip("verifikasiDrafAi is idempotent: re-verify on disetujui/ditolak throws", async () => {
      const { approveId, rejectId } = await withTenant(db, SEED_A, async (tx) => {
        const a = await seedPermintaanDanDraf(tx, "re-approve");
        await verifikasiDrafAi(tx, a.draf.id, "disetujui", "user_once_a");

        const b = await seedPermintaanDanDraf(tx, "re-reject");
        await verifikasiDrafAi(tx, b.draf.id, "ditolak", "user_once_b");
        return { approveId: a.draf.id, rejectId: b.draf.id };
      });

      // Re-verify disetujui -> ditolak throws (cannot change verdict).
      await expect(
        withTenant(db, SEED_A, (tx) =>
          verifikasiDrafAi(tx, approveId, "ditolak", "user_once_a")
        )
      ).rejects.toThrow(/sudah diverifikasi/);

      // Re-verify ditolak -> disetujui throws (cannot change verdict).
      await expect(
        withTenant(db, SEED_A, (tx) =>
          verifikasiDrafAi(tx, rejectId, "disetujui", "user_once_b")
        )
      ).rejects.toThrow(/sudah diverifikasi/);

      // Same-status re-verify also throws (the row already left 'menunggu').
      await expect(
        withTenant(db, SEED_A, (tx) =>
          verifikasiDrafAi(tx, approveId, "disetujui", "user_once_a")
        )
      ).rejects.toThrow(/sudah diverifikasi/);
    });

    // 4. verifikasiDrafAi on a missing id -> throws (not 'menunggu' nor found).
    itOrSkip("verifikasiDrafAi throws on missing id", async () => {
      await expect(
        withTenant(db, SEED_A, (tx) =>
          verifikasiDrafAi(
            tx,
            "00000000-0000-0000-0000-000000000000",
            "disetujui",
            "user_missing"
          )
        )
      ).rejects.toThrow(/tidak ditemukan/);
    });

    // 5. 1:1 UNIQUE on permintaanAiId: a second buatDrafAi for the SAME
    //    permintaan is rejected by the schema constraint (idempotent insert).
    //    A draf for a DIFFERENT permintaan succeeds.
    itOrSkip("rejects a second buatDrafAi for the same permintaan (1:1 UNIQUE)", async () => {
      const { permintaanId, otherPermintaanId } = await withTenant(
        db,
        SEED_A,
        async (tx) => {
          const { permintaan: p1 } = await seedPermintaanDanDraf(tx, "uniq-1");
          const p2 = await buatPermintaanAi(tx, {
            jenis: "deskripsi_tp",
            konteks: { tag: "uniq-2" },
            dibuatOleh: "user_da_uniq_2",
          });
          return { permintaanId: p1.id, otherPermintaanId: p2.id };
        }
      );

      // Second draf for the SAME permintaan -> rejected (UNIQUE).
      await expectConstraintViolation(
        withTenant(db, SEED_A, (tx) =>
          buatDrafAi(tx, {
            permintaanAiId: permintaanId,
            konten: "second draft",
            provenance: "model=test;prompt_hash=dup;ts=t",
          })
        )
      );

      // A draf for a DIFFERENT permintaan -> ok.
      const other = await withTenant(db, SEED_A, (tx) =>
        buatDrafAi(tx, {
          permintaanAiId: otherPermintaanId,
          konten: "draft for other",
          provenance: "model=test;prompt_hash=other;ts=t",
        })
      );
      expect(other.permintaanAiId).toBe(otherPermintaanId);
      expect(other.statusVerifikasi).toBe("menunggu");
    });

    // 6. §13 RLS isolation: SEED_B cannot see SEED_A's draf by permintaan id
    //    and cannot verify it (RLS gates both reads and writes). SEED_B's view
    //    of SEED_A's permintaan is empty.
    itOrSkip("draf_ai is tenant-isolated: SEED_B cannot see/verify SEED_A's draf (RLS)", async () => {
      const { drafId, permintaanId } = await withTenant(db, SEED_A, async (tx) => {
        const { permintaan, draf } = await seedPermintaanDanDraf(tx, "rls");
        return { drafId: draf.id, permintaanId: permintaan.id };
      });

      // SEED_A can see its own draf via 1:1 lookup.
      const aFound = await withTenant(db, SEED_A, (tx) =>
        cariDrafAiByPermintaan(tx, permintaanId)
      );
      expect(aFound).not.toBeNull();
      expect(aFound!.id).toBe(drafId);

      // SEED_B cannot see SEED_A's draf by the same permintaan id (RLS hides
      // both the permintaan and the draf).
      const bFound = await withTenant(db, SEED_B, (tx) =>
        cariDrafAiByPermintaan(tx, permintaanId)
      );
      expect(bFound).toBeNull();

      // RLS also gates writes: a verify from SEED_B throws (row not found
      // under B's tenant scope — no silent cross-tenant mutation).
      await expect(
        withTenant(db, SEED_B, (tx) =>
          verifikasiDrafAi(tx, drafId, "disetujui", "user_b_attacker")
        )
      ).rejects.toThrow(/tidak ditemukan/);

      // SEED_A's draf is still 'menunggu' after the rejected B verify.
      const aAfter = await withTenant(db, SEED_A, (tx) =>
        cariDrafAiByPermintaan(tx, permintaanId)
      );
      expect(aAfter!.statusVerifikasi).toBe("menunggu");
      expect(aAfter!.diverifikasiOleh).toBeNull();
    });

    // 7. FK CASCADE: deleting permintaan_ai removes its 1:1 draf_ai. Verified
    //    through the repo (cariDrafAiByPermintaan) so the cascade is observed
    //    at the data-access layer.
    itOrSkip("cascades permintaan_ai -> draf_ai (FK CASCADE)", async () => {
      const { permintaanId } = await withTenant(db, SEED_A, async (tx) => {
        const { permintaan } = await seedPermintaanDanDraf(tx, "casc");
        return { permintaanId: permintaan.id };
      });

      // Sanity: draf exists before the delete.
      const before = await withTenant(db, SEED_A, (tx) =>
        cariDrafAiByPermintaan(tx, permintaanId)
      );
      expect(before).not.toBeNull();

      await withTenant(db, SEED_A, async (tx) => {
        await tx
          .delete(schema.permintaanAi)
          .where(eq(schema.permintaanAi.id, permintaanId));
      });

      // After cascade: draf gone.
      const after = await withTenant(db, SEED_A, (tx) =>
        cariDrafAiByPermintaan(tx, permintaanId)
      );
      expect(after).toBeNull();
    });
  }
);
