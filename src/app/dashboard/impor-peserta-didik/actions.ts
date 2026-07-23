"use server";

// SECURITY (identity doc §12 — "hiding UI is not authorization"):
// This action re-evaluates `getAksesSaya().boleh("impor_peserta_didik:kelola")`
// SERVER-SIDE on every call. The Impor page may hide the form for non-admins,
// but a determined client can construct a `fetch` + `FormData` and POST directly.
// That POST MUST still throw — the action is the boundary, not the UI.
//
// SECURITY (identity doc §13 — "no global superuser"):
// `orgId` comes ONLY from `akses.membership.orgId` (the live WorkOS
// Keanggotaan). A tampered `tenantId` field in formData is deliberately NEVER
// read. Tenant scoping happens via `withTenant(db, orgId, ...)` which sets the
// RLS session GUC `app.tenant_id`.
//
// AC#5 (no silent overwrite): rows whose NISN/NIS collide with existing data
// are marked `perlu_koreksi` by the validator and are SKIPPED — never silently
// upserted. Only `status === 'valid'` rows are inserted.

import { inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import { buatPesertaDidikBatch } from "@/db/queries/peserta-didik";
import type { InputBuatPesertaDidik, JenisKelamin } from "@/db/queries/peserta-didik";
import { pesertaDidik } from "@/db/schema";
import { requireAksesAktif } from "@/lib/auth/akses-saya";
import { parseCsv } from "@/lib/impor/parse-csv";
import { validasiBatch } from "@/lib/impor/validasi-peserta-didik";

const REVALIDATE_TARGET = "/dashboard/impor-peserta-didik";
const MAX_CSV_BYTES = 2 * 1024 * 1024;

/**
 * BUGS-06: collect the distinct, non-empty NISN/NIS values present in the
 * parsed CSV batch. Only these candidates are queried against the tenant —
 * replacing the previous `listPesertaDidik(tx, 100000)` full-table scan that
 * loaded up to 100k full rows (all columns) just to extract two columns for
 * duplicate detection.
 */
function kandidatDuplikat(
  baris: readonly { readonly nisn?: string; readonly nis?: string }[]
): { nisn: string[]; nis: string[] } {
  const nisnSet = new Set<string>();
  const nisSet = new Set<string>();
  for (const row of baris) {
    if (row.nisn) nisnSet.add(row.nisn);
    if (row.nis) nisSet.add(row.nis);
  }
  return { nisn: [...nisnSet], nis: [...nisSet] };
}

/**
 * Impor Peserta Didik via CSV (AC#1–#5). Reads a CSV `file` field, parses it,
 * validates each row (including duplicate detection against the active tenant's
 * existing NISN/NIS), inserts the `valid` rows, audits the outcome, and throws a
 * summary when any row was hard-invalid (`tidak_valid`). Duplicate-flagged rows
 * (`perlu_koreksi`) are skipped, NOT overwritten (AC#5).
 *
 * Requires the `impor_peserta_didik:kelola` izin. Tenant scope is derived ONLY
 * from `akses.membership.orgId` — never from formData (§13).
 */
export async function imporPesertaDidikAction(formData: FormData): Promise<void> {
  const akses = await requireAksesAktif("impor_peserta_didik:kelola", "Anda tidak memiliki izin untuk mengimpor Peserta Didik.");

  const fileField = formData.get("file");
  if (fileField === null) {
    throw new Error("Berkas CSV wajib diisi.");
  }
  if (typeof fileField !== "string" && fileField.size > MAX_CSV_BYTES) {
    throw new Error("Berkas CSV melebihi batas ukuran maksimum (2 MB).");
  }
  const content =
    typeof fileField === "string" ? fileField : await fileField.text();

  if (content.length > MAX_CSV_BYTES) {
    throw new Error("Berkas CSV melebihi batas ukuran maksimum (2 MB).");
  }

  // parseCsv throws on malformed CSV / missing header — propagate to the user.
  const baris = parseCsv(content);

  const { db } = getDb();
  const ringkasan = await withTenant(db, akses.membership.orgId, async (tx) => {
    // BUGS-06: targeted duplicate probe. Previously this loaded up to 100k
    // full peserta_didik rows via listPesertaDidik(tx, 100000) just to extract
    // two nullable columns. Now we project only nisn/nis AND restrict to the
    // distinct candidate values actually present in the import batch — so a
    // 50-row import probes at most 50 NISN + 50 NIS values against an indexed
    // lookup, never a full tenant scan. When the batch has no nisn/nis at all,
    // the query is skipped entirely (nothing can collide).
    const kandidat = kandidatDuplikat(baris);
    let existingNisn: string[] = [];
    let existingNis: string[] = [];
    if (kandidat.nisn.length > 0 || kandidat.nis.length > 0) {
      // `or` filters out undefined args, so passing undefined for the empty
      // side collapses to just the defined predicate.
      const rows = await tx
        .select({ nisn: pesertaDidik.nisn, nis: pesertaDidik.nis })
        .from(pesertaDidik)
        .where(
          or(
            kandidat.nisn.length > 0
              ? inArray(pesertaDidik.nisn, kandidat.nisn)
              : undefined,
            kandidat.nis.length > 0
              ? inArray(pesertaDidik.nis, kandidat.nis)
              : undefined,
          ),
        );
      existingNisn = rows
        .map((r) => r.nisn)
        .filter((v): v is string => v !== null);
      existingNis = rows
        .map((r) => r.nis)
        .filter((v): v is string => v !== null);
    }

    const hasil = validasiBatch(baris, existingNisn, existingNis);

    const validInputs: InputBuatPesertaDidik[] = [];
    let perluKoreksi = 0;
    let tidakValid = 0;
    for (const h of hasil) {
      if (h.status === "valid") {
        validInputs.push({
          nama: h.data.nama,
          nisn: h.data.nisn ?? null,
          nis: h.data.nis ?? null,
          tanggalLahir: h.data.tanggalLahir,
          jenisKelamin: h.data.jenisKelamin as JenisKelamin,
        });
      } else if (h.status === "perlu_koreksi") {
        perluKoreksi++;
      } else {
        tidakValid++;
      }
    }

    const created = await buatPesertaDidikBatch(tx, validInputs);
    const berhasil = created.length;

    await catatAudit(tx, {
      aktor: akses.userId,
      aksi: "impor_peserta_didik",
      beban: { total: baris.length, berhasil, perlu_koreksi: perluKoreksi, tidak_valid: tidakValid },
    });

    return { berhasil, perluKoreksi, tidakValid };
  });

  revalidatePath(REVALIDATE_TARGET);

  // Surface hard validation failures to the user AFTER the valid rows have
  // committed. Duplicate (perlu_koreksi) rows are softer and do not throw.
  if (ringkasan.tidakValid > 0) {
    throw new Error(
      `Impor selesai dengan ${ringkasan.tidakValid} baris tidak valid. ` +
        `${ringkasan.berhasil} baris berhasil.`
    );
  }
}
