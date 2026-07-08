/**
 * Provision a WorkOS sandbox test Pengguna + Satuan Pendidikan + Keanggotaan for
 * the authenticated e2e tracer (`e2e/mvp-tracer.spec.ts`).
 *
 * Idempotent: safe to re-run. Find-or-create for every WorkOS resource and DB
 * row. Uses the WorkOS **sandbox** environment only (`sk_test_*` from .env) —
 * never production (security hard rule, AGENTS.md).
 *
 * What it creates:
 *   1. WorkOS Organization "E2E Test Satuan Pendidikan" (tagged via externalId
 *      for deterministic lookup).
 *   2. WorkOS Organization Role `admin_satuan_pendidikan` (if absent).
 *   3. WorkOS User `e2e-test@adminslop.test` (emailVerified, password set).
 *   4. WorkOS OrganizationMembership user↔org with the admin role.
 *   5. App DB: `satuan_pendidikan` row (migrator, no RLS) whose id = the WorkOS
 *      org id, plus tenant-scoped seed data via `withTenant` (app_user, RLS
 *      WITH CHECK enforced): pengguna + izin_akses, tahun_ajaran aktif, tingkat,
 *      1 rombongan_belajar, 3 peserta_didik.
 *
 * After running, the `WorkOSMembershipProvider` (`src/lib/auth/membership.ts`)
 * returns exactly one active Keanggotaan for the provisioned user, so
 * `resolveActiveTenant` auto-selects it — no `DEV_MEMBERSHIP_ALL` shim needed.
 *
 * Usage:
 *   npm run db:up && npm run db:migrate   # DB must exist + be migrated
 *   npx tsx scripts/provision-e2e-user.ts
 *
 * Outputs `E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` to stdout for GitHub secrets.
 */
import { eq } from "drizzle-orm";
import { WorkOS } from "@workos-inc/node";
import pg from "pg";

import { createDb, withTenant } from "../src/db/client";
import * as schema from "../src/db/schema";
import { PERAN_KE_IZIN_DEFAULT } from "../src/lib/auth/otorisasi";
import type { RoleSlug } from "../src/lib/auth/types";

// Load .env (Node native; no-op if absent).
try {
  process.loadEnvFile?.();
} catch {
  /* .env absent — rely on real env */
}

// ── Constants ──────────────────────────────────────────────────────────────
const E2E_ORG_NAME = "E2E Test Satuan Pendidikan";
/** Stable externalId makes the WorkOS org lookup deterministic across runs. */
const E2E_ORG_EXTERNAL_ID = "e2e-test-satuan-pendidikan";
const E2E_ORG_ROLE_SLUG: RoleSlug = "admin_satuan_pendidikan";
const E2E_ORG_ROLE_NAME = "Admin Satuan Pendidikan";

// SEC-01: credentials come from env (E2E_AUTH_EMAIL / E2E_AUTH_PASSWORD) so the
// password is never baked into version control. The fallbacks preserve the old
// local-dev defaults for a bare `npx tsx` run without env, but CI / shared
// environments MUST set the env vars (the script echoes them for secret setup).
const E2E_USER_EMAIL = process.env.E2E_AUTH_EMAIL ?? "e2e-test@adminslop.test";
const E2E_USER_PASSWORD =
  process.env.E2E_AUTH_PASSWORD ?? "E2eTestPass123!";
if (process.env.CI && !process.env.E2E_AUTH_EMAIL) {
  throw new Error("E2E_AUTH_EMAIL must be set in CI");
}
if (process.env.CI && !process.env.E2E_AUTH_PASSWORD) {
  throw new Error("E2E_AUTH_PASSWORD must be set in CI");
}
const E2E_USER_NAME = "E2E Test Admin";

/** Aktor marker for audit rows — distinguishes e2e seed from dev seed. */
const AKTOR_E2E = "seed-e2e";

// ── Env validation ─────────────────────────────────────────────────────────
const WORKOS_API_KEY = process.env.WORKOS_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_MIGRATOR_URL =
  process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;

