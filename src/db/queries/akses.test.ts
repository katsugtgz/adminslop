import path from "node:path";

import pg from "pg";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";

import {
  aturIzin,
  aturPembatasan,
  buatPtk,
  cariPenggunaByUserId,
  hapusPtk,
  linkPtk,
  listPengguna,
  listPtk,
  loadAksesPengguna,
  upsertPengguna,
} from "./akses";

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

// Tenant seeds (shared registry with akses.test.ts / rls.test.ts; UPSERT so
// concurrent runs do not collide). No audit rows written here.
const SEED_A = "org_A";
const SEED_B = "org_B";

describeOrSkip("akses repository (queries/akses.ts — #6 Wave 2)", () => {
  let db: Db;

  beforeAll(async () => {
    // 1. Migrate as superuser (creates tables, RLS policies, grants).
    await runMigrations(MIG_URL!, path.join(process.cwd(), "src/db/migrations"));

    // 2. Seed tenant registry (UPSERT) and clear akses-layer rows in FK-safe
    //    order so each run starts clean (superuser bypasses RLS).
    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama) values
        ('org_A', 'Satuan Pendidikan A'),
        ('org_B', 'Satuan Pendidikan B')
      on conflict (id) do update set nama = excluded.nama;
    `);
    await seed.query(`
      delete from pembatasan_akses where tenant_id in ('org_A','org_B');
      delete from izin_akses where tenant_id in ('org_A','org_B');
      delete from pengguna where tenant_id in ('org_A','org_B');
      delete from ptk where tenant_id in ('org_A','org_B');
    `);
    await seed.end();

    // 3. App client uses the non-superuser role — RLS enforced.
    db = createDb(APP_URL!).db;
  });

  // 1. buatPtk then listPtk returns it with correct fields.
  itOrSkip("buatPtk creates a PTK visible via listPtk", async () => {
    const created = await withTenant(db, SEED_A, (tx) =>
      buatPtk(tx, {
        nama: "Budi Query",
        nip: "198001012005011001",
        jenis: "pendidik",
      })
    );

    expect(created.id).toBeTruthy();
    expect(created.tenantId).toBe(SEED_A);
    expect(created.nama).toBe("Budi Query");
    expect(created.nip).toBe("198001012005011001");
    expect(created.jenis).toBe("pendidik");
    expect(created.dibuatPada).toBeTruthy();

    const all = await withTenant(db, SEED_A, (tx) => listPtk(tx));
    const found = all.find((p) => p.id === created.id);
    expect(found).toBeDefined();
    expect(found?.nama).toBe("Budi Query");
    expect(found?.jenis).toBe("pendidik");
  });

  // 2. hapusPtk removes it; cross-tenant delete is a no-op (RLS).
  itOrSkip("hapusPtk removes own-tenant PTK; cross-tenant delete is a no-op", async () => {
    const aRow = await withTenant(db, SEED_A, (tx) =>
      buatPtk(tx, { nama: "PTK A Hapus", jenis: "pendidik" })
    );

    // Cross-tenant: tenant B tries to delete tenant A's PTK by id — RLS makes
    // it a silent no-op (zero rows affected), A still has it.
    await withTenant(db, SEED_B, (tx) => hapusPtk(tx, aRow.id));

    const aStillHas = await withTenant(db, SEED_A, (tx) =>
      listPtk(tx)
    );
    expect(aStillHas.find((p) => p.id === aRow.id)).toBeDefined();

    // Same-tenant delete removes it.
    await withTenant(db, SEED_A, (tx) => hapusPtk(tx, aRow.id));

    const aAfter = await withTenant(db, SEED_A, (tx) => listPtk(tx));
    expect(aAfter.find((p) => p.id === aRow.id)).toBeUndefined();
  });

  // 3. upsertPengguna inserts; second call updates peranAkses and preserves a
  //    pre-existing ptk link.
  itOrSkip("upsertPengguna inserts then updates peranAkses; preserves ptk link", async () => {
    const userId = "workos_repo_upsert";
    const linkedPtk = await withTenant(db, SEED_A, (tx) =>
      buatPtk(tx, { nama: "PTK Upsert Link", jenis: "pendidik" })
    );

    // First insert (unlinked).
    const inserted = await withTenant(db, SEED_A, (tx) =>
      upsertPengguna(tx, { userId, peranAkses: "guru", nama: "Siti" })
    );
    expect(inserted.userId).toBe(userId);
    expect(inserted.peranAkses).toBe("guru");
    expect(inserted.nama).toBe("Siti");
    expect(inserted.ptkId).toBeNull();

    // Link the pengguna to a PTK.
    await withTenant(db, SEED_A, (tx) =>
      linkPtk(tx, inserted.id, linkedPtk.id)
    );

    // Second upsert: role changes, ptk link MUST survive.
    const updated = await withTenant(db, SEED_A, (tx) =>
      upsertPengguna(tx, {
        userId,
        peranAkses: "admin_satuan_pendidikan",
        nama: "Siti R.",
      })
    );
    expect(updated.id).toBe(inserted.id);
    expect(updated.peranAkses).toBe("admin_satuan_pendidikan");
    expect(updated.nama).toBe("Siti R.");
    expect(updated.ptkId).toBe(linkedPtk.id);
  });

  // 4. cariPenggunaByUserId returns the pengguna for the current tenant; null
  //    when the userId exists only in another tenant (RLS isolation).
  itOrSkip("cariPenggunaByUserId is tenant-scoped (RLS)", async () => {
    const userId = "workos_repo_find_iso";

    const created = await withTenant(db, SEED_A, (tx) =>
      upsertPengguna(tx, { userId, peranAkses: "guru" })
    );

    const foundA = await withTenant(db, SEED_A, (tx) =>
      cariPenggunaByUserId(tx, userId)
    );
    expect(foundA).not.toBeNull();
    expect(foundA?.id).toBe(created.id);

    // Tenant B cannot find A's userId.
    const foundB = await withTenant(db, SEED_B, (tx) =>
      cariPenggunaByUserId(tx, userId)
    );
    expect(foundB).toBeNull();

    // Unknown userId returns null.
    const foundNone = await withTenant(db, SEED_A, (tx) =>
      cariPenggunaByUserId(tx, "workos_never_existed")
    );
    expect(foundNone).toBeNull();
  });

  // 5. linkPtk then listPengguna shows ptk populated; unlink shows ptk: null.
  itOrSkip("linkPtk populates ptk in listPengguna; unlink nulls it", async () => {
    const linkedPtk = await withTenant(db, SEED_A, (tx) =>
      buatPtk(tx, { nama: "PTK Link Repo", jenis: "tenaga_kependidikan" })
    );
    const penggunaRow = await withTenant(db, SEED_A, (tx) =>
      upsertPengguna(tx, {
        userId: "workos_repo_link",
        peranAkses: "guru",
      })
    );

    // Initially unlinked.
    const beforeList = await withTenant(db, SEED_A, (tx) => listPengguna(tx));
    const beforeRow = beforeList.find((p) => p.id === penggunaRow.id);
    expect(beforeRow).toBeDefined();
    expect(beforeRow?.ptk).toBeNull();

    // Link.
    await withTenant(db, SEED_A, (tx) =>
      linkPtk(tx, penggunaRow.id, linkedPtk.id)
    );

    const linkedList = await withTenant(db, SEED_A, (tx) => listPengguna(tx));
    const linkedRow = linkedList.find((p) => p.id === penggunaRow.id);
    expect(linkedRow).toBeDefined();
    expect(linkedRow?.ptk).not.toBeNull();
    expect(linkedRow?.ptk?.id).toBe(linkedPtk.id);
    expect(linkedRow?.ptk?.nama).toBe("PTK Link Repo");
    expect(linkedRow?.ptkId).toBe(linkedPtk.id);

    // Unlink (pass null).
    await withTenant(db, SEED_A, (tx) =>
      linkPtk(tx, penggunaRow.id, null)
    );

    const unlinkedList = await withTenant(db, SEED_A, (tx) => listPengguna(tx));
    const unlinkedRow = unlinkedList.find((p) => p.id === penggunaRow.id);
    expect(unlinkedRow).toBeDefined();
    expect(unlinkedRow?.ptk).toBeNull();
    expect(unlinkedRow?.ptkId).toBeNull();
  });

  // 6. loadAksesPengguna returns izin + pembatasan slug arrays.
  itOrSkip("loadAksesPengguna returns izin and pembatasan slug arrays", async () => {
    const penggunaRow = await withTenant(db, SEED_A, (tx) =>
      upsertPengguna(tx, {
        userId: "workos_repo_load_akses",
        peranAkses: "guru",
      })
    );

    // Seed 2 izin + 1 pembatasan via the schema directly (raw insert).
    await withTenant(db, SEED_A, async (tx) => {
      await tx.insert(schema.izinAkses).values([
        { penggunaId: penggunaRow.id, slug: "ptk:baca" },
        { penggunaId: penggunaRow.id, slug: "ptk:buat" },
      ]);
      await tx
        .insert(schema.pembatasanAkses)
        .values({ penggunaId: penggunaRow.id, slug: "ptk:hapus", alasan: "rotasi" });
    });

    const akses = await withTenant(db, SEED_A, (tx) =>
      loadAksesPengguna(tx, penggunaRow.id)
    );

    expect(akses.izin).toHaveLength(2);
    expect(akses.izin).toContain("ptk:baca");
    expect(akses.izin).toContain("ptk:buat");
    expect(akses.pembatasan).toHaveLength(1);
    expect(akses.pembatasan).toContain("ptk:hapus");

    // Unknown penggunaId yields empty arrays.
    const empty = await withTenant(db, SEED_A, (tx) =>
      loadAksesPengguna(tx, "00000000-0000-0000-0000-000000000000")
    );
    expect(empty.izin).toEqual([]);
    expect(empty.pembatasan).toEqual([]);
  });

  // 7. aturIzin / aturPembatasan: aktif=true adds, aktif=false removes; alasan
  //    round-trips through on-conflict update.
  itOrSkip("aturIzin and aturPembatasan toggle aktif; aturPembatasan round-trips alasan", async () => {
    const penggunaRow = await withTenant(db, SEED_A, (tx) =>
      upsertPengguna(tx, {
        userId: "workos_repo_atur",
        peranAkses: "guru",
      })
    );

    // Grant izin, assert visible.
    await withTenant(db, SEED_A, (tx) =>
      aturIzin(tx, penggunaRow.id, "ptk:baca", true)
    );
    let akses = await withTenant(db, SEED_A, (tx) =>
      loadAksesPengguna(tx, penggunaRow.id)
    );
    expect(akses.izin).toContain("ptk:baca");

    // Idempotent: grant again does not duplicate.
    await withTenant(db, SEED_A, (tx) =>
      aturIzin(tx, penggunaRow.id, "ptk:baca", true)
    );
    akses = await withTenant(db, SEED_A, (tx) =>
      loadAksesPengguna(tx, penggunaRow.id)
    );
    expect(akses.izin.filter((s) => s === "ptk:baca")).toHaveLength(1);

    // Revoke izin, assert hidden.
    await withTenant(db, SEED_A, (tx) =>
      aturIzin(tx, penggunaRow.id, "ptk:baca", false)
    );
    akses = await withTenant(db, SEED_A, (tx) =>
      loadAksesPengguna(tx, penggunaRow.id)
    );
    expect(akses.izin).not.toContain("ptk:baca");

    // Grant pembatasan with alasan, assert visible.
    await withTenant(db, SEED_A, (tx) =>
      aturPembatasan(tx, penggunaRow.id, "ptk:hapus", true, "rotasi")
    );

    // Re-grant with a new alasan — on-conflict update must replace it.
    await withTenant(db, SEED_A, (tx) =>
      aturPembatasan(tx, penggunaRow.id, "ptk:hapus", true, "demosi")
    );

    const batasRows = await withTenant(db, SEED_A, (tx) =>
      tx
        .select()
        .from(schema.pembatasanAkses)
        .where(eq(schema.pembatasanAkses.penggunaId, penggunaRow.id))
    );
    expect(batasRows).toHaveLength(1);
    expect(batasRows[0].slug).toBe("ptk:hapus");
    expect(batasRows[0].alasan).toBe("demosi");

    // Revoke pembatasan, assert hidden.
    await withTenant(db, SEED_A, (tx) =>
      aturPembatasan(tx, penggunaRow.id, "ptk:hapus", false)
    );
    akses = await withTenant(db, SEED_A, (tx) =>
      loadAksesPengguna(tx, penggunaRow.id)
    );
    expect(akses.pembatasan).not.toContain("ptk:hapus");
  });

  // 8. RLS isolation (core §13): a pengguna created in tenant A is NOT visible
  //    via listPengguna from tenant B.
  itOrSkip("listPengguna is tenant-isolated: tenant B cannot see tenant A's pengguna", async () => {
    const aUserId = "workos_repo_rls_iso";
    await withTenant(db, SEED_A, (tx) =>
      upsertPengguna(tx, { userId: aUserId, peranAkses: "guru" })
    );

    const bList = await withTenant(db, SEED_B, (tx) => listPengguna(tx));
    // §13: A's pengguna must not leak to B.
    expect(bList.find((p) => p.userId === aUserId)).toBeUndefined();
    // Within this run, beforeAll cleared tenant B's penggunas, so B is empty
    // unless another concurrent file wrote to tenant B (robustness: we only
    // assert the specific record is absent).
  });
});
