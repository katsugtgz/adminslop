import pg from "pg";

/**
 * Teardown helper untuk test DB yang INSERT INTO satuan_pendidikan.
 *
 * AMAN secara concurrency karena `vitest.config.ts` mengatur
 * `fileParallelism: false` — file test berjalan sekuensial. Jika
 * `fileParallelism` diaktifkan di masa depan, file yang berbagi tenant ID
 * (`org_A`/`org_B` dipakai akses/rls/pengaturan) bisa race; di situ
 * beri ID unik per-file (`org_AK_a`, `org_RL_a`, dst.) jangan shared.
 */
export async function cleanupTestTenants(
  migUrl: string,
  tenantIds: readonly string[],
): Promise<void> {
  if (tenantIds.length === 0) return;

  const pool = new pg.Pool({ connectionString: migUrl });
  try {
    await pool.query(
      "delete from catatan_audit where tenant_id = any($1::text[])",
      [tenantIds as string[]],
    );
    await pool.query(
      "delete from contoh_catatan where tenant_id = any($1::text[])",
      [tenantIds as string[]],
    );
    await pool.query(
      "delete from satuan_pendidikan where id = any($1::text[])",
      [tenantIds as string[]],
    );
  } finally {
    await pool.end();
  }
}
