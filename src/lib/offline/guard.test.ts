import { beforeEach, afterEach, describe, expect, it } from "vitest";

import {
  AKSI_SENSITIF,
  PESAN_BLOK_OFFLINE,
  assertOnline,
  bolehAksiSensitif,
  isOnline,
} from "./guard";

/**
 * Mode Offline (#21) — sensitive-action guard (AC#5 + Task 16 hardening). The
 * guard throws when offline for the closed set of sensitive mutations (grades,
 * attendance, roles, AI requests, exports). `navigator.onLine` is toggled via
 * Object.defineProperty.
 *
 * Task 16 (Wave 2) hardened the vocabulary from the original 4-slug set
 * (eraport/cetak/AI×2) to the 7-slug set covering all five sensitive
 * categories mandated by the MVP offline-scope brief. The thrown message was
 * standardized to the exact Bahasa spec string `PESAN_BLOK_OFFLINE`.
 */

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    value,
    configurable: true,
  });
}

beforeEach(() => setOnline(true));
afterEach(() => setOnline(true));

describe("guard (#21 + T16) — AC#5 sensitive action vocabulary", () => {
  it("AKSI_SENSITIF is the closed set of online-only actions (all 5 T16 categories)", () => {
    // Task 16 mandates these five categories are ALL blocked offline:
    //   grades, attendance, roles, AI requests, exports.
    expect(AKSI_SENSITIF).toEqual([
      // grades
      "simpanNilai",
      // attendance
      "simpanAbsensi",
      // roles
      "ubahPeranAkses",
      // AI requests
      "verifikasiDokumenAi",
      "verifikasiDrafAi",
      // exports
      "terbitkanEraport",
      "buatDokumenCetak",
    ]);
  });

  it("PESAN_BLOK_OFFLINE is the exact Bahasa spec string", () => {
    expect(PESAN_BLOK_OFFLINE).toBe("Tidak dapat menyimpan saat offline");
  });
});

describe("guard (#21 + T16) — assertOnline (AC#5 + Task 16 proof)", () => {
  it("assertOnline('simpanNilai') THROWS when offline — grades blocked (T16)", () => {
    setOnline(false);
    expect(() => assertOnline("simpanNilai")).toThrow();
  });

  it("assertOnline('simpanAbsensi') THROWS when offline — attendance blocked (T16)", () => {
    setOnline(false);
    expect(() => assertOnline("simpanAbsensi")).toThrow();
  });

  it("assertOnline('ubahPeranAkses') THROWS when offline — roles blocked (T16)", () => {
    setOnline(false);
    expect(() => assertOnline("ubahPeranAkses")).toThrow();
  });

  it("assertOnline('verifikasiDokumenAi') THROWS when offline — AI blocked", () => {
    setOnline(false);
    expect(() => assertOnline("verifikasiDokumenAi")).toThrow();
  });

  it("assertOnline('verifikasiDrafAi') THROWS when offline — AI blocked", () => {
    setOnline(false);
    expect(() => assertOnline("verifikasiDrafAi")).toThrow();
  });

  it("assertOnline('terbitkanEraport') THROWS when offline — export blocked", () => {
    setOnline(false);
    expect(() => assertOnline("terbitkanEraport")).toThrow();
  });

  it("assertOnline('buatDokumenCetak') THROWS when offline — export blocked", () => {
    setOnline(false);
    expect(() => assertOnline("buatDokumenCetak")).toThrow();
  });

  it("every AKSI_SENSITIF throws offline — exhaustive T16 AC#5 proof", () => {
    setOnline(false);
    expect(AKSI_SENSITIF.length).toBeGreaterThanOrEqual(7);
    for (const aksi of AKSI_SENSITIF) {
      expect(() => assertOnline(aksi)).toThrow(PESAN_BLOK_OFFLINE);
    }
  });

  it("assertOnline is a no-op when online (action proceeds)", () => {
    setOnline(true);
    for (const aksi of AKSI_SENSITIF) {
      expect(() => assertOnline(aksi)).not.toThrow();
    }
  });

  it("the thrown message contains the exact Bahasa string and names the action", () => {
    setOnline(false);
    expect(() => assertOnline("simpanNilai")).toThrow(
      /Tidak dapat menyimpan saat offline.*simpanNilai/
    );
  });

  it("the thrown message contains PESAN_BLOK_OFFLINE verbatim (spec contains-check)", () => {
    setOnline(false);
    expect(() => assertOnline("ubahPeranAkses")).toThrow(
      new RegExp(PESAN_BLOK_OFFLINE)
    );
  });
});

describe("guard (#21 + T16) — bolehAksiSensitif + isOnline helpers", () => {
  it("isOnline mirrors navigator.onLine", () => {
    setOnline(true);
    expect(isOnline()).toBe(true);
    setOnline(false);
    expect(isOnline()).toBe(false);
  });

  it("bolehAksiSensitif returns false offline for a sensitive action", () => {
    setOnline(false);
    expect(bolehAksiSensitif("simpanNilai")).toBe(false);
    expect(bolehAksiSensitif("simpanAbsensi")).toBe(false);
    expect(bolehAksiSensitif("ubahPeranAkses")).toBe(false);
  });

  it("bolehAksiSensitif returns true online for every sensitive action (T16 vocabulary)", () => {
    setOnline(true);
    for (const aksi of AKSI_SENSITIF) {
      expect(bolehAksiSensitif(aksi)).toBe(true);
    }
  });

  it("bolehAksiSensitif returns false for a non-sensitive action even online", () => {
    // `bacaDaftar` is a read-only list action — never routes through the
    // sensitive-action gate, so the predicate is false regardless of
    // connectivity. (Read-only actions remain permitted offline by the
    // MVP read-only intent; they do not need this guard at all.)
    setOnline(true);
    expect(bolehAksiSensitif("bacaDaftar")).toBe(false);
  });
});
