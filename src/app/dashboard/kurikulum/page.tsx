import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { getDb } from "@/db/client";
import {
  listAlurTujuanPembelajaranByTP,
  listCapaianPembelajaran,
  listFaseByKurikulumDanMapel,
  listKurikulum,
  listMataPelajaranByKurikulum,
  listTujuanPembelajaranByCP,
} from "@/db/queries/kurikulum";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import type {
  AlurTujuanPembelajaran,
  CapaianPembelajaran,
  Fase,
  MataPelajaran,
  TujuanPembelajaran,
} from "@/db/schema";

import { DaftarAlurTujuanPembelajaran } from "@/components/kurikulum/daftar-alur-tujuan-pembelajaran";
import { DaftarCapaianPembelajaran } from "@/components/kurikulum/daftar-capaian-pembelajaran";
import { DaftarFase } from "@/components/kurikulum/daftar-fase";
import { DaftarKurikulum } from "@/components/kurikulum/daftar-kurikulum";
import { DaftarMataPelajaran } from "@/components/kurikulum/daftar-mata-pelajaran";
import { DaftarTujuanPembelajaran } from "@/components/kurikulum/daftar-tujuan-pembelajaran";
import { PembatasanAkses } from "@/components/pembatasan-akses";
import { PilihSatuanPendidikan } from "@/components/pilih-satuan-pendidikan";

export const dynamic = "force-dynamic";

