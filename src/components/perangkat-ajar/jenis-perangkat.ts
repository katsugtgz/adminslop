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
  { slug: "modul_ajar", label: LABEL_JENIS.modul_ajar },
  { slug: "rpp", label: LABEL_JENIS.rpp },
  { slug: "silabus", label: LABEL_JENIS.silabus },
  { slug: "prota", label: LABEL_JENIS.prota },
  { slug: "promes", label: LABEL_JENIS.promes },
];
