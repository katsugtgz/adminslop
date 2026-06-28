import type { JenisPermintaanAi } from "@/db/queries/permintaan-ai";

/**
 * Bahasa label for each {@linkcode JenisPermintaanAi} slug. Shared with
 * `DaftarPermintaan` so the select options and the row labels stay in sync.
 */
export const LABEL_JENIS: Record<JenisPermintaanAi, string> = {
  deskripsi_cp: "Deskripsi Capaian Pembelajaran",
  deskripsi_tp: "Deskripsi Tujuan Pembelajaran",
  deskripsi_atp: "Deskripsi Alur Tujuan Pembelajaran",
  narasi_raport: "Narasi Raport",
};

/** Ordered select options (slug + Bahasa label) rendered by the form. */
export const PILIHAN_JENIS: readonly { slug: JenisPermintaanAi; label: string }[] = [
  ...(Object.keys(LABEL_JENIS) as JenisPermintaanAi[]).map((slug) => ({
    slug,
    label: LABEL_JENIS[slug],
  })),
];
