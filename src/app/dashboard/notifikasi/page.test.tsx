import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AksesSaya } from "@/lib/auth/akses-saya";
import type { KeputusanAkses } from "@/lib/auth/otorisasi";
import type { IzinSlug, RoleSlug } from "@/lib/auth/types";
import type { Notifikasi, PreferensiNotifikasi } from "@/db/schema";

// --- hoisted mocks ---------------------------------------------------------

const mocks = vi.hoisted(() => {
  const fakeTx = { __tx: true };
  return {
    getAksesSaya: vi.fn(),
    getDb: vi.fn(() => ({ db: { __db: true } })),
    withTenant: vi.fn(
      async (
        _db: unknown,
        _tenantId: unknown,
        fn: (tx: unknown) => Promise<unknown>
      ) => fn(fakeTx)
    ),
    listNotifikasiAktif: vi.fn(async () => [] as Notifikasi[]),
    getPreferensiNotifikasi: vi.fn(async () => [] as PreferensiNotifikasi[]),
    hitungBelumDibaca: vi.fn(async () => 0),
    fakeTx,
  };
});

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

vi.mock("@/lib/auth/akses-saya", () => ({
  getAksesSaya: mocks.getAksesSaya,
}));
vi.mock("@/db/client", () => ({
  getDb: mocks.getDb,
  withTenant: mocks.withTenant,
}));
vi.mock("@/db/queries/notifikasi", () => ({
  listNotifikasiAktif: mocks.listNotifikasiAktif,
  getPreferensiNotifikasi: mocks.getPreferensiNotifikasi,
  hitungBelumDibaca: mocks.hitungBelumDibaca,
  TIPE_NOTIFIKASI: ["tugas_nilai", "tugas_absensi", "tugas_eraport", "umum"],
}));
vi.mock("./actions", () => ({
  tandaiDibacaAction: vi.fn(async () => undefined),
  tandaiSemuaDibacaAction: vi.fn(async () => undefined),
  aturPreferensiNotifikasiAction: vi.fn(async () => undefined),
}));

import Page from "./page";

// --- helpers ---------------------------------------------------------------

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

const NOTIFIKASI_NILAI: Notifikasi = {
  id: "n_1",
  tenantId: "org_A",
  penggunaId: "pg_me",
  tipe: "tugas_nilai",
  judul: "Nilai belum diinput",
  pesan: "Nilai belum diinput untuk Matematika",
  dibaca: false,
  konteks: { bebanId: "bm_1" },
  dibuatPada: new Date("2026-06-01T00:00:00Z"),
};

const NOTIFIKASI_Absen: Notifikasi = {
  id: "n_2",
  tenantId: "org_A",
  penggunaId: "pg_me",
  tipe: "tugas_absensi",
  judul: "Absensi belum dicatat",
  pesan: "Absensi belum dicatat untuk Kelas 1A",
  dibaca: true,
  konteks: null,
  dibuatPada: new Date("2026-06-02T00:00:00Z"),
};

async function renderPage() {
  const tree = await Page();
  return render(tree);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockImplementation(() => ({ db: { __db: true } }));
  mocks.withTenant.mockImplementation(async (_db, _tenantId, fn) =>
    fn(mocks.fakeTx)
  );
  mocks.listNotifikasiAktif.mockResolvedValue([]);
  mocks.getPreferensiNotifikasi.mockResolvedValue([]);
  mocks.hitungBelumDibaca.mockResolvedValue(0);
});

describe("NotifikasiPage — akses gate (#20 / T6)", () => {
  it("1. denied -> Pembatasan Akses; no data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue({ status: "denied" } as AksesSaya);
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.listNotifikasiAktif).not.toHaveBeenCalled();
  });

  it("2. choose -> Pilih Satuan Pendidikan", async () => {
    mocks.getAksesSaya.mockResolvedValue({
      status: "choose",
      memberships: [
        { orgId: "org_A", orgName: "Sekolah A", roleSlug: "guru" },
      ],
    } as AksesSaya);
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pilih Satuan Pendidikan/i })
    ).toBeInTheDocument();
    expect(mocks.listNotifikasiAktif).not.toHaveBeenCalled();
  });

  it("3. active + pembatasan notifikasi:baca -> Pembatasan Akses, no data loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", {
        penggunaId: "pg_me",
        pembatasan: ["notifikasi:baca"],
      })
    );
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /Pembatasan Akses/i })
    ).toBeInTheDocument();
    expect(mocks.listNotifikasiAktif).not.toHaveBeenCalled();
    expect(mocks.hitungBelumDibaca).not.toHaveBeenCalled();
  });
});

