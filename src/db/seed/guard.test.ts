import { describe, expect, it } from "vitest";

import { isLocalHost, parseHost } from "./guard";

describe("seed guard: parseHost", () => {
  it("postgres:// scheme", () => {
    expect(parseHost("postgres://u:p@localhost:5432/db")).toBe("localhost");
  });

  it("postgresql:// scheme", () => {
    expect(parseHost("postgresql://u:p@127.0.0.1:5432/db")).toBe("127.0.0.1");
  });

  it("IPv6 loopback", () => {
    expect(parseHost("postgres://u:p@[::1]:5432/db")).toBe("[::1]");
  });

  it("docker compose service name", () => {
    expect(parseHost("postgres://u:p@db:5432/eduadmin")).toBe("db");
  });

  it("non-local hostname (RDS)", () => {
    expect(parseHost("postgres://u:p@prod.cdn.us-east-1.rds.amazonaws.com/db")).toBe(
      "prod.cdn.us-east-1.rds.amazonaws.com",
    );
  });

  it("non-local hostname (supabase)", () => {
    expect(parseHost("postgres://u:p@db.abcdef.supabase.co:5432/postgres")).toBe(
      "db.abcdef.supabase.co",
    );
  });

  it("non-local hostname (neon)", () => {
    expect(parseHost("postgres://u:p@ep-cool-name-123.us-east-2.aws.neon.tech/db")).toBe(
      "ep-cool-name-123.us-east-2.aws.neon.tech",
    );
  });

  it("URL rusak mengembalikan null", () => {
    expect(parseHost("not a url :: garbage")).toBeNull();
  });

  it("string kosong mengembalikan null", () => {
    expect(parseHost("")).toBeNull();
  });
});

describe("seed guard: isLocalHost", () => {
  it.each([
    ["localhost", "postgres://u:p@localhost:5432/db"],
    ["127.0.0.1", "postgres://u:p@127.0.0.1:5432/db"],
    ["db (docker)", "postgres://u:p@db:5432/eduadmin"],
    ["postgres (docker)", "postgres://u:p@postgres:5432/eduadmin"],
  ])("diizinkan: %s", (_label, url) => {
    expect(isLocalHost(url)).toBe(true);
  });

  it.each([
    ["RDS", "postgres://u:p@prod.cdn.us-east-1.rds.amazonaws.com/db"],
    ["Supabase", "postgres://u:p@db.abcdef.supabase.co:5432/postgres"],
    ["Neon", "postgres://u:p@ep-cool-name-123.us-east-2.aws.neon.tech/db"],
    ["Railway", "postgres://u:p@containers.us-west.railway.app:5432/railway"],
    ["hostname arbitrary", "postgres://u:p@staging.internal.svc/db"],
  ])("ditolak: %s", (_label, url) => {
    expect(isLocalHost(url)).toBe(false);
  });

  it("URL rusak ditolak", () => {
    expect(isLocalHost("garbage :: not a url")).toBe(false);
  });
});
