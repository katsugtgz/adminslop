import { z } from "zod";

/**
 * Profil Satuan Pendidikan — official identity of the tenant school.
 * See CONTEXT.md (Profil) and issue #5.
 */
export const ProfilSatuanPendidikanSchema = z.object({
  nama: z.string().trim().min(1),
  npsn: z.string().trim().regex(/^\d{8}$/).max(8).optional(),
  jenjang: z.enum(["SD", "SMP", "SMA", "SMK", "MA"]),
  alamat: z.string().trim().optional(),
  namaKepala: z.string().trim().optional(),
  logoUrl: z
    .string()
    .trim()
    .url()
    .optional()
    .or(z.literal("")),
});

/**
 * Pengaturan Satuan Pendidikan — operational defaults for the tenant.
 * See CONTEXT.md (Pengaturan) and issue #5. MVP Preferensi Cetak is
 * limited to A4/F4 paper size (roadmap.md §Gate).
 */
export const PengaturanSatuanPendidikanSchema = z.object({
  tahunAjaran: z.string().trim().regex(/^\d{4}\/\d{4}$/),
  semester: z.enum(["ganjil", "genap"]),
  zonaWaktu: z.string().min(1).default("Asia/Jakarta"),
  cetakPaperSize: z.enum(["a4", "f4"]).default("a4"),
  cetakTampilkanLogo: z.boolean().default(true),
  cetakTampilkanHeader: z.boolean().default(true),
});

export type ProfilSatuanPendidikanInput = z.infer<
  typeof ProfilSatuanPendidikanSchema
>;
export type PengaturanSatuanPendidikanInput = z.infer<
  typeof PengaturanSatuanPendidikanSchema
>;
