// Safety guard: refuse destructive seed against non-local DB hosts unless
// SEED_FORCE=true. Prevents accidental `npm run db:seed` against staging/prod.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db", "postgres"]);

/** Parse hostname dari connection string Postgres. Null bila URL rusak. */
export function parseHost(connUrl: string): string | null {
  try {
    // pg connection strings selalu punya scheme (postgres(ql)://...); prefix
    // defensif untuk kasus `host:port` tanpa scheme.
    const withScheme = /^[a-z]+:\/\//i.test(connUrl)
      ? connUrl
      : `postgres://${connUrl}`;
    const host = new URL(withScheme).hostname;
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

/** True bila host connection string termasuk allowlist host lokal/dev. */
export function isLocalHost(connUrl: string): boolean {
  const host = parseHost(connUrl);
  return host !== null && LOCAL_HOSTS.has(host);
}

/**
 * Exit(1) bila `connUrl` bukan host lokal, kecuali `SEED_FORCE=true` di-set.
 * Dipanggil sebelum operasi destruktif (migrasi, cleanupTenant, seed).
 */
export function assertLocalOrForced(label: string, connUrl: string): void {
  // Escape hatch eksplisit untuk host non-lokal yang sengaja di-seed (mis.
  // tunnel SSH ke staging dev). Harus diset sadar, bukan default.
  if (process.env.SEED_FORCE === "true") return;
  const host = parseHost(connUrl);
  if (host === null || !LOCAL_HOSTS.has(host)) {
    console.error(
      `[seed] ${label} host "${host ?? "??"}" bukan host lokal. ` +
        "Seed destruktif (migrasi + cleanupTenant + re-insert). " +
        "Untuk paksa, set SEED_FORCE=true.",
    );
    process.exit(1);
  }
}
