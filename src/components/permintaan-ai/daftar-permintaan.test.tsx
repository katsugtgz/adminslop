import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DaftarPermintaan } from "./daftar-permintaan";
import type { PermintaanAi, DrafAi } from "@/db/schema";

function permintaan(
  id: string,
  over: Partial<PermintaanAi> = {}
): PermintaanAi {
  return {
    id,
    tenantId: "org_A",
    jenis: "deskripsi_cp",
    konteks: {},
    status: "selesai",
    pesanError: null,
    permintaanTerkaitId: null,
    dibuatOleh: "workos_u_1",
    dibuatPada: new Date("2026-06-01T00:00:00Z"),
    diprosesPada: new Date("2026-06-01T00:00:01Z"),
    selesaiPada: new Date("2026-06-01T00:00:02Z"),
    ...over,
  };
}

function draf(permintaanAiId: string, over: Partial<DrafAi> = {}): DrafAi {
  return {
    id: `draf_${permintaanAiId}`,
    tenantId: "org_A",
    permintaanAiId,
    konten: "Konten AI.",
    provenance: "mock-model-v1@2026-06-01T00:00:00.000Z",
    statusVerifikasi: "menunggu",
    diverifikasiOleh: null,
    diverifikasiPada: null,
    dibuatPada: new Date("2026-06-01T00:00:02Z"),
    ...over,
  };
}

const NOOP = vi.fn(async () => {});

describe("DaftarPermintaan (#12 / T7 — AC#1 visible status)", () => {
  it("renders the empty state when there are no permintaan", () => {
    render(
      <DaftarPermintaan
        permintaan={[]}
        drafMap={new Map()}
        bolehBuat={false}
        bolehVerifikasi={false}
        batalkanAction={NOOP}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );
    expect(screen.getByText(/Belum ada Permintaan AI/i)).toBeInTheDocument();
  });

  it("renders one row per permintaan with its Bahasa Jenis label", () => {
    const items = [
      permintaan("p_1", { jenis: "deskripsi_cp" }),
      permintaan("p_2", { jenis: "narasi_raport" }),
    ];
    render(
      <DaftarPermintaan
        permintaan={items}
        drafMap={new Map()}
        bolehBuat={false}
        bolehVerifikasi={false}
        batalkanAction={NOOP}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );
    expect(
      screen.getByText("Deskripsi Capaian Pembelajaran")
    ).toBeInTheDocument();
    expect(screen.getByText("Narasi Raport")).toBeInTheDocument();
  });

  it("renders all five status badges in Bahasa", () => {
    const items = [
      permintaan("p_1", { status: "dibuat" }),
      permintaan("p_2", { status: "diproses" }),
      permintaan("p_3", { status: "selesai" }),
      permintaan("p_4", { status: "gagal", pesanError: "model error" }),
      permintaan("p_5", { status: "dibatalkan" }),
    ];
    render(
      <DaftarPermintaan
        permintaan={items}
        drafMap={new Map()}
        bolehBuat={false}
        bolehVerifikasi={false}
        batalkanAction={NOOP}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );
    expect(screen.getByText("Dibuat")).toBeInTheDocument();
    expect(screen.getByText("Diproses")).toBeInTheDocument();
    expect(screen.getAllByText("Selesai").length).toBeGreaterThan(0);
    expect(screen.getByText("Gagal")).toBeInTheDocument();
    expect(screen.getByText("Dibatalkan")).toBeInTheDocument();
  });

  it("shows 'Batalkan' for dibuat/diproses when bolehBuat, and hides it otherwise", () => {
    const items = [
      permintaan("p_dibuat", { status: "dibuat" }),
      permintaan("p_diproses", { status: "diproses" }),
      permintaan("p_selesai", { status: "selesai" }),
    ];
    const batalkanAction = vi.fn(async () => {});
    const { rerender } = render(
      <DaftarPermintaan
        permintaan={items}
        drafMap={new Map()}
        bolehBuat
        bolehVerifikasi={false}
        batalkanAction={batalkanAction}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );

    expect(screen.getAllByRole("button", { name: /Batalkan/i }).length).toBe(2);
    expect(
      screen.getAllByRole("button", { name: /Batalkan/i }).every((b) =>
        b.closest("form")!.querySelector('input[name="id"]')
      )
    ).toBe(true);

    rerender(
      <DaftarPermintaan
        permintaan={items}
        drafMap={new Map()}
        bolehBuat={false}
        bolehVerifikasi={false}
        batalkanAction={batalkanAction}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );
    expect(screen.queryAllByRole("button", { name: /Batalkan/i })).toHaveLength(0);
  });

  it("shows 'Coba Lagi' for gagal when bolehBuat", () => {
    const items = [permintaan("p_gagal", { status: "gagal", pesanError: "x" })];
    render(
      <DaftarPermintaan
        permintaan={items}
        drafMap={new Map()}
        bolehBuat
        bolehVerifikasi={false}
        batalkanAction={NOOP}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );
    const retry = screen.getByRole("button", { name: /Coba Lagi/i });
    expect(retry.closest("form")!.querySelector('input[name="id"]')).not.toBeNull();
  });

  it("hides 'Coba Lagi' when !bolehBuat", () => {
    const items = [permintaan("p_gagal", { status: "gagal", pesanError: "x" })];
    render(
      <DaftarPermintaan
        permintaan={items}
        drafMap={new Map()}
        bolehBuat={false}
        bolehVerifikasi={false}
        batalkanAction={NOOP}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );
    expect(screen.queryByRole("button", { name: /Coba Lagi/i })).toBeNull();
  });

  it("renders the linked KartuDraf for a selesai permintaan", () => {
    const items = [permintaan("p_1", { status: "selesai" })];
    const drafMap = new Map([["p_1", draf("p_1")]]);
    render(
      <DaftarPermintaan
        permintaan={items}
        drafMap={drafMap}
        bolehBuat={false}
        bolehVerifikasi={false}
        batalkanAction={NOOP}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );
    expect(screen.getByText(/\[DRAF AI\]/i)).toBeInTheDocument();
    expect(screen.getByText(/Provenance/i)).toBeInTheDocument();
  });

  it("forwards bolehVerifikasi + verifikasiAction into KartuDraf", () => {
    const items = [permintaan("p_1", { status: "selesai" })];
    const drafMap = new Map([["p_1", draf("p_1", { statusVerifikasi: "menunggu" })]]);
    render(
      <DaftarPermintaan
        permintaan={items}
        drafMap={drafMap}
        bolehBuat={false}
        bolehVerifikasi
        batalkanAction={NOOP}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );
    expect(screen.getByRole("button", { name: /Setujui/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tolak/i })).toBeInTheDocument();
  });

  it("shows the pesanError text on a gagal permintaan", () => {
    const items = [
      permintaan("p_1", { status: "gagal", pesanError: "Model timeout" }),
    ];
    render(
      <DaftarPermintaan
        permintaan={items}
        drafMap={new Map()}
        bolehBuat={false}
        bolehVerifikasi={false}
        batalkanAction={NOOP}
        retryAction={NOOP}
        verifikasiAction={NOOP}
      />
    );
    expect(screen.getByText(/Model timeout/)).toBeInTheDocument();
  });
});
