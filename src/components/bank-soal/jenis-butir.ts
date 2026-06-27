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
  { slug: "pg", label: LABEL_JENIS_BUTIR.pg },
  { slug: "essay", label: LABEL_JENIS_BUTIR.essay },
  { slug: "isian", label: LABEL_JENIS_BUTIR.isian },
  { slug: "jodohkan", label: LABEL_JENIS_BUTIR.jodohkan },
  { slug: "benar_salah", label: LABEL_JENIS_BUTIR.benar_salah },
];
