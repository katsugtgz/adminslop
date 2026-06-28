import type { JenisPerangkatAjar } from "@/db/queries/perangkat-ajar";

/** Bahasa label for each {@linkcode JenisPerangkatAjar} slug. */
export const LABEL_JENIS: Record<JenisPerangkatAjar, string> = {
  modul_ajar: "Modul Ajar",
  rpp: "RPP",
  silabus: "Silabus",
  prota: "Prota",
  promes: "Promes",
};

/** Ordered select options (slug + Bahasa label) for the jenis selector. */
export const PILIHAN_JENIS: readonly {
  slug: JenisPerangkatAjar;
  label: string;
}[] = [
  ...(Object.keys(LABEL_JENIS) as JenisPerangkatAjar[]).map((slug) => ({
    slug,
    label: LABEL_JENIS[slug],
  })),
];