if (!WORKOS_API_KEY || !WORKOS_API_KEY.startsWith("sk_test_")) {
  console.error(
    "[e2e-provision] WORKOS_API_KEY wajib dan harus sandbox (sk_test_*).",
  );
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("[e2e-provision] DATABASE_URL (app_user, RLS) wajib.");
  process.exit(1);
}

const workos = new WorkOS(WORKOS_API_KEY);

// ── WorkOS provisioning ────────────────────────────────────────────────────

/** Find or create the e2e WorkOS Organization (idempotent). */
async function provisionOrg() {
  // Lookup by stable externalId (exact, deterministic).
  try {
    const org = await workos.organizations.getOrganizationByExternalId(
      E2E_ORG_EXTERNAL_ID,
    );
    console.log(`[e2e-provision] org ditemukan: ${org.id} ("${org.name}")`);
    return org;
  } catch (err: unknown) {
    // 404 = not found → create below. Anything else rethrows.
    if (!isNotFound(err)) throw err;
  }
  const org = await workos.organizations.createOrganization({
    name: E2E_ORG_NAME,
    externalId: E2E_ORG_EXTERNAL_ID,
    metadata: { e2e: "true", provisioned_by: AKTOR_E2E },
  });
  console.log(`[e2e-provision] org dibuat: ${org.id} ("${org.name}")`);
  return org;
}

/**
 * Find or create the WorkOS **environment** role `admin_satuan_pendidikan`
 * (idempotent). Environment roles (not org-scoped) are used because org-level
 * role slugs must be `org-` prefixed — our app's `RoleSlug` vocabulary
 * (`KNOWN_ROLES`) expects unprefixed slugs like `admin_satuan_pendidikan`.
 */
async function provisionRole(): Promise<void> {
  try {
    await workos.authorization.getEnvironmentRole(E2E_ORG_ROLE_SLUG);
    console.log(
      `[e2e-provision] role env "${E2E_ORG_ROLE_SLUG}" sudah ada (skip).`,
    );
    return;
  } catch (err: unknown) {
    if (!isNotFound(err)) throw err;
  }
  await workos.authorization.createEnvironmentRole({
    slug: E2E_ORG_ROLE_SLUG,
    name: E2E_ORG_ROLE_NAME,
  });
  console.log(`[e2e-provision] role env dibuat: "${E2E_ORG_ROLE_SLUG}".`);
}

/** Find or create the e2e WorkOS User (idempotent). */
async function provisionUser() {
  const found = await workos.userManagement.listUsers({ email: E2E_USER_EMAIL });
  if (found.data.length > 0) {
    const user = found.data[0]!;
    console.log(`[e2e-provision] user ditemukan: ${user.id} (${user.email})`);
    return user;
  }
  const user = await workos.userManagement.createUser({
    email: E2E_USER_EMAIL,
    password: E2E_USER_PASSWORD,
    firstName: "E2E Test",
    lastName: "Admin",
    emailVerified: true,
  });
  console.log(
    `[e2e-provision] user dibuat: ${user.id} (${user.email})`,
  );
  return user;
}

/** Find or create the OrganizationMembership user↔org (idempotent). */
async function provisionMembership(orgId: string, userId: string): Promise<void> {
  const memberships = await workos.userManagement.listOrganizationMemberships({
    userId,
    organizationId: orgId,
  });
  const active = memberships.data.find((m) => m.status === "active");
  if (active) {
    console.log(`[e2e-provision] keanggotaan aktif sudah ada (skip).`);
    return;
  }
  await workos.userManagement.createOrganizationMembership({
    organizationId: orgId,
    userId,
    roleSlug: E2E_ORG_ROLE_SLUG,
  });
  console.log(`[e2e-provision] keanggotaan dibuat (role: ${E2E_ORG_ROLE_SLUG}).`);
}

// ── App DB seeding ─────────────────────────────────────────────────────────

