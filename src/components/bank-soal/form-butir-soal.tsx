import { Button } from "@/components/ui/button";
import type { JenisButirSoal } from "@/db/queries/bank-soal";

/** Server action reference — `(formData) => Promise<void>`. */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

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

/**
 * Form to create a Butir Soal. Server-rendered only; posts to
 * `buatButirSoalAction`. `mataPelajaranId` + `tahunAjaranId` selects are
 * populated by the page. The page renders this only when
 * `boleh("bank_soal:buat")` (guru / admin / dev) — the action re-checks
 * server-side.
 */
export function FormButirSoal({
  action,
  mataPelajaran,
  tingkat,
  drafAiId,
}: {
  action: ServerAksi;
  mataPelajaran: readonly { id: string; nama: string }[];
  tingkat: readonly { id: string; nama: string }[];
  /** When set, the form links the new butir to this verified Draf AI. */
  drafAiId?: string | null;
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl tracking-tight text-foreground">
          Buat Butir Soal
        </h2>
        <p className="text-xs text-muted-foreground">
          Butir Soal dapat digunakan ulang lintas Paket Soal.
        </p>
      </div>

      {drafAiId ? (
        <input type="hidden" name="drafAiId" value={drafAiId} />
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="butir-mapel" className="text-sm font-medium">
          Mata Pelajaran
        </label>
        <select
          id="butir-mapel"
          name="mataPelajaranId"
          defaultValue=""
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Pilih Mata Pelajaran
          </option>
          {mataPelajaran.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="butir-tingkat" className="text-sm font-medium">
          Tingkat (opsional)
        </label>
        <select
          id="butir-tingkat"
          name="tingkatId"
          defaultValue=""
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Tanpa Tingkat</option>
          {tingkat.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="butir-jenis" className="text-sm font-medium">
          Jenis
        </label>
        <select
          id="butir-jenis"
          name="jenis"
          defaultValue="pg"
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {PILIHAN_JENIS_BUTIR.map(({ slug, label }) => (
            <option key={slug} value={slug}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="butir-pertanyaan" className="text-sm font-medium">
          Pertanyaan
        </label>
        <textarea
          id="butir-pertanyaan"
          name="pertanyaan"
          rows={3}
          required
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="butir-pilihan" className="text-sm font-medium">
          Pilihan (JSON, untuk Pilihan Ganda)
        </label>
        <textarea
          id="butir-pilihan"
          name="pilihan"
          rows={3}
          placeholder='{"A":"...","B":"...","C":"...","D":"..."}'
          className="rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground">
          Opsional — objek JSON pilihan jawaban.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="butir-kunci" className="text-sm font-medium">
          Kunci Jawaban
        </label>
        <input
          id="butir-kunci"
          name="kunciJawaban"
          type="text"
          required
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="butir-pembahasan" className="text-sm font-medium">
          Pembahasan (opsional)
        </label>
        <textarea
          id="butir-pembahasan"
          name="pembahasan"
          rows={3}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit">
        Simpan Butir Soal
      </Button>
    </form>
  );
}
