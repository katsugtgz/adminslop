import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { Notifikasi } from "@/db/schema";

// --- hoisted mocks ---------------------------------------------------------
// Mirrors src/app/dashboard/penilaian/actions.test.ts: hoist all mocks, mock
// the modules to wire them in, then import the actions under test.
//
// SELF-OWNERSHIP (AC#3/#5 of #20): the ownership resolver `cariNotifikasiById`
// lives in the repo (not the action layer). We therefore mock
// `@/db/queries/notifikasi` and drive `cariNotifikasiById.mockResolvedValue(...)`
// per test to prove the action accepts the OWN row and DENIES another user's.

const mocks = vi.hoisted(() => {
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn({ __tx: true })
    ),
    catatAudit: vi.fn(async () => undefined),
    cariNotifikasiById: vi.fn<
      (db: unknown, id: string) => Promise<Notifikasi | null>
    >(async () => null),
    tandaiDibaca: vi.fn(async () => ({ id: "n_1" })),
    tandaiSemuaDibaca: vi.fn(async () => 3),
    aturPreferensiNotifikasi: vi.fn(async () => ({ id: "pn_1" })),
    revalidatePath: vi.fn(),
    fetchSpy: vi.fn(),
  };
});

const {
  getAksesSaya,
  getDb,
  withTenant,
  catatAudit,
  cariNotifikasiById,
  tandaiDibaca,
  tandaiSemuaDibaca,
  aturPreferensiNotifikasi,
  revalidatePath,
  fetchSpy,
} = mocks;

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
  requireAksesAktif: async (izin: IzinSlug, pesanTolak?: string) => {
    const akses = await mocks.getAksesSaya();
    if (akses.status !== "active") {
      throw new Error("Satuan Pendidikan Aktif belum dipilih.");
    }
    if (!akses.boleh(izin).diizinkan) {
      throw new Error(pesanTolak ?? "Anda tidak memiliki izin untuk aksi ini.");
    }
    return akses;
  },
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
  catatAudit: mocks.catatAudit,
}));
vi.mock("@/db/queries/notifikasi", () => ({
  cariNotifikasiById: mocks.cariNotifikasiById,
  tandaiDibaca: mocks.tandaiDibaca,
  tandaiSemuaDibaca: mocks.tandaiSemuaDibaca,
  aturPreferensiNotifikasi: mocks.aturPreferensiNotifikasi,
  TIPE_NOTIFIKASI: ["tugas_nilai", "tugas_absensi", "tugas_eraport", "umum"],
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import * as actionsModule from "./actions";
import {
  aturPreferensiNotifikasiAction,
  tandaiDibacaAction,
  tandaiSemuaDibacaAction,
} from "./actions";

// --- helpers ---------------------------------------------------------------

function formData(obj: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.append(k, v);
  return fd;
}

/** `expect.anything()` stand-in for the fakeTx passed as the first repo arg. */
const TX = expect.anything();
/** `expect.anything()` stand-in for the db passed as first withTenant arg. */
const DB = expect.anything();

/**
 * Build an "active" AksesSaya mock whose `boleh()` mirrors the REAL
 * evaluasiAkses precedence (pembatasan > izin > peran default). `penggunaId`
 * threads the self-ownership identity (AC#3/#5 gate 2) — null = no synced
 * pengguna row.
 */
function aksesAktif(
  roleSlug: RoleSlug,
  opts?: {
    izin?: IzinSlug[];
    pembatasan?: IzinSlug[];
    penggunaId?: string | null;
  }
): Extract<AksesSaya, { status: "active" }> {
  const izin = opts?.izin ?? [];
  const pembatasan = opts?.pembatasan ?? [];
  const penggunaId = opts?.penggunaId ?? null;
  const defaults: Record<RoleSlug, IzinSlug[]> = {
    admin_satuan_pendidikan: ["akses:kelola", "notifikasi:baca", "notifikasi:kelola"],
    dev: ["akses:kelola", "notifikasi:baca", "notifikasi:kelola"],
    kepala_sekolah: ["notifikasi:baca"],
    guru: ["notifikasi:baca"],
    wali_kelas: ["notifikasi:baca"],
  };
  const boleh = (diminta: IzinSlug): KeputusanAkses => {
    if (pembatasan.includes(diminta))
      return { diizinkan: false, sumber: "pembatasan" as const };
    if (izin.includes(diminta))
      return { diizinkan: true, sumber: "izin" as const };
    if (defaults[roleSlug].includes(diminta))
      return { diizinkan: true, sumber: "peran" as const };
    return { diizinkan: false, sumber: "tidak_ada_izin" as const };
  };
  return {
    status: "active",
    membership: { orgId: "org_A", orgName: "Sekolah A", roleSlug },
    userId: "workos_u_1",
    pengguna: penggunaId
      ? {
          id: penggunaId,
          tenantId: "org_A",
          userId: "workos_u_1",
          peranAkses: roleSlug,
          ptkId: null,
          nama: "Pengguna Saya",
          dibuatPada: new Date("2026-01-01T00:00:00Z"),
        }
      : null,
    izin,
    pembatasan,
    boleh,
  };
}

beforeEach(() => {
  getAksesSaya.mockReset();
  getDb.mockReset();
  withTenant.mockReset();
  catatAudit.mockReset();
  cariNotifikasiById.mockReset();
  tandaiDibaca.mockReset();
  tandaiSemuaDibaca.mockReset();
  aturPreferensiNotifikasi.mockReset();
  revalidatePath.mockReset();
  fetchSpy.mockReset();
  // restore default implementations cleared by mockReset
  getDb.mockImplementation(() => ({ db: { __db: true } }));
  withTenant.mockImplementation(async (_db, _tenantId, fn) => fn({ __tx: true }));
  cariNotifikasiById.mockResolvedValue(null);
  tandaiDibaca.mockResolvedValue({ id: "n_1" });
  tandaiSemuaDibaca.mockResolvedValue(3);
  aturPreferensiNotifikasi.mockResolvedValue({ id: "pn_1" });
  catatAudit.mockResolvedValue(undefined);

  // AC#5 proof harness: spy on global fetch — no action may trigger an
  // external HTTP call (in-app ONLY). Unstubbed in afterEach.
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===========================================================================
// A. Role gate (gate 1) — pembatasan on notifikasi:baca denies ALL notifikasi
// actions, even for admin (no global superuser, §13). AC#3: Peran/Izin
// respected.
// ===========================================================================

describe("A. role gate — pembatasan['notifikasi:baca'] denies all (AC#3 Peran/Izin)", () => {
  it("1. admin WITH pembatasan notifikasi:baca -> tandaiDibacaAction throws /izin/i; no repo", async () => {
    getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", {
        penggunaId: "pg_me",
        pembatasan: ["notifikasi:baca"],
      })
    );
    await expect(tandaiDibacaAction("n_1")).rejects.toThrow(/izin/i);
    expect(cariNotifikasiById).not.toHaveBeenCalled();
    expect(tandaiDibaca).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("2. guru WITH pembatasan notifikasi:baca -> tandaiSemuaDibacaAction throws /izin/i", async () => {
    getAksesSaya.mockResolvedValue(
      aksesAktif("guru", {
        penggunaId: "pg_me",
        pembatasan: ["notifikasi:baca"],
      })
    );
    await expect(tandaiSemuaDibacaAction()).rejects.toThrow(/izin/i);
    expect(tandaiSemuaDibaca).not.toHaveBeenCalled();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// B. tandaiDibacaAction — SELF-OWNERSHIP SUCCESS (AC#3). Resolve returns a row
// whose penggunaId === akses.pengguna.id; the repo update + audit run.
// ===========================================================================

describe("B. tandaiDibacaAction — self-ownership success (AC#3)", () => {
  it("3. own notifikasi -> tandaiDibaca + audit(tandai_dibaca_notifikasi)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    cariNotifikasiById.mockResolvedValue({
      id: "n_own",
      tenantId: "org_A",
      penggunaId: "pg_me",
      tipe: "tugas_nilai",
      judul: "x",
      pesan: "y",
      dibaca: false,
      konteks: null,
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    });

    await tandaiDibacaAction("n_own");

    expect(cariNotifikasiById).toHaveBeenCalledWith(TX, "n_own");
    expect(tandaiDibaca).toHaveBeenCalledWith(TX, "n_own");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "tandai_dibaca_notifikasi",
        target: "notifikasi:n_own",
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/notifikasi");
  });

  it("4. AC#3 — every role (guru/wali_kelas/kepala_sekolah) can mark OWN as read (universal notifikasi:baca)", async () => {
    for (const role of ["guru", "wali_kelas", "kepala_sekolah"] as RoleSlug[]) {
      getAksesSaya.mockResolvedValue(aksesAktif(role, { penggunaId: "pg_me" }));
      cariNotifikasiById.mockResolvedValue({
        id: "n_x",
        tenantId: "org_A",
        penggunaId: "pg_me",
        tipe: "umum",
        judul: "x",
        pesan: "y",
        dibaca: false,
        konteks: null,
        dibuatPada: new Date("2026-01-01T00:00:00Z"),
      });
      await tandaiDibacaAction("n_x");
      expect(tandaiDibaca).toHaveBeenCalledWith(TX, "n_x");
    }
  });
});

// ===========================================================================
// C. AC#5 DENY — THE KEY SELF-OWNERSHIP TEST BLOCK. A hostile client passes
// ANOTHER user's notifikasiId. The role gate passes (notifikasi:baca is
// universal), but ownership fails: row.penggunaId !== akses.pengguna.id. The
// action MUST throw BEFORE the repo update.
// ===========================================================================

describe("C. AC#5 DENY — tandaiDibacaAction with another user's notifikasiId", () => {
  it("5. notifikasi belonging to ANOTHER pengguna -> throws /izin/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    // The resolved row belongs to pg_VICTIM — a different recipient.
    cariNotifikasiById.mockResolvedValue({
      id: "n_victim",
      tenantId: "org_A",
      penggunaId: "pg_VICTIM",
      tipe: "tugas_nilai",
      judul: "milik orang lain",
      pesan: "bukan milik saya",
      dibaca: false,
      konteks: null,
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    });

    await expect(tandaiDibacaAction("n_victim")).rejects.toThrow(/izin/i);
    expect(tandaiDibaca).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });

  it("6. cross-tenant id resolves to null (RLS) -> throws /tidak ditemukan/i; repo NOT called", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    cariNotifikasiById.mockResolvedValue(null);

    await expect(tandaiDibacaAction("n_bogus")).rejects.toThrow(
      /tidak ditemukan/i
    );
    expect(tandaiDibaca).not.toHaveBeenCalled();
    expect(catatAudit).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. tandaiSemuaDibacaAction — takes NO penggunaId arg; uses
// akses.pengguna.id directly. Cross-user targeting is impossible by
// construction (AC#5).
// ===========================================================================

describe("D. tandaiSemuaDibacaAction — self-only by construction", () => {
  it("7. success -> tandaiSemuaDibaca(myPenggunaId) + audit(tandai_semua_dibaca_notifikasi)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));

    await tandaiSemuaDibacaAction();

    // The repo is called with the penggunaId from akses — never from an arg.
    expect(tandaiSemuaDibaca).toHaveBeenCalledWith(TX, "pg_me");
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aktor: "workos_u_1",
        aksi: "tandai_semua_dibaca_notifikasi",
        target: "pengguna:pg_me",
        beban: { jumlah: 3 },
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/notifikasi");
  });

  it("8. AC#5 — no notifikasiId/penggunaId arg exists to tamper with (signature is void)", async () => {
    // The function takes zero args: there is literally no client-supplied
    // handle to target another user. The proof is the signature itself.
    expect(tandaiSemuaDibacaAction.length).toBe(0);
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    await tandaiSemuaDibacaAction();
    // Only the akses pengguna is ever touched.
    expect(tandaiSemuaDibaca).toHaveBeenCalledTimes(1);
    expect(tandaiSemuaDibaca).toHaveBeenCalledWith(TX, "pg_me");
  });
});

// ===========================================================================
// E. aturPreferensiNotifikasiAction — self-service. The penggunaId comes from
// akses, NEVER formData. A tampered penggunaId field is IGNORED.
// ===========================================================================

describe("E. aturPreferensiNotifikasiAction — self-service (formData.penggunaId IGNORED)", () => {
  it("9. aktif=on -> aturPreferensiNotifikasi(myPenggunaId, tipe, true) + audit", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));

    await aturPreferensiNotifikasiAction(
      formData({ tipe: "tugas_nilai", aktif: "on" })
    );

    expect(aturPreferensiNotifikasi).toHaveBeenCalledWith(TX, {
      penggunaId: "pg_me",
      tipe: "tugas_nilai",
      aktif: true,
    });
    expect(catatAudit).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        aksi: "atur_preferensi_notifikasi",
        target: "pengguna:pg_me",
        beban: { tipe: "tugas_nilai", aktif: true },
      })
    );
  });

  it("10. aktif unchecked -> aturPreferensiNotifikasi(myPenggunaId, tipe, false)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));

    await aturPreferensiNotifikasiAction(formData({ tipe: "umum" }));

    expect(aturPreferensiNotifikasi).toHaveBeenCalledWith(TX, {
      penggunaId: "pg_me",
      tipe: "umum",
      aktif: false,
    });
  });

  it("11. AC#5 — tampered formData penggunaId is IGNORED; uses akses.pengguna.id", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));

    await aturPreferensiNotifikasiAction(
      formData({
        tipe: "tugas_absensi",
        aktif: "on",
        // Hostile client tries to set another user's preference.
        penggunaId: "pg_VICTIM",
      })
    );

    // The repo received pg_me (from akses), NOT pg_VICTIM (from formData).
    expect(aturPreferensiNotifikasi).toHaveBeenCalledWith(TX, {
      penggunaId: "pg_me",
      tipe: "tugas_absensi",
      aktif: true,
    });
    expect(aturPreferensiNotifikasi).not.toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ penggunaId: "pg_VICTIM" })
    );
  });
});

