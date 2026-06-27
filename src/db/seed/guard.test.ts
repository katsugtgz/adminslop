import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertLocalOrForced, assertSameDb, dbTarget, isLocalHost, parseHost } from "./guard";

// Guard baca process.env.SEED_LOCAL_HOSTS + SEED_FORCE saat call. Reset antar
// test biar tak kontaminasi.
const ENV_KEYS = ["SEED_LOCAL_HOSTS", "SEED_FORCE"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("seed guard: parseHost", () => {
  it("postgres:// scheme", () => {
    expect(parseHost("postgres://u:p@localhost:5432/db")).toBe("localhost");
  });

  it("postgresql:// scheme", () => {
    expect(parseHost("postgresql://u:p@127.0.0.1:5432/db")).toBe("127.0.0.1");
  });

  it("IPv6 loopback dinormalisasi tanpa bracket", () => {
    expect(parseHost("postgres://u:p@[::1]:5432/db")).toBe("::1");
  });

  it("RDS hostname", () => {
    expect(parseHost("postgres://u:p@prod.cdn.us-east-1.rds.amazonaws.com/db")).toBe(
      "prod.cdn.us-east-1.rds.amazonaws.com",
    );
  });

  it("URL rusak mengembalikan null", () => {
    expect(parseHost("not a url :: garbage")).toBeNull();
  });

  it("string kosong mengembalikan null", () => {
    expect(parseHost("")).toBeNull();
  });
});

describe("seed guard: isLocalHost (default, no opt-in)", () => {
  it.each([
    ["localhost", "postgres://u:p@localhost:5432/db"],
    ["127.0.0.1", "postgres://u:p@127.0.0.1:5432/db"],
    ["IPv6 ::1", "postgres://u:p@[::1]:5432/db"],
  ])("loopback diizinkan: %s", (_label, url) => {
    expect(isLocalHost(url)).toBe(true);
  });

  it.each([
    ["db (docker)", "postgres://u:p@db:5432/eduadmin"],
    ["postgres (docker)", "postgres://u:p@postgres:5432/eduadmin"],
    ["RDS", "postgres://u:p@prod.cdn.us-east-1.rds.amazonaws.com/db"],
    ["Supabase", "postgres://u:p@db.abcdef.supabase.co:5432/postgres"],
    ["Neon", "postgres://u:p@ep-cool-name-123.us-east-2.aws.neon.tech/db"],
    ["Railway", "postgres://u:p@containers.us-west.railway.app:5432/railway"],
  ])("ditolak tanpa opt-in: %s", (_label, url) => {
    expect(isLocalHost(url)).toBe(false);
  });

  it("URL rusak ditolak", () => {
    expect(isLocalHost("garbage :: not a url")).toBe(false);
  });
});

describe("seed guard: isLocalHost dengan SEED_LOCAL_HOSTS opt-in", () => {
  it("alias container diizinkan setelah opt-in", () => {
    process.env.SEED_LOCAL_HOSTS = "db,postgres";
    expect(isLocalHost("postgres://u:p@db:5432/eduadmin")).toBe(true);
    expect(isLocalHost("postgres://u:p@postgres:5432/eduadmin")).toBe(true);
  });

  it("opt-in tidak mengizinkan host lain", () => {
    process.env.SEED_LOCAL_HOSTS = "db";
    expect(isLocalHost("postgres://u:p@rds.amazonaws.com/db")).toBe(false);
  });

  it("loopback tetap diizinkan tanpa opt-in", () => {
    delete process.env.SEED_LOCAL_HOSTS;
    expect(isLocalHost("postgres://u:p@localhost:5432/db")).toBe(true);
  });

  it("SEED_LOCAL_HOSTS trivial/kosong diabaikan", () => {
    process.env.SEED_LOCAL_HOSTS = "  ,  ,";
    expect(isLocalHost("postgres://u:p@db:5432/eduadmin")).toBe(false);
  });
});

describe("seed guard: dbTarget (same-DB comparison)", () => {
  it("host+port+pathname diekstrak", () => {
    expect(dbTarget("postgres://u:p@localhost:5432/eduadmin")).toBe(
      "localhost:5432/eduadmin",
    );
  });

  it("port default 5432 bila tak disebut", () => {
    expect(dbTarget("postgres://u:p@localhost/eduadmin")).toBe(
      "localhost:5432/eduadmin",
    );
  });

  it("credentials diabaikan", () => {
    expect(dbTarget("postgres://u1:p1@localhost:5432/eduadmin")).toBe(
      dbTarget("postgres://u2:p2@localhost:5432/eduadmin"),
    );
  });

  it("IPv6 dinormalisasi", () => {
    expect(dbTarget("postgres://u:p@[::1]:5432/db")).toBe("::1:5432/db");
  });

  it("database berbeda → target berbeda", () => {
    expect(dbTarget("postgres://u:p@localhost:5432/dev_a")).not.toBe(
      dbTarget("postgres://u:p@localhost:5432/dev_b"),
    );
  });

  it("port berbeda → target berbeda", () => {
    expect(dbTarget("postgres://u:p@localhost:5432/db")).not.toBe(
      dbTarget("postgres://u:p@localhost:5433/db"),
    );
  });

  it("query params diabaikan", () => {
    expect(dbTarget("postgres://u:p@localhost:5432/db?sslmode=require")).toBe(
      dbTarget("postgres://u:p@localhost:5432/db"),
    );
  });

  it("URL rusak mengembalikan null", () => {
    expect(dbTarget("garbage :: not :: a :: url")).toBeNull();
  });

  it("pathname kosong (tanpa db name) → null (fail-closed)", () => {
    // PostgreSQL default dbname = username → ambiguous, harus ditolak.
    expect(dbTarget("postgres://u:p@localhost:5432")).toBeNull();
  });

  it("pathname hanya / → null (fail-closed)", () => {
    expect(dbTarget("postgres://u:p@localhost:5432/")).toBeNull();
  });
});

describe("seed guard: assertLocalOrForced", () => {
  it("host lokal → tak exit", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("should not exit");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      assertLocalOrForced("test", "postgres://u:p@localhost:5432/db"),
    ).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("host non-lokal → exit(1) + pesan error", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`exit:${code}`);
      });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      assertLocalOrForced("test", "postgres://u:p@rds.amazonaws.com/db"),
    ).toThrow("exit:1");
    expect(errSpy).toHaveBeenCalled();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("SEED_FORCE=true bypass guard untuk host non-lokal", () => {
    process.env.SEED_FORCE = "true";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("should not exit");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      assertLocalOrForced("test", "postgres://u:p@rds.amazonaws.com/db"),
    ).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("SEED_LOCAL_HOSTS opt-in mengizinkan alias container", () => {
    process.env.SEED_LOCAL_HOSTS = "db";
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("should not exit");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      assertLocalOrForced("test", "postgres://u:p@db:5432/eduadmin"),
    ).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("URL rusak → exit(1) (fail-closed)", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`exit:${code}`);
      });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertLocalOrForced("test", "garbage :: not a url")).toThrow(
      "exit:1",
    );
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe("seed guard: assertSameDb", () => {
  it("target sama → tak exit", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("should not exit");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const url = "postgres://u:p@localhost:5432/eduadmin";
    expect(() => assertSameDb(url, url)).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("target berbeda (database beda) → exit(1)", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`exit:${code}`);
      });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      assertSameDb(
        "postgres://u:p@localhost:5432/dev_a",
        "postgres://u:p@localhost:5432/dev_b",
      ),
    ).toThrow("exit:1");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("MIG URL rusak → exit(1) (fail-closed)", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`exit:${code}`);
      });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      assertSameDb(
        "garbage :: not :: a :: url",
        "postgres://u:p@localhost:5432/db",
      ),
    ).toThrow("exit:1");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("pathname ambigu (tanpa db name) → exit(1) (fail-closed)", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`exit:${code}`);
      });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // postgres://migrator@localhost vs postgres://app@localhost: dbname
    // default = username → ambigu, harus fail-closed.
    expect(() =>
      assertSameDb("postgres://migrator@localhost", "postgres://app@localhost"),
    ).toThrow("exit:1");
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