describe("NotifikasiPage — inbox + badge + preferensi (#20 / T6)", () => {
  it("4. guru with pengguna -> inbox (listNotifikasiAktif called with myPenggunaId); heading + Pengingat subtitle", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { penggunaId: "pg_me" })
    );
    mocks.listNotifikasiAktif.mockResolvedValue([NOTIFIKASI_NILAI]);
    mocks.hitungBelumDibaca.mockResolvedValue(1);

    await renderPage();

    // Heading + subtitle present.
    expect(
      screen.getByRole("heading", { level: 1, name: "Notifikasi" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Pengingat Tugas Tertunda/i)).toBeInTheDocument();

    // Inbox loaded recipient-scoped via akses.pengguna.id.
    expect(mocks.listNotifikasiAktif).toHaveBeenCalledWith(
      mocks.fakeTx,
      "pg_me"
    );
    expect(mocks.hitungBelumDibaca).toHaveBeenCalledWith(
      mocks.fakeTx,
      "pg_me"
    );

    // The notification content renders (action-oriented Bahasa copy). The
    // pesan is the most specific string (judul is a prefix of it).
    expect(
      screen.getByText(/Nilai belum diinput untuk Matematika/i)
    ).toBeInTheDocument();
    // judul also present (>= 1 element with the judul text).
    expect(
      screen.getAllByText(/Nilai belum diinput/i).length
    ).toBeGreaterThanOrEqual(1);

    // Badge shows the unread count.
    expect(screen.getByLabelText(/1 Belum Dibaca/i)).toBeInTheDocument();
  });

  it("5. empty inbox -> 'Belum ada notifikasi.' empty state; no badge; preferensi still renders", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("admin_satuan_pendidikan", { penggunaId: "pg_me" })
    );
    mocks.listNotifikasiAktif.mockResolvedValue([]);
    mocks.hitungBelumDibaca.mockResolvedValue(0);

    await renderPage();

    // Empty state.
    expect(screen.getByText(/Belum ada notifikasi/i)).toBeInTheDocument();
    // No badge when 0 unread.
    expect(screen.queryByLabelText(/Belum Dibaca/i)).toBeNull();
    // Preferensi still renders (self-service is independent of inbox).
    expect(
      screen.getByRole("form", { name: /Preferensi tugas_nilai/i })
    ).toBeInTheDocument();
  });

  it("6. badge counts unread > 0; 'Tandai Semua Dibaca' button appears when unread rows exist", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { penggunaId: "pg_me" })
    );
    mocks.listNotifikasiAktif.mockResolvedValue([
      NOTIFIKASI_NILAI, // unread
      NOTIFIKASI_Absen, // read
    ]);
    mocks.hitungBelumDibaca.mockResolvedValue(1);

    await renderPage();

    // Badge present (1 unread).
    expect(screen.getByLabelText(/1 Belum Dibaca/i)).toBeInTheDocument();
    // 'Tandai Semua Dibaca' appears (there is >=1 unread).
    expect(
      screen.getByRole("button", { name: /Tandai Semua Dibaca/i })
    ).toBeInTheDocument();
    // 'Tandai Dibaca' button on the unread row only.
    expect(
      screen.getByRole("button", { name: /Tandai Dibaca/i })
    ).toBeInTheDocument();
  });

  it("7. pengguna null -> notice 'belum terdaftar sebagai Pengguna'; no inbox loaded", async () => {
    mocks.getAksesSaya.mockResolvedValue(
      aksesAktif("guru", { penggunaId: null })
    );
    await renderPage();

    expect(
      screen.getByText(/belum terdaftar sebagai Pengguna/i)
    ).toBeInTheDocument();
    expect(mocks.listNotifikasiAktif).not.toHaveBeenCalled();
  });
});
