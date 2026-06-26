import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Stub the DB layer so the component's optional DB read falls into its catch
// branch (jumlahCatatan = null). The link visibility under test does not depend
// on DB state.
vi.mock("@/db/client", () => ({
  getDb: vi.fn(() => {
    throw new Error("no db in test");
  }),
  withTenant: vi.fn(),
}));
vi.mock("@/db/schema", () => ({ contohCatatan: {} }));

import { DashboardAktif } from "./dashboard-aktif";
import type { Membership } from "@/lib/auth/server";

function membershipFor(roleSlug: Membership["roleSlug"]): Membership {
  return { orgId: "org_A", orgName: "SMP Negeri 1", roleSlug };
}

async function renderAktif(roleSlug: Membership["roleSlug"]) {
  const tree = await DashboardAktif({ membership: membershipFor(roleSlug) });
  return render(tree);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardAktif — Pengaturan nav link (#5)", () => {
  it("admin_satuan_pendidikan -> shows Pengaturan Sekolah link", async () => {
    await renderAktif("admin_satuan_pendidikan");
    expect(
      screen.getByRole("link", { name: /Pengaturan Sekolah/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pengaturan Sekolah/i })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan"
    );
  });

  it("dev (admin-equivalent) -> shows Pengaturan Sekolah link", async () => {
    await renderAktif("dev");
    expect(
      screen.getByRole("link", { name: /Pengaturan Sekolah/i })
    ).toBeInTheDocument();
  });

  it("guru -> does NOT show Pengaturan Sekolah link (read-only via direct URL)", async () => {
    await renderAktif("guru");
    expect(
      screen.queryByRole("link", { name: /Pengaturan Sekolah/i })
    ).not.toBeInTheDocument();
  });

  it("still shows active Satuan Pendidikan name regardless of role", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("heading", { name: /SMP Negeri 1/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Akses reachability link (#6 / T6)", () => {
  it("admin sees the 'Manajemen Akses' link pointing at /dashboard/akses", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Manajemen Akses/i });
    expect(link.getAttribute("href")).toBe("/dashboard/akses");
  });

  it("kepala_sekolah sees the link (read-only viewer)", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Manajemen Akses/i })
    ).toBeInTheDocument();
  });

  it("guru does NOT see the link", async () => {
    await renderAktif("guru");
    expect(
      screen.queryByRole("link", { name: /Manajemen Akses/i })
    ).toBeNull();
  });

  it("wali_kelas does NOT see the link", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.queryByRole("link", { name: /Manajemen Akses/i })
    ).toBeNull();
  });
});

describe("DashboardAktif — Rombongan Belajar reachability link (#8)", () => {
  it("admin sees the 'Rombongan Belajar' link pointing at /dashboard/rombongan-belajar", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Rombongan Belajar/i });
    expect(link.getAttribute("href")).toBe("/dashboard/rombongan-belajar");
  });

  it("guru sees the link (core teaching data)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Rombongan Belajar/i })
    ).toBeInTheDocument();
  });

  it("kepala_sekolah sees the link", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Rombongan Belajar/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Tahun Ajaran reachability link (#8)", () => {
  it("admin sees the 'Tahun Ajaran' link pointing at /dashboard/tahun-ajaran", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Tahun Ajaran/i });
    expect(link.getAttribute("href")).toBe("/dashboard/tahun-ajaran");
  });

  it("kepala_sekolah sees the link", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Tahun Ajaran/i })
    ).toBeInTheDocument();
  });

  it("guru does NOT see the link", async () => {
    await renderAktif("guru");
    expect(
      screen.queryByRole("link", { name: /Tahun Ajaran/i })
    ).toBeNull();
  });
});

