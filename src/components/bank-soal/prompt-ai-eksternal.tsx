"use client";

import { useMemo, useReducer } from "react";

import { Button } from "@/components/ui/button";
import type { JenisButirSoal } from "@/db/queries/bank-soal";
import { LABEL_JENIS_BUTIR, PILIHAN_JENIS_BUTIR } from "./jenis-butir";

const SKEMA_PER_JENIS: Record<JenisButirSoal, string> = {
  pg: '{"mataPelajaranId":"<wajib>","tingkatId":"<opsional, string atau null>","jenis":"pg","pertanyaan":"...","pilihan":{"A":"...","B":"...","C":"...","D":"..."},"kunciJawaban":"A","pembahasan":"..."}',
  essay:
    '{"mataPelajaranId":"<wajib>","tingkatId":"<opsional, string atau null>","jenis":"essay","pertanyaan":"...","pilihan":null,"kunciJawaban":"<rubrik>","pembahasan":"..."}',
  isian:
    '{"mataPelajaranId":"<wajib>","tingkatId":"<opsional, string atau null>","jenis":"isian","pertanyaan":"...","pilihan":null,"kunciJawaban":"<jawaban singkat>","pembahasan":"..."}',
  jodohkan:
    '{"mataPelajaranId":"<wajib>","tingkatId":"<opsional, string atau null>","jenis":"jodohkan","pertanyaan":"...","pilihan":{"pernyataan":["..."],"pasangan":["..."]},"kunciJawaban":"1-B,2-A","pembahasan":"..."}',
  benar_salah:
    '{"mataPelajaranId":"<wajib>","tingkatId":"<opsional, string atau null>","jenis":"benar_salah","pertanyaan":"...","pilihan":null,"kunciJawaban":"Benar"|"Salah","pembahasan":"..."}',
};

type StatePromptAi = {
  mapelId: string;
  tingkatId: string;
  jenis: JenisButirSoal;
  jumlah: number;
  tersalin: boolean;
};

export function PromptAiEksternal({
  mataPelajaran,
  tingkat,
}: {
  mataPelajaran: readonly { id: string; nama: string }[];
  tingkat: readonly { id: string; nama: string }[];
}) {
  const [state, dispatch] = useReducer(
    (current: StatePromptAi, patch: Partial<StatePromptAi>) => ({
      ...current,
      ...patch,
    }),
    null,
    () => ({
      mapelId: mataPelajaran[0]?.id ?? "",
      tingkatId: tingkat[0]?.id ?? "",
      jenis: "pg" as JenisButirSoal,
      jumlah: 5,
      tersalin: false,
    })
  );

  const prompt = useMemo(() => {
    const mapel = mataPelajaran.find((item) => item.id === state.mapelId);
    const tingkatTerpilih = tingkat.find((item) => item.id === state.tingkatId);
    const namaMapel = mapel?.nama ?? "mata pelajaran yang dipilih";
    const namaTingkat = tingkatTerpilih?.nama ?? "tanpa tingkat";

    return `Anda adalah pembuat soal untuk mata pelajaran ${namaMapel} tingkat ${namaTingkat}.
Buat ${state.jumlah} butir soal jenis ${LABEL_JENIS_BUTIR[state.jenis]}. Untuk setiap butir, gunakan struktur JSON berikut:

${SKEMA_PER_JENIS[state.jenis]}

Kembalikan HANYA array JSON yang valid, tanpa komentar, tanpa markdown wrapper. Setiap elemen array harus memenuhi schema di atas.

Aturan:
- Bahasa Indonesia untuk semua konten
- Fakta faktual, bebas hak cipta
- JANGAN sertakan data pribadi Peserta Didik (NISN, nama, alamat, kontak wali)
- Tingkat kesulitan: sesuaikan dengan tingkat yang diminta
- Untuk pilihan ganda: kunci jawaban huruf kapital tunggal (A/B/C/D)
- Untuk benar_salah: kunci jawaban "Benar" atau "Salah"`;
  }, [mataPelajaran, state, tingkat]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl tracking-tight text-foreground">
          Generator Prompt
        </h3>
        <p className="text-xs text-muted-foreground">
          Atur konteks soal, lalu salin prompt untuk AI eksternal.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="ai-mapel" className="text-sm font-medium">
            Mata Pelajaran
          </label>
          <select
            id="ai-mapel"
            value={state.mapelId}
            onChange={(event) => dispatch({ mapelId: event.target.value })}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {mataPelajaran.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="ai-tingkat" className="text-sm font-medium">
            Tingkat
          </label>
          <select
            id="ai-tingkat"
            value={state.tingkatId}
            onChange={(event) => dispatch({ tingkatId: event.target.value })}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Tanpa Tingkat</option>
            {tingkat.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nama}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="ai-jenis" className="text-sm font-medium">
            Jenis
          </label>
          <select
            id="ai-jenis"
            value={state.jenis}
            onChange={(event) =>
              dispatch({ jenis: event.target.value as JenisButirSoal })
            }
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PILIHAN_JENIS_BUTIR.map(({ slug, label }) => (
              <option key={slug} value={slug}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="ai-jumlah" className="text-sm font-medium">
            Jumlah
          </label>
          <input
            id="ai-jumlah"
            type="number"
            min={1}
            max={50}
            value={state.jumlah}
            onChange={(event) => dispatch({ jumlah: Number(event.target.value) })}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed text-foreground">
        {prompt}
      </pre>
      <Button
        type="button"
        className="w-fit"
        onClick={async () => {
          await navigator.clipboard.writeText(prompt);
          dispatch({ tersalin: true });
          window.setTimeout(() => dispatch({ tersalin: false }), 2000);
        }}
      >
        {state.tersalin ? "Tersalin!" : "Salin Prompt"}
      </Button>
    </div>
  );
}
