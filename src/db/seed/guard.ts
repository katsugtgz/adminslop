// Safety guard: refuse destructive seed against non-local DB hosts unless
// SEED_FORCE=true. Prevents accidental `npm run db:seed` against staging/prod.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHost(host: string): string {
  // URL.hostname returns bracketed [::1] for IPv6 literal; strip brackets
  // supaya match dengan allowlist unbracketed.
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function allowedSeedHosts(): Set<string> {
  // Loopback selalu diizinkan; alias container (db/postgres) opt-in via
  // SEED_LOCAL_HOSTS biar tak bisa bypass SEED_FORCE di orchestration env.
  const optIn = (process.env.SEED_LOCAL_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...LOOPBACK_HOSTS, ...optIn]);
}

/** Parse hostname (unbracketed) dari connection string Postgres. Null bila URL rusak. */
export function parseHost(connUrl: string): string | null {
  try {
    // pg connection strings selalu punya scheme (postgres(ql)://...); prefix
    // defensif untuk kasus `host:port` tanpa scheme.
    const withScheme = /^[a-z]+:\/\//i.test(connUrl)
      ? connUrl
      : `postgres://${connUrl}`;
    const host = new URL(withScheme).hostname;
    if (host === "") return null;
    return normalizeHost(host);
  } catch {
    return null;
  }
}

/** True bila host connection string loopback atau SEED_LOCAL_HOSTS opt-in. */
export function isLocalHost(connUrl: string): boolean {
  const host = parseHost(connUrl);
  return host !== null && allowedSeedHosts().has(host);
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
  if (host === null || !allowedSeedHosts().has(host)) {
    console.error(
      `[seed] ${label} host "${host ?? "??"}" bukan host lokal. ` +
        "Seed destruktif (migrasi + cleanupTenant + re-insert). " +
        "Untuk paksa, set SEED_FORCE=true; untuk alias container (db/postgres), " +
        "set SEED_LOCAL_HOSTS=db,postgres.",
    );
    process.exit(1);
  }
}

/**
 * Target DB (host:port/pathname) untuk perbandingan same-DB. Null bila URL rusak.
 * Credentials diabaikan; port default 5432 bila tidak disebut.
 */
export function dbTarget(connUrl: string): string | null {
  try {
    const withScheme = /^[a-z]+:\/\//i.test(connUrl)
      ? connUrl
      : `postgres://${connUrl}`;
    const url = new URL(withScheme);
    if (url.hostname === "") return null;
    // Fail-closed: tanpa database name eksplisit, PostgreSQL default dbname =
    // username koneksi → postgres://migrator@host vs postgres://app@host
    // collapse padahal beda DB. Tolak ambiguous biar assertSameDb tak tertipu.
    const db = url.pathname;
    if (db === "" || db === "/") return null;
    return `${normalizeHost(url.hostname)}:${url.port || "5432"}${db}`;
  } catch {
    return null;
  }
}

/**
 * Exit(1) bila MIG_URL dan APP_URL menunjuk database berbeda. Migrasi +
 * cleanupTenant jalan di MIG; insert data di APP — mismatch = data inkonsisten.
 */
export function assertSameDb(migUrl: string, appUrl: string): void {
  const migTarget = dbTarget(migUrl);
  const appTarget = dbTarget(appUrl);
  // Fail-closed: URL rusak / pathname ambiguous = tak bisa verifikasi same-DB.
  // Silent bypass bisa akibat migrasi bersih DB_A + seed DB_B (data inkonsisten).
  if (migTarget === null || appTarget === null) {
    console.error(
      "[seed] Tidak dapat mem-parse DATABASE_MIGRATOR_URL atau DATABASE_URL, " +
        "atau URL tanpa nama database eksplisit. Verifikasi connection string " +
        "valid dan menyertakan pathname database (mis. .../eduadmin).",
    );
    process.exit(1);
  }
  if (migTarget !== appTarget) {
    console.error(
      `[seed] DATABASE_MIGRATOR_URL (${migTarget}) dan DATABASE_URL (${appTarget}) ` +
        "harus menunjuk database yang sama. Migrasi + cleanup jalan di MIG, " +
        "insert data di APP — mismatch = data inkonsisten.",
    );
    process.exit(1);
  }
}
