"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import type { HasilImpor } from "@/app/dashboard/bank-soal/actions";
import { parseJsonTempel } from "@/lib/bank-soal/json-impor";

export type ServerAksiImpor = (
  prevState: HasilImpor | null,
  formData: FormData
) => Promise<HasilImpor>;

export function TempelJsonButirSoal({
  action,
}: {
  action: ServerAksiImpor;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        try {
          parseJsonTempel(jsonText);
          setError(null);
        } catch (parseError) {
          const detail =
            parseError instanceof Error
              ? parseError.message
              : "format tidak dikenal";
          setError(`JSON tidak valid: ${detail}`);
        }
      }}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-xl tracking-tight text-foreground">
          Tempel JSON Butir Soal
        </h3>
        <p className="text-xs text-muted-foreground">
          Tempel array JSON dari AI eksternal, lalu validasi dan impor.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="json-butir" className="text-sm font-medium">
          JSON Butir Soal
        </label>
        <textarea
          id="json-butir"
          name="jsonButir"
          rows={10}
          required
          value={jsonText}
          onChange={(event) => {
            setJsonText(event.target.value);
            if (error) setError(null);
          }}
          placeholder='[{"mataPelajaranId":"mp_...","jenis":"pg","pertanyaan":"...","pilihan":{"A":"...","B":"...","C":"...","D":"..."},"kunciJawaban":"A"}]'
          className="rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Mengimpor..." : "Validasi & Impor"}
      </Button>

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {state?.ok ? (
        <p className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
          Berhasil menyimpan {state.tersimpan} butir.
          {state.gagal > 0 ? ` ${state.gagal} butir gagal.` : ""}
        </p>
      ) : null}

      {state?.errors.length ? (
        <ul className="list-disc rounded-lg border border-border bg-muted/30 p-4 pl-6 text-xs text-muted-foreground">
          {state.errors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
