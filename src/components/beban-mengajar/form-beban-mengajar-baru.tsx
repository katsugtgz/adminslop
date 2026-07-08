import { Button } from "@/components/ui/button";
import type { MataPelajaran, Ptk, RombonganBelajar, Tingkat } from "@/db/schema";

/**
 * A server action reference — `(formData) => Promise<void>`. Plain server forms
 * post directly to this; no client hooks, no client validation (the T5 actions
 * are the authoritative gate — identity doc §12).
 */
export type ServerAksi = (formData: FormData) => Promise<void> | void;

/**
 * Form to add a new Beban Mengajar (teaching load). Server-rendered only; posts
 * to `simpanBebanMengajarBaruAction`. AC#2 (XOR): the target is EITHER a
 * Rombongan Belajar OR a Tingkat — the action validates exactly-one server-side;
 * the helper text tells the user the rule. Rendered only when
 * `boleh("beban_mengajar:buat")` (admin / dev) — the action re-checks.
 *
 * NO `"use client"`: the two target selects are plain optional `<select>`s; the
 * XOR is enforced authoritatively by the server action (identity doc §12).
 */
export function FormBebanMengajarBaru({
  action,
  ptks,
  mapel,
  rombels,
  tingkats,
}: {
  action: ServerAksi;
  ptks: readonly Ptk[];
  mapel: readonly MataPelajaran[];
  rombels: readonly RombonganBelajar[];
  tingkats: readonly Tingkat[];
}) {
  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-warm"
    >
      <div className="flex flex-col gap-1">
        <p className="eyebrow-accent">
          Form
        </p>
        <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
          Tambah Beban Mengajar
        </h2>
        <p className="text-xs text-muted-foreground">
          Tambah Beban Mengajar untuk periode Tahun Ajaran + Semester aktif.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="beban-ptk" className="text-sm font-medium">
            Guru/PTK
          </label>
          <select
            id="beban-ptk"
            name="ptkId"
            required
            defaultValue=""
            className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              — Pilih Guru/PTK —
            </option>
            {ptks.map((ptk) => (
              <option key={ptk.id} value={ptk.id}>
                {ptk.nama}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="beban-mapel" className="text-sm font-medium">
            Mata Pelajaran
          </label>
          <select
            id="beban-mapel"
            name="mataPelajaranId"
            required
            defaultValue=""
            className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="" disabled>
              — Pilih Mata Pelajaran —
            </option>
            {mapel.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="beban-rombel" className="text-sm font-medium">
            Rombongan Belajar
          </label>
          <select
            id="beban-rombel"
            name="rombonganBelajarId"
            defaultValue=""
            className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Kosongkan bila memilih Tingkat —</option>
            {rombels.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nama}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="beban-tingkat" className="text-sm font-medium">
            Tingkat
          </label>
          <select
            id="beban-tingkat"
            name="tingkatId"
            defaultValue=""
            className="h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Kosongkan bila memilih Rombongan Belajar —</option>
            {tingkats.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nama}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Pilih salah satu: Rombongan Belajar atau Tingkat.
      </p>

      <Button type="submit" className="w-fit">
        Tambah Beban Mengajar
      </Button>
    </form>
  );
}
