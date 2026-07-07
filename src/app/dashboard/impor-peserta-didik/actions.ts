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

import { revalidatePath } from "next/cache";

import { catatAudit, getDb, withTenant } from "@/db/client";
import { buatPesertaDidik, listPesertaDidik } from "@/db/queries/peserta-didik";
import { getAksesSaya } from "@/lib/auth/akses-saya";
import { requireAuth } from "@/lib/auth/server";
import { parseCsv } from "@/lib/impor/parse-csv";
import { validasiBatch } from "@/lib/impor/validasi-peserta-didik";
import type { JenisKelamin } from "@/db/queries/peserta-didik";
import { requireFileSize, requireTextSize } from "@/lib/validation";

const REVALIDATE_TARGET = "/dashboard/impor-peserta-didik";
const MAX_CSV_BYTES = 1_000_000;

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
  await requireAuth();
  const akses = await getAksesSaya();
  if (akses.status !== "active") {
    throw new Error("Satuan Pendidikan Aktif belum dipilih.");
  }
  if (!akses.boleh("impor_peserta_didik:kelola").diizinkan) {
    throw new Error("Anda tidak memiliki izin untuk mengimpor Peserta Didik.");
  }

  const fileField = formData.get("file");
  if (fileField === null) {
    throw new Error("Berkas CSV wajib diisi.");
  }
  const content = requireTextSize(
    typeof fileField === "string"
      ? fileField
      : await requireFileSize(fileField, MAX_CSV_BYTES, "Berkas CSV maksimal 1 MB.").text(),
    MAX_CSV_BYTES,
    "Berkas CSV maksimal 1 MB."
  );

  // parseCsv throws on malformed CSV / missing header — propagate to the user.
  const baris = parseCsv(content);

  const { db } = getDb();
  const ringkasan = await withTenant(db, akses.membership.orgId, async (tx) => {
    const existing = await listPesertaDidik(tx);
    const existingNisn = existing
      .map((p) => p.nisn)
      .filter((v): v is string => v !== null);
    const existingNis = existing
      .map((p) => p.nis)
      .filter((v): v is string => v !== null);

    const hasil = validasiBatch(baris, existingNisn, existingNis);

    let berhasil = 0;
    let perluKoreksi = 0;
    let tidakValid = 0;
    for (const h of hasil) {
      if (h.status === "valid") {
        // react-doctor-disable-next-line async-await-in-loop: serial: AC#5 no-silent-overwrite requires row-by-row validation, react-doctor/async-await-in-loop
        await buatPesertaDidik(tx, {
          nama: h.data.nama,
          nisn: h.data.nisn ?? null,
          nis: h.data.nis ?? null,
          tanggalLahir: h.data.tanggalLahir,
          jenisKelamin: h.data.jenisKelamin as JenisKelamin,
        });
        berhasil++;
      } else if (h.status === "perlu_koreksi") {
        perluKoreksi++;
      } else {
        tidakValid++;
      }
    }

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