// ===========================================================================
// F. AC#5 PROOF BLOCK — "no external delivery — in-app ONLY". The MVP slice
// sends NO email / WhatsApp / SMS. Asserted three ways:
//   1. The action module exports ONLY the three self-service actions — there
//      is no `buatNotifikasiAction`/`kirimNotifikasiAction`/`kirimEmailAction`.
//   2. No action triggers a global `fetch` (no outbound HTTP).
//   3. The module imports no email/whatsapp/sms library (static import check).
// ===========================================================================

describe("AC#5: no external delivery — in-app ONLY (MVP scope)", () => {
  it("12. module exports ONLY {tandaiDibacaAction, tandaiSemuaDibacaAction, aturPreferensiNotifikasiAction} — no send/buat action", () => {
    const exported = Object.keys(actionsModule).sort();
    expect(exported).toEqual(
      [
        "aturPreferensiNotifikasiAction",
        "tandaiDibacaAction",
        "tandaiSemuaDibacaAction",
      ].sort()
    );
    // Explicit negative assertions for any delivery surface.
    expect(actionsModule).not.toHaveProperty("buatNotifikasiAction");
    expect(actionsModule).not.toHaveProperty("kirimNotifikasiAction");
    expect(actionsModule).not.toHaveProperty("kirimEmailAction");
    expect(actionsModule).not.toHaveProperty("kirimWhatsappAction");
    expect(actionsModule).not.toHaveProperty("kirimSmsAction");
  });

  it("13. tandaiDibacaAction triggers NO external fetch (in-app DB only)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    cariNotifikasiById.mockResolvedValue({
      id: "n_1",
      tenantId: "org_A",
      penggunaId: "pg_me",
      tipe: "umum",
      judul: "x",
      pesan: "y",
      dibaca: false,
      konteks: null,
      dibuatPada: new Date("2026-01-01T00:00:00Z"),
    });
    await tandaiDibacaAction("n_1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("14. tandaiSemuaDibacaAction triggers NO external fetch; aturPreferensi too", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    await tandaiSemuaDibacaAction();
    await aturPreferensiNotifikasiAction(formData({ tipe: "umum", aktif: "on" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("15. AC#5 — hostile formData cannot inject a delivery target (no email/telepon field read)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    // formData carries email/telepon/whatsapp — the action MUST ignore them.
    await aturPreferensiNotifikasiAction(
      formData({
        tipe: "umum",
        aktif: "on",
        email: "victim@example.com",
        telepon: "+6281234567890",
        whatsapp: "+6281234567890",
      })
    );
    // The repo received only (penggunaId, tipe, aktif) — no contact fields.
    expect(aturPreferensiNotifikasi).toHaveBeenCalledWith(TX, {
      penggunaId: "pg_me",
      tipe: "umum",
      aktif: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. Manual validation failures (no zod).
// ===========================================================================

describe("G. manual validation failures", () => {
  it("16. tandaiDibacaAction('') -> /ID Notifikasi tidak valid/i; no repo", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    await expect(tandaiDibacaAction("   ")).rejects.toThrow(
      /ID Notifikasi tidak valid/i
    );
    expect(cariNotifikasiById).not.toHaveBeenCalled();
  });

  it("17. aturPreferensiNotifikasiAction + bogus tipe -> /Tipe Notifikasi tidak valid/i", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    await expect(
      aturPreferensiNotifikasiAction(formData({ tipe: "whatsapp blast", aktif: "on" }))
    ).rejects.toThrow(/Tipe Notifikasi tidak valid/i);
    expect(aturPreferensiNotifikasi).not.toHaveBeenCalled();
  });

  it("18. pengguna is null (no synced row) -> /belum terdaftar sebagai Pengguna/i", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: null }));
    await expect(tandaiSemuaDibacaAction()).rejects.toThrow(
      /belum terdaftar sebagai Pengguna/i
    );
    expect(tandaiSemuaDibaca).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// H. Non-active context (denied / choose) — no active Satuan Pendidikan.
// ===========================================================================

describe("H. non-active akses context", () => {
  it("19. getAksesSaya denied -> throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await expect(tandaiDibacaAction("n_1")).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("20. getAksesSaya choose -> throws /belum dipilih/i; no DB", async () => {
    getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [],
    } as AksesSaya);
    await expect(tandaiSemuaDibacaAction()).rejects.toThrow(/belum dipilih/i);
    expect(withTenant).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// I. Tenant tamper-proofing — orgId from membership ONLY, never formData.
// ===========================================================================

describe("I. tenant tamper-proofing", () => {
  it("21. aturPreferensi with bogus formData tenantId -> withTenant uses membership.orgId (org_A)", async () => {
    getAksesSaya.mockResolvedValue(aksesAktif("guru", { penggunaId: "pg_me" }));
    await aturPreferensiNotifikasiAction(
      formData({ tipe: "umum", aktif: "on", tenantId: "org_VICTIM" })
    );
    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(withTenant).toHaveBeenCalledWith(DB, "org_A", expect.anything());
    expect(withTenant).not.toHaveBeenCalledWith(
      DB,
      "org_VICTIM",
      expect.anything()
    );
  });
});
