import { describe, expect, it } from "vitest";

import {
  KETERANGAN_PEMANDAI_QR_DITUNDA,
  terjemahkanErrorKamera,
} from "./qr-pemindai";

/**
 * Task #15 guardrail — camera-denied error handler logic, locked BEFORE the
 * scanner UI ships. The future client component imports
 * `terjemahkanErrorKamera` and renders the returned Bahasa `pesan` next to
 * the planned `[data-testid="manual-qr-input"]` element. Playwright auth
 * fixture is unavailable (T9), so this vitest unit test on the error
 * handler logic is the evidence of record.
 */

describe("KETERANGAN_PEMANDAI_QR_DITUNDA — deferred-status tooltip", () => {
  it("is the exact documented Post-MVP Bahasa phrasing", () => {
    // Lock the string — any pre-scanner "Pindai QR" affordance MUST surface
    // this verbatim while the scanner library is not yet approved.
    expect(KETERANGAN_PEMANDAI_QR_DITUNDA).toBe(
      "Pemindai QR belum tersedia (Post-MVP)",
    );
  });
});

describe("terjemahkanErrorKamera — getUserMedia rejection contract", () => {
  // Helper: build a DOMException-shaped error without depending on jsdom's
  // DOMException constructor (the production code only reads `.name`).
  function fakeDomException(name: string, message = "mock"): unknown {
    const err = new Error(message);
    Object.defineProperty(err, "name", { value: name });
    return err;
  }

  it("NotAllowedError -> IZIN_DITOLAK + 'Izin kamera ditolak' + manual fallback (Task #15 camera-denied)", () => {
    // THE canonical camera-denied case: the user explicitly refused
    // permission in the browser prompt.
    const out = terjemahkanErrorKamera(fakeDomException("NotAllowedError"));
    expect(out.kode).toBe("IZIN_DITOLAK");
    expect(out.pesan).toMatch(/Izin kamera ditolak/i);
    // MUST mention the manual fallback path — Task #15 MUST-DO invariant.
    expect(out.pesan).toMatch(/input manual/i);
  });

  it("SecurityError (insecure http origin) -> IZIN_DITOLAK (same contract as explicit denial)", () => {
    // Browsers block getUserMedia entirely on insecure origins with a
    // SecurityError — surface it as the same Bahasa permission message
    // because the user's remedy (use manual input) is identical.
    const out = terjemahkanErrorKamera(fakeDomException("SecurityError"));
    expect(out.kode).toBe("IZIN_DITOLAK");
    expect(out.pesan).toMatch(/Izin kamera ditolak/i);
    expect(out.pesan).toMatch(/input manual/i);
  });

  it("NotFoundError -> TIDAK_ADA_KAMERA + manual fallback", () => {
    const out = terjemahkanErrorKamera(fakeDomException("NotFoundError"));
    expect(out.kode).toBe("TIDAK_ADA_KAMERA");
    expect(out.pesan).toMatch(/Kamera tidak ditemukan/i);
    expect(out.pesan).toMatch(/input manual/i);
  });

  it("DevicesNotFoundError (legacy name) -> TIDAK_ADA_KAMERA (alias)", () => {
    // Older browsers used DevicesNotFoundError before the spec settled on
    // NotFoundError; both must resolve to the same Bahasa message.
    const out = terjemahkanErrorKamera(
      fakeDomException("DevicesNotFoundError"),
    );
    expect(out.kode).toBe("TIDAK_ADA_KAMERA");
    expect(out.pesan).toMatch(/input manual/i);
  });

  it("NotReadableError -> KAMERA_SIBUK + manual fallback", () => {
    // Camera held by another app (Zoom, Meet, photobooth) — hardware
    // accessible but locked. Tell the user to close the other app OR fall
    // back to manual entry.
    const out = terjemahkanErrorKamera(fakeDomException("NotReadableError"));
    expect(out.kode).toBe("KAMERA_SIBUK");
    expect(out.pesan).toMatch(/sedang digunakan/i);
    expect(out.pesan).toMatch(/input manual/i);
  });

  it("OverconstrainedError -> LAINNYA + manual fallback (no English leak)", () => {
    const out = terjemahkanErrorKamera(fakeDomException("OverconstrainedError"));
    expect(out.kode).toBe("LAINNYA");
    expect(out.pesan).toMatch(/input manual/i);
    // No raw English DOMException name leaks to the user-facing string.
    expect(out.pesan).not.toMatch(/OverconstrainedError/i);
  });

  it("AbortError -> LAINNYA + manual fallback", () => {
    const out = terjemahkanErrorKamera(fakeDomException("AbortError"));
    expect(out.kode).toBe("LAINNYA");
    expect(out.pesan).toMatch(/input manual/i);
  });

  it("non-Error value (string / undefined / null) -> LAINNYA; never throws", () => {
    // The future UI's catch block may forward whatever the Promise reject
    // delivered — including non-Error values. The translator MUST handle
    // them without itself throwing.
    expect(() => terjemahkanErrorKamera("boom")).not.toThrow();
    expect(() => terjemahkanErrorKamera(undefined)).not.toThrow();
    expect(() => terjemahkanErrorKamera(null)).not.toThrow();
    expect(() => terjemahkanErrorKamera({})).not.toThrow();

    expect(terjemahkanErrorKamera(undefined).kode).toBe("LAINNYA");
    expect(terjemahkanErrorKamera(null).kode).toBe("LAINNYA");
    expect(terjemahkanErrorKamera("boom").pesan).toMatch(/input manual/i);
    expect(terjemahkanErrorKamera({}).pesan).toMatch(/input manual/i);
  });

  it("object with numeric `name` is coerced via String() and falls through to LAINNYA", () => {
    // Defends against an unusual reject payload where `name` is non-string.
    const weird = { name: 42 };
    expect(() => terjemahkanErrorKamera(weird)).not.toThrow();
    expect(terjemahkanErrorKamera(weird).kode).toBe("LAINNYA");
  });

  it("every getUserMedia rejection branch ends with manual-fallback guidance (Task #15 invariant)", () => {
    // Iterate EVERY known DOMException name getUserMedia can reject with,
    // plus the unknown fallback. The Bahasa pesan of each MUST mention the
    // manual fallback — this is the load-bearing guardrail that ensures
    // the camera-denied state can never strand the user.
    const names: Array<string | undefined> = [
      "NotAllowedError",
      "SecurityError",
      "NotFoundError",
      "DevicesNotFoundError",
      "NotReadableError",
      "OverconstrainedError",
      "AbortError",
      "NotSupportedError",
      "TypeError",
      "", // missing name
      undefined, // non-Error reject
    ];
    for (const name of names) {
      const err =
        name === undefined
          ? "raw string reject"
          : fakeDomException(name || "unknown");
      const { pesan } = terjemahkanErrorKamera(err);
      expect(pesan).toMatch(/input manual/i);
    }
  });
});
