"use client";

import { useActionState } from "react";

import { buatSatuanPendidikanBaruAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { inputVariants } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Jenjang options spanning the full Indonesian schooling ladder, including
 * Madrasah equivalents (MI = SD, MTs = SMP, MA = SMA/SMK). Rendered as a
 * native `<select>` per the components/AGENTS.md note that a dedicated Select
 * primitive is deferred; raw selects reuse `inputVariants()` for consistent
 * field chrome.
 */
const JENJANG_OPTIONS = [
  { value: "SD", label: "SD" },
  { value: "MI", label: "MI (Madrasah Ibtidaiyah)" },
  { value: "SMP", label: "SMP" },
  { value: "MTs", label: "MTs (Madrasah Tsanawiyah)" },
  { value: "SMA", label: "SMA" },
  { value: "SMK", label: "SMK" },
  { value: "MA", label: "MA (Madrasah Aliyah)" },
] as const;

/**
 * Form Onboarding Satuan Pendidikan — the self-service creation surface
 * (identity doc §14). Posts to {@linkcode buatSatuanPendidikanBaruAction};
 * on success the action redirects to `/dashboard` so this component only ever
 * renders an inline error on failure. The pending state disables the submit
 * control so a double-submit cannot provision two orgs.
 */
export function FormSatuanPendidikanBaru() {
  const [state, formAction, pending] = useActionState(
    buatSatuanPendidikanBaruAction,
    null,
  );

  const fieldChrome = cn(inputVariants(), "w-full transition-colors");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="onboarding-nama" className="text-sm font-medium">
          Nama Satuan Pendidikan
        </label>
        <input
          id="onboarding-nama"
          name="nama"
          type="text"
          required
          minLength={3}
          autoComplete="organization"
          disabled={pending}
          placeholder="cth. SMP Negeri 1 Nusantara"
          className={fieldChrome}
        />
        <p className="text-xs text-muted-foreground">
          Nama resmi sekolah/madrasah Anda.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onboarding-jenjang" className="text-sm font-medium">
          Jenjang
        </label>
        <select
          id="onboarding-jenjang"
          name="jenjang"
          required
          defaultValue=""
          disabled={pending}
          className={fieldChrome}
        >
          <option value="" disabled>
            Pilih Jenjang
          </option>
          {JENJANG_OPTIONS.map((j) => (
            <option key={j.value} value={j.value}>
              {j.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onboarding-alamat" className="text-sm font-medium">
          Alamat
        </label>
        <textarea
          id="onboarding-alamat"
          name="alamat"
          rows={3}
          disabled={pending}
          autoComplete="street-address"
          placeholder="Jl. Pendidikan No. 1, Kota, Provinsi"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">Opsional.</p>
      </div>

      <Button type="submit" disabled={pending} className="w-full sm:w-fit">
        {pending ? "Membuat Satuan Pendidikan…" : "Buat Satuan Pendidikan"}
      </Button>

      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
