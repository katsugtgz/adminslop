import type { JenisButirSoal } from "@/db/queries/bank-soal";

/** Bahasa label for each {@linkcode JenisButirSoal} slug. */
export const LABEL_JENIS_BUTIR: Record<JenisButirSoal, string> = {
  pg: "Pilihan Ganda",
  essay: "Essay",
  isian: "Isian",
  jodohkan: "Jodohkan",
  benar_salah: "Benar/Salah",
};

/** Ordered select options (slug + Bahasa label). */
export const PILIHAN_JENIS_BUTIR: readonly {
  slug: JenisButirSoal;
  label: string;
}[] = [
  ...(Object.keys(LABEL_JENIS_BUTIR) as JenisButirSoal[]).map((slug) => ({
    slug,
    label: LABEL_JENIS_BUTIR[slug],
  })),
];
