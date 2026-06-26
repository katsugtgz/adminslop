/**
 * Runtime validation schemas for the offline-sync draft envelope (Mode Offline
 * #21). Co-located with {@linkcode "./types"} — the TS interfaces are the
 * source of truth for the shape; these zod schemas are the SERVER-SIDE runtime
 * gate that replaces the prior unchecked `as DraftNilai` / `as DraftAbsensi`
 * casts in the sync route (security finding C14).
 *
 * Why parse at all: the sync endpoint receives an arbitrary JSON body over HTTP
 * (`await req.json()`). A hostile or buggy client can send any shape. Before
 * C14 the route cast the body with `as` and trusted field types — a non-numeric
 * `nilai` or unknown `status` enum would flow straight into the DB write. zod
 * throws `ZodError` on any deviation, which the route maps to a 400.
 *
 * Pure module (no I/O) — imported only by the server-side sync route + tests.
 */
import { z } from "zod";

import type { DraftAbsensi, DraftNilai } from "./types";

/** Closed vocabulary: the four valid status_kehadiran literals. */
const STATUS_KEHADIRAN = ["hadir", "izin", "sakit", "alpa"] as const;

/** Closed vocabulary: the two valid metode_input literals. */
const METODE_INPUT = ["manual", "qr"] as const;

/**
 * Schema for a pending Nilai Peserta Didik edit. `versi` is a positive integer
 * (the server row version the client last observed; 1 for brand-new rows).
 * `nilai` is any finite number (the schema `numeric` column stores it; the
 * domain range check is deferred to the DB).
 */
export const DraftNilaiSchema = z.object({
  id: z.string().min(1),
  penilaianId: z.string().min(1),
  pesertaDidikId: z.string().min(1),
  nilai: z.number(),
  catatan: z.string().optional(),
  versi: z.number().int().positive(),
  dibuatPada: z.string().min(1),
}) satisfies z.ZodType<DraftNilai>;

/**
 * Schema for a pending Absensi Harian edit. `tanggal` is a `YYYY-MM-DD` shape
 * (the schema `date` column rejects the rest server-side; this is the same
 * shape check the Absensi action uses). `status` and `metode` are the closed
 * vocabulary enums. `versi` is a positive integer.
 */
export const DraftAbsensiSchema = z.object({
  id: z.string().min(1),
  pesertaDidikId: z.string().min(1),
  rombonganBelajarId: z.string().min(1),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD"),
  status: z.enum(STATUS_KEHADIRAN),
  catatan: z.string().optional(),
  metode: z.enum(METODE_INPUT),
  versi: z.number().int().positive(),
  dibuatPada: z.string().min(1),
}) satisfies z.ZodType<DraftAbsensi>;
