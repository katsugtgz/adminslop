import { z } from "zod";

/**
 * Form Onboarding Satuan Pendidikan — self-service creation flow (identity
 * doc §14, implemented in Phase 2). An authenticated Pengguna with NO existing
 * Keanggotaan creates their first Satuan Pendidikan here. The resulting
 * WorkOS Organization id becomes the tenant id (sync invariant:
 * `satuan_pendidikan.id === WorkOS org.id`).
 *
 * `jenjang` covers the full Indonesian schooling ladder, including Madrasah
 * equivalents (MI/MTs/MA), which are valid at the creation point even though
 * the narrower Profil editor (`pengaturan/schemas.ts`) only exposes the
 * non-Madrasah subset today.
 */
export const OnboardingSatuanPendidikanSchema = z.object({
  nama: z.string().trim().min(3, "Nama Satuan Pendidikan minimal 3 karakter."),
  jenjang: z.enum(["SD", "SMP", "SMA", "SMK", "MI", "MTs", "MA"]),
  alamat: z.string().trim().optional(),
});

export type OnboardingSatuanPendidikanInput = z.infer<
  typeof OnboardingSatuanPendidikanSchema
>;

/**
 * Result returned to the client form. On success the action redirects (so the
 * client never observes `ok: true` — the redirect navigates away first). Only
 * error/invalid outcomes surface here for inline display.
 */
export interface HasilOnboarding {
  ok: false;
  error: string;
}
