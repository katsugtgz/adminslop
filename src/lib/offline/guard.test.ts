import { beforeEach, afterEach, describe, expect, it } from "vitest";

import {
  AKSI_SENSITIF,
  assertOnline,
  bolehAksiSensitif,
  isOnline,
} from "./guard";

/**
 * Mode Offline (#21) — sensitive-action guard (AC#5). The guard throws when
 * offline for the closed set of sensitive actions (eraport:terbit, cetak:buat,
 * AI verification). `navigator.onLine` is toggled via Object.defineProperty.
 */

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", {
    value,
    configurable: true,
  });
}

beforeEach(() => setOnline(true));
afterEach(() => setOnline(true));

describe("guard (#21) — AC#5 sensitive action vocabulary", () => {
  it("AKSI_SENSITIF is the closed set of online-only actions", () => {
    expect(AKSI_SENSITIF).toEqual([
      "terbitkanEraport",
      "buatDokumenCetak",
      "verifikasiDokumenAi",
      "verifikasiDrafAi",
    ]);
  });
});

describe("guard (#21) — assertOnline (AC#5 proof)", () => {
  it("assertOnline('terbitkanEraport') THROWS when offline", () => {
    setOnline(false);
    expect(() => assertOnline("terbitkanEraport")).toThrow();
  });

  it("assertOnline('buatDokumenCetak') THROWS when offline", () => {
    setOnline(false);
    expect(() => assertOnline("buatDokumenCetak")).toThrow();
  });

  it("assertOnline('verifikasiDokumenAi') THROWS when offline", () => {
    setOnline(false);
    expect(() => assertOnline("verifikasiDokumenAi")).toThrow();
  });

  it("assertOnline('verifikasiDrafAi') THROWS when offline", () => {
    setOnline(false);
    expect(() => assertOnline("verifikasiDrafAi")).toThrow();
  });

  it("every AKSI_SENSITIF throws offline — exhaustive AC#5 proof", () => {
    setOnline(false);
    for (const aksi of AKSI_SENSITIF) {
      expect(() => assertOnline(aksi)).toThrow(
        /Tindakan ini memerlukan koneksi internet/
      );
    }
  });

  it("assertOnline is a no-op when online (action proceeds)", () => {
    setOnline(true);
    expect(() => assertOnline("terbitkanEraport")).not.toThrow();
  });

  it("the thrown message is the Bahasa user-facing string and names the action", () => {
    setOnline(false);
    expect(() => assertOnline("terbitkanEraport")).toThrow(
      /memerlukan koneksi internet.*terbitkanEraport/
    );
  });
});

describe("guard (#21) — bolehAksiSensitif + isOnline helpers", () => {
  it("isOnline mirrors navigator.onLine", () => {
    setOnline(true);
    expect(isOnline()).toBe(true);
    setOnline(false);
    expect(isOnline()).toBe(false);
  });

  it("bolehAksiSensitif returns false offline for a sensitive action", () => {
    setOnline(false);
    expect(bolehAksiSensitif("terbitkanEraport")).toBe(false);
  });

  it("bolehAksiSensitif returns true online for a sensitive action", () => {
    setOnline(true);
    expect(bolehAksiSensitif("buatDokumenCetak")).toBe(true);
  });

  it("bolehAksiSensitif returns false for a non-sensitive action even online", () => {
    setOnline(true);
    expect(bolehAksiSensitif("upsertNilai")).toBe(false);
  });
});