/**
 * Kurikulum browser — read-only progressive drill-down over the GLOBAL
 * Kurikulum Merdeka reference tables (#9 / T6, ADR 0001).
 *
 * Drill-down is driven entirely by `searchParams` (progressive disclosure):
 * each level renders only once its parent id is selected, and each item is a
 * `<Link>` that adds its id to the query (clearing deeper levels). The URL
 * looks like `/dashboard/kurikulum?kurikulumId=…&mapelId=…&faseId=…&cpId=…`.
 *
 * CRITICAL DIFFERENCE from #5-#8: this reads GLOBAL tables (no `tenant_id`),
 * so there is NO `withTenant` — reads go through `getDb().db` directly. The
 * page still requires an active membership for consistency (browsing is a
 * member-context action), but the data itself is universal and universal
 * read-only (app_user has SELECT ONLY on these tables).
 *
 * Authorization: `kurikulum:baca` is granted to every member role by default
 * (identity doc §12 — `boleh()` is the authoritative gate, not this UI).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    kurikulumId?: string;
    mapelId?: string;
    faseId?: string;
    cpId?: string;
    tpId?: string;
  }>;
}) {
  const akses = await getAksesSaya();

  if (akses.status === "denied") {
    return <PembatasanAkses />;
  }
  if (akses.status === "choose") {
    return (
      <PilihSatuanPendidikan memberships={[...akses.memberships]} />
    );
  }

  // akses.status === "active"
  if (!akses.boleh("kurikulum:baca").diizinkan) {
    return <PembatasanAkses />;
  }

  const sp = await searchParams;
  const { db } = getDb(); // NO withTenant — GLOBAL tables (ADR 0001).

  // Level 0: always show the kurikulum list.
  const kurikulum = await listKurikulum(db);

  // Progressive drill-down: deeper levels only load once a parent is selected.
  let mapel: MataPelajaran[] = [];
  let fase: Fase[] = [];
  let cp: CapaianPembelajaran[] = [];
  let tp: TujuanPembelajaran[] = [];
  let atp: AlurTujuanPembelajaran[] = [];

  if (sp.kurikulumId) {
    mapel = await listMataPelajaranByKurikulum(db, sp.kurikulumId);
    if (sp.mapelId) {
      fase = await listFaseByKurikulumDanMapel(
        db,
        sp.kurikulumId,
        sp.mapelId
      );
      cp = await listCapaianPembelajaran(db, {
        kurikulumId: sp.kurikulumId,
        mapelId: sp.mapelId,
      });
      if (sp.faseId) {
        // Narrow CP by the selected fase.
        cp = await listCapaianPembelajaran(db, {
          kurikulumId: sp.kurikulumId,
          mapelId: sp.mapelId,
          faseId: sp.faseId,
        });
      }
    }
    if (sp.cpId) {
      tp = await listTujuanPembelajaranByCP(db, sp.cpId);
      if (sp.tpId) {
        atp = await listAlurTujuanPembelajaranByTP(db, sp.tpId);
      }
    }
  }

  // Breadcrumb: resolve the selected item at each loaded level so each crumb
  // shows a human label and links "up" by dropping deeper params. The root
  // crumb is "Kurikulum" (the section); subsequent crumbs are the selected
  // items at deeper levels (Mata Pelajaran / Fase / CP / TP).
  const mapelTerpilih = sp.mapelId
    ? mapel.find((m) => m.id === sp.mapelId)
    : undefined;
  const faseTerpilih = sp.faseId
    ? fase.find((f) => f.id === sp.faseId)
    : undefined;
  const cpTerpilih = sp.cpId ? cp.find((c) => c.id === sp.cpId) : undefined;
  const tpTerpilih = sp.tpId ? tp.find((t) => t.id === sp.tpId) : undefined;

  const tampilkanBreadcrumb = Boolean(
    mapelTerpilih || faseTerpilih || cpTerpilih || tpTerpilih
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">Kurikulum</h1>
        <p className="text-sm text-muted-foreground">
          Jelajahi Kurikulum Merdeka: Mata Pelajaran, Fase, Capaian, Tujuan, dan
          Alur Tujuan Pembelajaran.
        </p>
      </header>

      {tampilkanBreadcrumb && (
        <nav
          aria-label="breadcrumb"
          className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
        >
          <Link
            href="/dashboard/kurikulum"
            className="font-medium text-foreground hover:text-primary"
          >
            Kurikulum
          </Link>
          {mapelTerpilih && (
            <>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <Link
                href={`/dashboard/kurikulum?kurikulumId=${encodeURIComponent(sp.kurikulumId!)}&mapelId=${encodeURIComponent(mapelTerpilih.id)}`}
                className="hover:text-primary"
              >
                Mata Pelajaran: {mapelTerpilih.nama}
              </Link>
            </>
          )}
          {faseTerpilih && (
            <>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <Link
                href={`/dashboard/kurikulum?kurikulumId=${encodeURIComponent(sp.kurikulumId!)}&mapelId=${encodeURIComponent(sp.mapelId!)}&faseId=${encodeURIComponent(faseTerpilih.id)}`}
                className="hover:text-primary"
              >
                Fase: {faseTerpilih.kode}
              </Link>
            </>
          )}
          {cpTerpilih && (
            <>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <Link
                href={`/dashboard/kurikulum?kurikulumId=${encodeURIComponent(sp.kurikulumId!)}&mapelId=${encodeURIComponent(sp.mapelId!)}${sp.faseId ? `&faseId=${encodeURIComponent(sp.faseId)}` : ""}&cpId=${encodeURIComponent(cpTerpilih.id)}`}
                className="hover:text-primary"
              >
                Capaian Pembelajaran: {cpTerpilih.kode ?? cpTerpilih.elemen ?? "CP"}
              </Link>
            </>
          )}
          {tpTerpilih && (
            <>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
              <span className="font-medium text-foreground" aria-current="page">
                Tujuan Pembelajaran: {tpTerpilih.urutan}
              </span>
            </>
          )}
        </nav>
      )}

      <DaftarKurikulum items={kurikulum} selectedId={sp.kurikulumId} />

      {sp.kurikulumId && (
        <DaftarMataPelajaran
          items={mapel}
          selectedId={sp.mapelId}
          kurikulumId={sp.kurikulumId}
        />
      )}

      {sp.mapelId && sp.kurikulumId && (
        <DaftarFase
          items={fase}
          selectedId={sp.faseId}
          kurikulumId={sp.kurikulumId}
          mapelId={sp.mapelId}
        />
      )}

      {sp.mapelId && cp.length > 0 && (
        <DaftarCapaianPembelajaran
          items={cp}
          selectedId={sp.cpId}
          kurikulumId={sp.kurikulumId!}
          mapelId={sp.mapelId}
          faseId={sp.faseId}
        />
      )}

      {sp.mapelId && sp.cpId && (
        <DaftarTujuanPembelajaran
          items={tp}
          selectedId={sp.tpId}
          kurikulumId={sp.kurikulumId!}
          mapelId={sp.mapelId}
          faseId={sp.faseId}
          cpId={sp.cpId}
        />
      )}

      {sp.tpId && <DaftarAlurTujuanPembelajaran items={atp} />}
    </section>
  );
}