/** Upsert the satuan_pendidikan row (migrator, no RLS) keyed to the org id. */
async function seedSatuanPendidikan(
  mig: pg.Pool,
  orgId: string,
): Promise<void> {
  await mig.query(
    `INSERT INTO satuan_pendidikan
       (id, nama, npsn, jenjang, alamat, nama_kepala,
        tahun_ajaran_aktif, semester_aktif, zona_waktu)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'ganjil','Asia/Jakarta')
     ON CONFLICT (id) DO UPDATE SET
       nama = EXCLUDED.nama,
       npsn = EXCLUDED.npsn,
       jenjang = EXCLUDED.jenjang,
       alamat = EXCLUDED.alamat,
       nama_kepala = EXCLUDED.nama_kepala,
       tahun_ajaran_aktif = EXCLUDED.tahun_ajaran_aktif`,
    [
      orgId,
      E2E_ORG_NAME,
      "99999999",
      "SMP",
      "Jl. Pengujian E2E No. 1, Jakarta",
      E2E_USER_NAME,
      "2026/2027",
    ],
  );
  console.log(`[e2e-provision] satuan_pendidikan di-upsert (${orgId}).`);
}

/** Idempotently seed tenant-scoped data via app_user (RLS WITH CHECK). */
async function seedTenantData(
  db: ReturnType<typeof createDb>["db"],
  orgId: string,
  userId: string,
): Promise<void> {
  await withTenant(db, orgId, async (tx) => {
    // ── Pengguna + izin_akses ───────────────────────────────────────────
    // Unique (tenant_id, user_id) — ON CONFLICT via existence check.
    const existing = await tx
      .select({ id: schema.pengguna.id })
      .from(schema.pengguna)
      .where(eq(schema.pengguna.userId, userId))
      .limit(1);

    let penggunaId: string;
    if (existing.length > 0) {
      penggunaId = existing[0]!.id;
      await tx
        .update(schema.pengguna)
        .set({ peranAkses: E2E_ORG_ROLE_SLUG, nama: E2E_USER_NAME })
        .where(eq(schema.pengguna.id, penggunaId));
      console.log(`[e2e-provision] pengguna diperbarui (${penggunaId}).`);
    } else {
      const [row] = await tx
        .insert(schema.pengguna)
        .values({
          userId,
          peranAkses: E2E_ORG_ROLE_SLUG,
          nama: E2E_USER_NAME,
          ptkId: null,
        })
        .returning({ id: schema.pengguna.id });
      penggunaId = row!.id;
      console.log(`[e2e-provision] pengguna dibuat (${penggunaId}).`);
    }

    // Re-seed izin_akses from PERAN_KE_IZIN_DEFAULT (idempotent via unique idx).
    const izin = PERAN_KE_IZIN_DEFAULT[E2E_ORG_ROLE_SLUG];
    if (izin.length) {
      for (const slug of izin) {
        await tx
          .insert(schema.izinAkses)
          .values({ penggunaId, slug })
          .onConflictDoNothing();
      }
      console.log(`[e2e-provision] ${izin.length} izin_akses di-upsert.`);
    }

    // ── Tahun Ajaran aktif (idempotent via unique (tenant, nama)) ───────
    const taNama = "2026/2027";
    let ta = await tx
      .select({ id: schema.tahunAjaran.id })
      .from(schema.tahunAjaran)
      .where(eq(schema.tahunAjaran.nama, taNama))
      .limit(1);
    if (ta.length === 0) {
      const [row] = await tx
        .insert(schema.tahunAjaran)
        .values({ nama: taNama, aktif: true })
        .returning({ id: schema.tahunAjaran.id });
      ta = [{ id: row!.id }];
      console.log(`[e2e-provision] tahun_ajaran dibuat (${row!.id}).`);
    } else {
      // Ensure exactly one aktif (partial unique idx enforces this).
      await tx
        .update(schema.tahunAjaran)
        .set({ aktif: true })
        .where(eq(schema.tahunAjaran.id, ta[0]!.id));
    }
    const taAktifId = ta[0]!.id;

    // ── Tingkat (idempotent via unique (tenant, urutan)) ────────────────
    const tkNama = "Kelas 7";
    let tingkat = await tx
      .select({ id: schema.tingkat.id })
      .from(schema.tingkat)
      .where(eq(schema.tingkat.urutan, 7))
      .limit(1);
    if (tingkat.length === 0) {
      const [row] = await tx
        .insert(schema.tingkat)
        .values({ nama: tkNama, urutan: 7 })
        .returning({ id: schema.tingkat.id });
      tingkat = [{ id: row!.id }];
    }
    const tingkatId = tingkat[0]!.id;

    // ── Rombongan Belajar (idempotent via unique (tenant, ta, nama)) ─────
    const rombelNama = "7A";
    let rombel = await tx
      .select({ id: schema.rombonganBelajar.id })
      .from(schema.rombonganBelajar)
      .where(eq(schema.rombonganBelajar.nama, rombelNama))
      .limit(1);
    if (rombel.length === 0) {
      const [row] = await tx
        .insert(schema.rombonganBelajar)
        .values({
          nama: rombelNama,
          tingkatId,
          tahunAjaranId: taAktifId,
        })
        .returning({ id: schema.rombonganBelajar.id });
      rombel = [{ id: row!.id }];
    }
    const _rombelId = rombel[0]!.id;

    // ── 3 Peserta Didik (idempotent via fixed NISN) ─────────────────────
    const seedPeserta = [
      {
        nama: "Andi E2E Saputra",
        nisn: "8888800001",
        nis: "e201",
        tanggalLahir: "2013-05-10",
        jenisKelamin: "L" as const,
      },
      {
        nama: "Budi E2E Wijaya",
        nisn: "8888800002",
        nis: "e202",
        tanggalLahir: "2013-08-22",
        jenisKelamin: "L" as const,
      },
      {
        nama: "Citra E2E Lestari",
        nisn: "8888800003",
        nis: "e203",
        tanggalLahir: "2013-11-03",
        jenisKelamin: "P" as const,
      },
    ];
    for (const p of seedPeserta) {
      const exists = await tx
        .select({ id: schema.pesertaDidik.id })
        .from(schema.pesertaDidik)
        .where(eq(schema.pesertaDidik.nisn, p.nisn))
        .limit(1);
      if (exists.length > 0) continue;
      await tx.insert(schema.pesertaDidik).values({
        nama: p.nama,
        nisn: p.nisn,
        nis: p.nis,
        tanggalLahir: p.tanggalLahir,
        jenisKelamin: p.jenisKelamin,
        status: "aktif",
      });
    }
    console.log(`[e2e-provision] ${seedPeserta.length} peserta_didik siap.`);

    // ── Audit row ───────────────────────────────────────────────────────
    await tx
      .insert(schema.catatanAudit)
      .values({
        aktor: AKTOR_E2E,
        aksi: "provision_e2e",
        target: `satuan_pendidikan:${orgId}`,
        beban: { userId, role: E2E_ORG_ROLE_SLUG },
      })
      .onConflictDoNothing();
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** True if the WorkOS error is a 404 NotFound. */
function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { status?: number; code?: string };
  return e.status === 404;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("[e2e-provision] mulai (sandbox WorkOS + DB).");

  // 1. WorkOS resources.
  const org = await provisionOrg();
  await provisionRole();
  const user = await provisionUser();
  await provisionMembership(org.id, user.id);

  // 2. App DB: satuan_pendidikan (migrator, no RLS) + tenant data (app_user).
  const mig = new pg.Pool({ connectionString: DATABASE_MIGRATOR_URL });
  try {
    await seedSatuanPendidikan(mig, org.id);
  } finally {
    await mig.end();
  }

  const { db, pool } = createDb(DATABASE_URL);
  try {
    await seedTenantData(db, org.id, user.id);
  } finally {
    await pool.end();
  }

  console.log(
    `\n[e2e-provision] selesai.\n` +
      `  orgId:   ${org.id}\n` +
      `  userId:  ${user.id}\n` +
      `\nSet GitHub secrets / env vars:\n` +
      `  E2E_AUTH_EMAIL=${E2E_USER_EMAIL}\n` +
      `  E2E_AUTH_PASSWORD=${E2E_USER_PASSWORD}\n`,
  );
}

main().catch((err) => {
  console.error("[e2e-provision] gagal:", err);
  process.exit(1);
});
