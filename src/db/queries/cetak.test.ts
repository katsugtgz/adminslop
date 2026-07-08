import path from "node:path";

import pg, { DatabaseError } from "pg";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, withTenant, type Db, type Tx } from "../client";
import { runMigrations } from "../migrate";
import * as schema from "../schema";
import { cleanupTestTenants } from "../test-cleanup";

import {
  buatDrafEraport,
  getDrafEraportById,
  terbitkanEraport,
} from "./eraport";
import {
  buatDokumenCetak,
  buatTemplateCetak,
  cariTemplateCetakById,
  getKontenCetak,
  getTemplateDefault,
  listDokumenCetak,
  listTemplateCetak,
} from "./cetak";
import { buatTahunAjaran } from "./tahun-ajaran";
import { buatPesertaDidik } from "./peserta-didik";

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

// Tenant seeds — PRIVATE to this file (org_CETAK_*). Distinct per cetak repo
// test file so parallel vitest runs cannot delete each other's seed rows.
const SEED_A = "org_CETAK_a";
const SEED_B = "org_CETAK_b";

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

describeOrSkip("cetak repository (queries/cetak.ts — #14)", () => {
  beforeAll(async () => {
    await runMigrations(
      MIG_URL!,
      path.join(process.cwd(), "src/db/migrations")
    );

    const seed = new pg.Pool({ connectionString: MIG_URL });
    await seed.query(`
      insert into satuan_pendidikan (id, nama, npsn, alamat, logo_url, cetak_paper_size) values
        ('org_CETAK_a', 'Satuan Pendidikan Cetak A', '20XXXXXA', 'Jl. Cetak A No. 1', 'https://a.example/logo.png', 'a4'),
        ('org_CETAK_b', 'Satuan Pendidikan Cetak B', '20XXXXXB', 'Jl. Cetak B No. 2', null, 'f4')
      on conflict (id) do update set
        nama = excluded.nama,
        npsn = excluded.npsn,
        alamat = excluded.alamat,
        logo_url = excluded.logo_url,
        cetak_paper_size = excluded.cetak_paper_size;
    `);
    await seed.query(`
      delete from dokumen_cetak  where tenant_id in ('org_CETAK_a', 'org_CETAK_b');
      delete from template_cetak where tenant_id in ('org_CETAK_a', 'org_CETAK_b');
      delete from revisi_eraport where tenant_id in ('org_CETAK_a', 'org_CETAK_b');
      delete from draf_eraport  where tenant_id in ('org_CETAK_a', 'org_CETAK_b');
      delete from tahun_ajaran  where tenant_id in ('org_CETAK_a', 'org_CETAK_b');
      delete from peserta_didik where tenant_id in ('org_CETAK_a', 'org_CETAK_b');
    `);
    await seed.end();

    db = createDb(APP_URL!).db;
  });

  afterAll(async () => {
    await cleanupTestTenants(MIG_URL!, [SEED_A, SEED_B]);
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

  // 1. Template CRUD: create + read-back + tenant_id from GUC.
  itOrSkip("buatTemplateCetak creates a row; cariTemplateCetakById reads it back", async () => {
    const tpl = await withTenant(db, SEED_A, async (tx) => {
      const t = await buatTemplateCetak(tx, {
        nama: "Template A",
        pengaturan: { marginMm: 20, fontSize: 12 },
        dibuatOleh: "u_cetak_1",
      });
      return t;
    });

    expect(tpl.tenantId).toBe(SEED_A);
    expect(tpl.nama).toBe("Template A");
    expect(tpl.jenis).toBe("eraport");
    expect(tpl.isDefault).toBe(false);
    expect(tpl.pengaturan).toEqual({ marginMm: 20, fontSize: 12 });

    const found = await withTenant(db, SEED_A, (tx) =>
      cariTemplateCetakById(tx, tpl.id)
    );
    expect(found).not.toBeNull();
    expect(found!.id).toBe(tpl.id);

    const missing = await withTenant(db, SEED_A, (tx) =>
      cariTemplateCetakById(tx, "00000000-0000-0000-0000-000000000000")
    );
    expect(missing).toBeNull();
  });

  // 2. Default toggle: setting a new default unsets the prior default (one
  //    default per tenant per jenis).
  itOrSkip("isDefault toggle: a new default unsets the prior default", async () => {
    const { firstId, secondId } = await withTenant(db, SEED_A, async (tx) => {
      const first = await buatTemplateCetak(tx, {
        nama: "Default Pertama",
        isDefault: true,
      });
      const second = await buatTemplateCetak(tx, {
        nama: "Default Kedua",
        isDefault: true,
      });
      return { firstId: first.id, secondId: second.id };
    });

    const afterFirst = await withTenant(db, SEED_A, (tx) =>
      cariTemplateCetakById(tx, firstId)
    );
    const afterSecond = await withTenant(db, SEED_A, (tx) =>
      cariTemplateCetakById(tx, secondId)
    );
    expect(afterFirst!.isDefault).toBe(false);
    expect(afterSecond!.isDefault).toBe(true);

    const def = await withTenant(db, SEED_A, (tx) =>
      getTemplateDefault(tx, "eraport")
    );
    expect(def!.id).toBe(secondId);
  });

  // 3. listTemplateCetak: tenant-scoped, optional jenis filter.
  itOrSkip("listTemplateCetak returns tenant rows; jenis filter applies", async () => {
    await withTenant(db, SEED_A, async (tx) => {
      await buatTemplateCetak(tx, { nama: "List-A" });
    });

    const aRows = await withTenant(db, SEED_A, (tx) =>
      listTemplateCetak(tx, { jenis: "eraport" })
    );
    expect(aRows.length).toBeGreaterThan(0);
    expect(aRows.every((t) => t.jenis === "eraport")).toBe(true);

    // SEED_B sees none of SEED_A's templates (RLS).
    const bRows = await withTenant(db, SEED_B, (tx) => listTemplateCetak(tx));
    expect(bRows).toEqual([]);
  });

  // 4. AC#2: buatDokumenCetak from a TERBIT eraport succeeds; a draf/revisi
  //    eraport throws. Also exercises listDokumenCetak filter.
  itOrSkip("AC#2: buatDokumenCetak from TERBIT succeeds; draf/revisi throws", async () => {
    const { templateId, terbitId, drafId } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const f = await seedFixture(tx, "dok");
        const tpl = await buatTemplateCetak(tx, { nama: "Tpl Dok" });
        const terbit = await buatDrafEraport(tx, {
          pesertaDidikId: f.pd.id,
          tahunAjaranId: f.ta.id,
          semester: "ganjil",
          konten: { nilaiAkhir: 90 },
        });
        await terbitkanEraport(tx, terbit.id);
        const draf = await buatDrafEraport(tx, {
          pesertaDidikId: f.pd.id,
          tahunAjaranId: f.ta.id,
          semester: "genap",
          konten: { nilaiAkhir: 80 },
        });
        return { templateId: tpl.id, terbitId: terbit.id, drafId: draf.id };
      }
    );

    // TERBIT -> ok.
    const dok = await withTenant(db, SEED_A, (tx) =>
      buatDokumenCetak(tx, {
        drafEraportId: terbitId,
        templateCetakId: templateId,
        format: "a4",
        tandaTanganNama: "Siti",
        tandaTanganPeran: "Kepala Sekolah",
        dibuatOleh: "u_dok",
      })
    );
    expect(dok.tenantId).toBe(SEED_A);
    expect(dok.format).toBe("a4");
    expect(dok.tandaTanganNama).toBe("Siti");

    // DRAF -> throws (AC#2).
    await expect(
      withTenant(db, SEED_A, (tx) =>
        buatDokumenCetak(tx, {
          drafEraportId: drafId,
          templateCetakId: templateId,
          format: "a4",
        })
      )
    ).rejects.toThrow(/Terbit/i);

    // listDokumenCetak filter by drafEraportId.
    const forTerbit = await withTenant(db, SEED_A, (tx) =>
      listDokumenCetak(tx, { drafEraportId: terbitId })
    );
    expect(forTerbit.length).toBe(1);
    expect(forTerbit[0].id).toBe(dok.id);

    // Invalid format -> CHECK constraint (23xxx).
    await expectConstraintViolation(
      withTenant(db, SEED_A, (tx) =>
        buatDokumenCetak(tx, {
          drafEraportId: terbitId,
          templateCetakId: templateId,
          format: "letter" as never,
        })
      )
    );
  });

  // 5. getKontenCetak composition: draf_eraport konten + satuan_pendidikan
  //    identity/preferensi + default template pengaturan.
  itOrSkip("getKontenCetak composes identity + preferensi + template", async () => {
    const { eraportId, templateId } = await withTenant(db, SEED_A, async (tx) => {
      const f = await seedFixture(tx, "konten");
      const tpl = await buatTemplateCetak(tx, {
        nama: "Tpl Konten",
        pengaturan: { marginMm: 18, showLogo: false },
        isDefault: true,
      });
      const e = await buatDrafEraport(tx, {
        pesertaDidikId: f.pd.id,
        tahunAjaranId: f.ta.id,
        semester: "ganjil",
        konten: { nilaiAkhir: 75, sumber: "nilai_akhir" },
      });
      return { eraportId: e.id, templateId: tpl.id };
    });

    const konten = await withTenant(db, SEED_A, (tx) =>
      getKontenCetak(tx, eraportId)
    );
    expect(konten).not.toBeNull();
    expect(konten!.eraportId).toBe(eraportId);
    expect(konten!.konten).toEqual({ nilaiAkhir: 75, sumber: "nilai_akhir" });
    // Identity from satuan_pendidikan.
    expect(konten!.namaSatuanPendidikan).toBe("Satuan Pendidikan Cetak A");
    expect(konten!.npsn).toBe("20XXXXXA");
    expect(konten!.logoUrl).toBe("https://a.example/logo.png");
    // Preferensi. DB stores lowercase ("a4"|"f4") — matches FormatCetak.
    expect(konten!.formatPreferensi).toBe("a4");
    // Default template resolved.
    expect(konten!.template).not.toBeNull();
    expect(konten!.template!.id).toBe(templateId);
    expect(konten!.template!.pengaturan).toEqual({ marginMm: 18, showLogo: false });

    // Missing / cross-tenant eraport -> null.
    const ghost = await withTenant(db, SEED_A, (tx) =>
      getKontenCetak(tx, "00000000-0000-0000-0000-000000000000")
    );
    expect(ghost).toBeNull();
  });

  // 6. getKontenCetak with NO default template: template is null (graceful).
  itOrSkip("getKontenCetak returns null template when no default exists", async () => {
    const { eraportId } = await withTenant(db, SEED_B, async (tx) => {
      const f = await seedFixture(tx, "notpl");
      const e = await buatDrafEraport(tx, {
        pesertaDidikId: f.pd.id,
        tahunAjaranId: f.ta.id,
        semester: "ganjil",
        konten: {},
      });
      return { eraportId: e.id };
    });

    const konten = await withTenant(db, SEED_B, (tx) =>
      getKontenCetak(tx, eraportId)
    );
    expect(konten).not.toBeNull();
    expect(konten!.template).toBeNull();
    expect(konten!.formatPreferensi).toBe("f4");
  });

  // 7. RLS isolation: SEED_B cannot see/mutate SEED_A's template or dokumen.
  itOrSkip("template_cetak + dokumen_cetak are tenant-isolated (RLS)", async () => {
    const { templateId, dokumenId } = await withTenant(db, SEED_A, async (tx) => {
      const f = await seedFixture(tx, "rls");
      const tpl = await buatTemplateCetak(tx, { nama: "Tpl RLS" });
      const e = await buatDrafEraport(tx, {
        pesertaDidikId: f.pd.id,
        tahunAjaranId: f.ta.id,
        semester: "ganjil",
        konten: {},
      });
      await terbitkanEraport(tx, e.id);
      const dok = await buatDokumenCetak(tx, {
        drafEraportId: e.id,
        templateCetakId: tpl.id,
        format: "a4",
      });
      return { templateId: tpl.id, dokumenId: dok.id };
    });

    // SEED_A sees its own.
    const aTpl = await withTenant(db, SEED_A, (tx) =>
      cariTemplateCetakById(tx, templateId)
    );
    expect(aTpl).not.toBeNull();

    // SEED_B cannot see SEED_A's template (RLS hides it).
    const bTpl = await withTenant(db, SEED_B, (tx) =>
      cariTemplateCetakById(tx, templateId)
    );
    expect(bTpl).toBeNull();

    // SEED_B cannot see SEED_A's dokumen via listDokumenCetak.
    const bDoks = await withTenant(db, SEED_B, (tx) => listDokumenCetak(tx));
    expect(bDoks.find((d) => d.id === dokumenId)).toBeUndefined();
  });

  // 8. FK CASCADE: deleting draf_eraport removes its dokumen_cetak; deleting
  //    template_cetak removes dokumen_cetak rooted at it.
  itOrSkip("cascades draf_eraport -> dokumen_cetak and template_cetak -> dokumen_cetak (FK CASCADE)", async () => {
    const { eraportId, templateId, dokumenId } = await withTenant(
      db,
      SEED_A,
      async (tx) => {
        const f = await seedFixture(tx, "casc");
        const tpl = await buatTemplateCetak(tx, { nama: "Tpl Casc" });
        const e = await buatDrafEraport(tx, {
          pesertaDidikId: f.pd.id,
          tahunAjaranId: f.ta.id,
          semester: "ganjil",
          konten: {},
        });
        await terbitkanEraport(tx, e.id);
        const dok = await buatDokumenCetak(tx, {
          drafEraportId: e.id,
          templateCetakId: tpl.id,
          format: "a4",
        });
        return { eraportId: e.id, templateId: tpl.id, dokumenId: dok.id };
      }
    );

    // Sanity.
    const before = await withTenant(db, SEED_A, (tx) =>
      listDokumenCetak(tx, { drafEraportId: eraportId })
    );
    expect(before.length).toBe(1);

    // Delete the template -> dokumen_cetak cascades away.
    await withTenant(db, SEED_A, async (tx) => {
      await tx
        .delete(schema.templateCetak)
        .where(eq(schema.templateCetak.id, templateId));
    });

    const after = await withTenant(db, SEED_A, (tx) =>
      listDokumenCetak(tx, { drafEraportId: eraportId })
    );
    expect(after.find((d) => d.id === dokumenId)).toBeUndefined();

    // eraport still present (only the dokumen cascaded).
    const eraportStill = await withTenant(db, SEED_A, (tx) =>
      getDrafEraportById(tx, eraportId)
    );
    expect(eraportStill).not.toBeNull();
  });
});
