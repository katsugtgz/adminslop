import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dbTarget, isLocalHost, parseHost } from "./guard";

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
});
