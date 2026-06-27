import { Button } from "@/components/ui/button";
import type { JenisPerangkatAjar } from "@/db/queries/perangkat-ajar";
import type { MataPelajaran, Tingkat } from "@/db/schema";

/** A server action reference — `(formData) => Promise<void>`. */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

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

/**
 * Form to create a Perangkat Ajar. Server-rendered only; posts to
 * `buatPerangkatAjarAction`. AC#1/AC#4: `jenis` is the leading field and drives
 * the document type. The action resolves Tahun Ajaran + Semester server-side, so
 * the form does NOT carry them (identity doc §13 — never trust client period).
 * `drafAiId` is optional — when set the doc is AI-assisted (AC#3: status becomes
 * 'menunggu', NOT resmi until verified).
 */
export function FormPerangkatAjar({
  action,
  daftarMapel,
  daftarTingkat,
}: {
  action: ServerAksi;
  daftarMapel: readonly MataPelajaran[];
  daftarTingkat: readonly Tingkat[];
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl tracking-tight text-foreground">
          Buat Perangkat Ajar
        </h2>
        <p className="text-xs text-muted-foreground">
          Dokumen mengajar per Jenis. Tahun Ajaran dan Semester aktif diisi
          otomatis.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pa-jenis" className="text-sm font-medium">
          Jenis
        </label>
        <select
          id="pa-jenis"
          name="jenis"
          defaultValue="modul_ajar"
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {PILIHAN_JENIS.map(({ slug, label }) => (
            <option key={slug} value={slug}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pa-mapel" className="text-sm font-medium">
          Mata Pelajaran
        </label>
        <select
          id="pa-mapel"
          name="mataPelajaranId"
          defaultValue=""
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Pilih Mata Pelajaran
          </option>
          {daftarMapel.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pa-tingkat" className="text-sm font-medium">
          Tingkat
        </label>
        <select
          id="pa-tingkat"
          name="tingkatId"
          defaultValue=""
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">
            Tanpa Tingkat
          </option>
          {daftarTingkat.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pa-judul" className="text-sm font-medium">
          Judul
        </label>
        <input
          id="pa-judul"
          name="judul"
          type="text"
          required
          placeholder="Judul Perangkat Ajar"
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pa-konten" className="text-sm font-medium">
          Konten
        </label>
        <textarea
          id="pa-konten"
          name="konten"
          rows={4}
          placeholder='{"tujuan":"...","langkah":[]}'
          className="rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">
          Opsional — objek JSON sebagai isi dokumen.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pa-draf" className="text-sm font-medium">
          ID Draf AI (opsional)
        </label>
        <input
          id="pa-draf"
          name="drafAiId"
          type="text"
          placeholder="uuid draf_ai bila dibantu AI"
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">
          Bila diisi, dokumen ditandai menunggu Verifikasi Dokumen AI.
        </span>
      </div>

      <Button type="submit" className="w-fit">
        Simpan Perangkat Ajar
      </Button>
    </form>
  );
}