describe("DashboardAktif — Kurikulum reachability link (#9)", () => {
  // Every member role receives `kurikulum:baca` by default (curriculum is
  // universal read-only reference data), so ALL member roles see the link.
  it("admin sees the 'Kurikulum' link pointing at /dashboard/kurikulum", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Kurikulum/i });
    expect(link.getAttribute("href")).toBe("/dashboard/kurikulum");
  });

  it("guru sees the link (core teaching reference)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Kurikulum/i })
    ).toBeInTheDocument();
  });

  it("kepala_sekolah sees the link", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Kurikulum/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas sees the link", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.getByRole("link", { name: /Kurikulum/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Permintaan AI reachability link (#12)", () => {
  // All member roles receive `permintaan_ai:baca` by default, so ALL member
  // roles see the link. The page re-checks server-side (§12) and applies
  // AC#3 DUAL authz (verification gate) for draf_ai writes.
  it("admin sees the 'Permintaan AI' link pointing at /dashboard/permintaan-ai", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Permintaan AI/i });
    expect(link.getAttribute("href")).toBe("/dashboard/permintaan-ai");
  });

  it("guru sees the link (can create AI requests)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Permintaan AI/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas sees the link (read-only access)", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.getByRole("link", { name: /Permintaan AI/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Absensi reachability link (#15)", () => {
  // Every member role receives `absensi:baca` (daily attendance is core
  // teaching data; kepala_sekolah reads for oversight), so ALL member roles
  // see the link.
  it("admin sees the 'Absensi Harian' link pointing at /dashboard/absensi", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Absensi Harian/i });
    expect(link.getAttribute("href")).toBe("/dashboard/absensi");
  });

  it("guru sees the link (marks daily attendance for their classes)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Absensi Harian/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas sees the link (homeroom oversight)", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.getByRole("link", { name: /Absensi Harian/i })
    ).toBeInTheDocument();
  });

  it("kepala_sekolah sees the link (school-wide oversight)", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Absensi Harian/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Impor/Ekspor Peserta Didik reachability link (#18)", () => {
  // admin / kepala_sekolah / dev receive `impor_peserta_didik:baca` (bulk
  // data movement is admin-only with kepala_sekolah read oversight). guru
  // and wali_kelas do NOT — students' bulk import/export is admin-scoped.
  it("admin sees the 'Impor/Ekspor' link pointing at /dashboard/impor-peserta-didik", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Impor\/Ekspor/i });
    expect(link.getAttribute("href")).toBe("/dashboard/impor-peserta-didik");
  });

  it("kepala_sekolah sees the link (read oversight)", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Impor\/Ekspor/i })
    ).toBeInTheDocument();
  });

  it("guru does NOT see the link", async () => {
    await renderAktif("guru");
    expect(
      screen.queryByRole("link", { name: /Impor\/Ekspor/i })
    ).toBeNull();
  });

  it("wali_kelas does NOT see the link", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.queryByRole("link", { name: /Impor\/Ekspor/i })
    ).toBeNull();
  });
});

describe("DashboardAktif — Notifikasi reachability link (#20)", () => {
  // Every member role receives `notifikasi:baca` by default (each user manages
  // their own in-app inbox), so ALL member roles see the link.
  it("admin sees the 'Notifikasi' link pointing at /dashboard/notifikasi", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Notifikasi/i });
    expect(link.getAttribute("href")).toBe("/dashboard/notifikasi");
  });

  it("guru sees the link (personal inbox is universal)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Notifikasi/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — E-Raport reachability link (#13)", () => {
  // All member roles receive `eraport:baca` by default, so ALL member roles
  // see the link. The page re-checks server-side (§12) and applies AC#2/AC#3
  // DUAL authz (no double-terbit, revisi append-only) for writes.
  it("admin sees the 'E-Raport' link pointing at /dashboard/eraport", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /E-Raport/i });
    expect(link.getAttribute("href")).toBe("/dashboard/eraport");
  });

  it("guru sees the link (can create report drafts)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /E-Raport/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas sees the link (read-only oversight)", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.getByRole("link", { name: /E-Raport/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Bank Soal reachability link (#16)", () => {
  // All member roles receive `bank_soal:baca` by default, so ALL member roles
  // see the link. The page re-checks server-side (§12) and applies AC#2 DUAL
  // authz (verification gate) for AI-generated butir soal writes.
  it("admin sees the 'Bank Soal' link pointing at /dashboard/bank-soal", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Bank Soal/i });
    expect(link.getAttribute("href")).toBe("/dashboard/bank-soal");
  });

  it("guru sees the link (can author butir soal and rakit paket)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Bank Soal/i })
    ).toBeInTheDocument();
  });

  it("kepala_sekolah sees the link (read-only oversight)", async () => {
    await renderAktif("kepala_sekolah");
    expect(
      screen.getByRole("link", { name: /Bank Soal/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Perangkat Ajar reachability link (#17)", () => {
  // All member roles receive `perangkat_ajar:baca` by default, so ALL member
  // roles see the link. The page re-checks server-side (§12) and applies
  // AC#3 DUAL authz (verification gate) for dokumen_ai content.
  it("admin sees the 'Perangkat Ajar' link pointing at /dashboard/perangkat-ajar", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Perangkat Ajar/i });
    expect(link.getAttribute("href")).toBe("/dashboard/perangkat-ajar");
  });

  it("guru sees the link (can create teaching documents)", async () => {
    await renderAktif("guru");
    expect(
      screen.getByRole("link", { name: /Perangkat Ajar/i })
    ).toBeInTheDocument();
  });

  it("wali_kelas sees the link (read-only oversight)", async () => {
    await renderAktif("wali_kelas");
    expect(
      screen.getByRole("link", { name: /Perangkat Ajar/i })
    ).toBeInTheDocument();
  });
});

describe("DashboardAktif — Arsip reachability link (#19)", () => {
  // admin / kepala_sekolah / dev receive `arsip:baca` (archive/recovery/
  // retention/history is admin/oversight scope). guru / wali_kelas do NOT —
  // the page re-checks `boleh("arsip:baca")` server-side (§12).
  it("admin sees the 'Arsip Data' link pointing at /dashboard/arsip", async () => {
    await renderAktif("admin_satuan_pendidikan");
    const link = screen.getByRole("link", { name: /Arsip Data/i });
    expect(link.getAttribute("href")).toBe("/dashboard/arsip");
  });

  it("guru does NOT see the link (not core teaching data)", async () => {
    await renderAktif("guru");
    expect(screen.queryByRole("link", { name: /Arsip Data/i })).toBeNull();
  });
});
