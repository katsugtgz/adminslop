import { Button } from "@/components/ui/button";
import type { PenggunaDenganPtk } from "@/db/queries/akses";
import type { Ptk } from "@/db/schema";
import type { IzinSlug } from "@/lib/auth/types";

import type { ServerAksi } from "./form-ptk-baru";

/**
 * The closed IzinSlug vocabulary (single source of truth for the checkbox
 * matrix). Matches the list in `actions.ts`.
 */
const DAFTAR_IZIN: readonly IzinSlug[] = [
  "ptk:baca",
  "ptk:buat",
  "ptk:hapus",
  "akses:baca",
  "akses:kelola",
];

/** Bahasa label for an IzinSlug. */
function labelIzin(slug: IzinSlug): string {
  switch (slug) {
    case "ptk:baca":
      return "Baca PTK";
    case "ptk:buat":
      return "Buat PTK";
    case "ptk:hapus":
      return "Hapus PTK";
    case "akses:baca":
      return "Baca Akses";
    case "akses:kelola":
      return "Kelola Akses";
  }
}

/** Snapshot of a pengguna's izin + pembatasan slugs for display. */
export interface AksesPenggunaView {
  readonly izin: readonly string[];
  readonly pembatasan: readonly string[];
}

// --- small inline forms (each posts ONE slug to its action) -----------------

/**
 * Link (or unlink) a pengguna to a PTK. The select defaults to the current link
 * or "Tidak terhubung"; submitting an empty value unlinks (action treats empty
 * ptkId as null).
 */
export function FormLinkPtk({
  penggunaId,
  ptks,
  currentPtkId,
  action,
}: {
  penggunaId: string;
  ptks: readonly Ptk[];
  currentPtkId: string | null;
  action: ServerAksi;
}) {
  return (
    <form
      action={action}
      aria-label="Tautan PTK"
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="penggunaId" value={penggunaId} />
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`link-${penggunaId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Tautan PTK
        </label>
        <select
          id={`link-${penggunaId}`}
          name="ptkId"
          defaultValue={currentPtkId ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Tidak terhubung</option>
          {ptks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" variant="outline">
        Simpan
      </Button>
    </form>
  );
}

/**
 * Izin grant matrix — one server form per IzinSlug. Each form carries a hidden
 * `slug`; the `aktif` checkbox toggles the grant (action reads
 * `formData.get("aktif") === "on"`).
 */
export function FormAturIzin({
  penggunaId,
  izin,
  action,
}: {
  penggunaId: string;
  izin: readonly string[];
  action: ServerAksi;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Izin Akses</legend>
      {DAFTAR_IZIN.map((slug) => (
        <form
          key={slug}
          action={action}
          className="flex items-center gap-2"
          aria-label={`Izin ${slug}`}
        >
          <input type="hidden" name="penggunaId" value={penggunaId} />
          <input type="hidden" name="slug" value={slug} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="aktif"
              defaultChecked={izin.includes(slug)}
              aria-label={`izin-${slug}`}
              className="h-4 w-4 rounded border-input"
            />
            {labelIzin(slug)}
          </label>
          <Button type="submit" size="sm" variant="ghost">
            Simpan
          </Button>
        </form>
      ))}
    </fieldset>
  );
}

/**
 * Pembatasan matrix — one server form per IzinSlug, each carrying an optional
 * `alasan`. Mirrors {@linkcode FormAturIzin}; the hard-deny always wins
 * (identity doc §13).
 */
export function FormAturPembatasan({
  penggunaId,
  pembatasan,
  action,
}: {
  penggunaId: string;
  pembatasan: readonly string[];
  action: ServerAksi;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Pembatasan Akses</legend>
      {DAFTAR_IZIN.map((slug) => (
        <form
          key={slug}
          action={action}
          className="flex flex-wrap items-center gap-2"
          aria-label={`Pembatasan ${slug}`}
        >
          <input type="hidden" name="penggunaId" value={penggunaId} />
          <input type="hidden" name="slug" value={slug} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="aktif"
              defaultChecked={pembatasan.includes(slug)}
              aria-label={`pembatasan-${slug}`}
              className="h-4 w-4 rounded border-input"
            />
            {labelIzin(slug)}
          </label>
          <input
            type="text"
            name="alasan"
            placeholder="Alasan"
            className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
          />
          <Button type="submit" size="sm" variant="ghost">
            Simpan
          </Button>
        </form>
      ))}
    </fieldset>
  );
}

// --- the list ---------------------------------------------------------------

/**
 * Read-only or manageable list of Pengguna in the active Satuan Pendidikan.
 * Shows userId, peranAkses, and the linked PTK name (or "Tidak terhubung").
 * When `bolehKelola`, renders the link / izin / pembatasan management forms per
 * pengguna; otherwise purely informational (kepala_sekolah).
 */
export function DaftarPengguna({
  penggunas,
  bolehKelola,
  linkAction,
  ptks,
  aksesMap,
  aturIzinAction,
  aturPembatasanAction,
}: {
  penggunas: readonly PenggunaDenganPtk[];
  bolehKelola: boolean;
  linkAction: ServerAksi;
  ptks: readonly Ptk[];
  aksesMap: ReadonlyMap<string, AksesPenggunaView>;
  aturIzinAction: ServerAksi;
  aturPembatasanAction: ServerAksi;
}) {
  if (penggunas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        Belum ada Pengguna.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {penggunas.map((pengguna) => {
        const akses = aksesMap.get(pengguna.id) ?? { izin: [], pembatasan: [] };
        return (
          <li
            key={pengguna.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">
                {pengguna.nama ? pengguna.nama : pengguna.userId}
              </span>
              <span className="text-xs text-muted-foreground">
                Peran Akses: {pengguna.peranAkses}
              </span>
              <span className="text-xs text-muted-foreground">
                Tautan PTK:{" "}
                {pengguna.ptk ? pengguna.ptk.nama : "Tidak terhubung"}
              </span>
            </div>

            {bolehKelola && (
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <FormLinkPtk
                  penggunaId={pengguna.id}
                  ptks={ptks}
                  currentPtkId={pengguna.ptkId}
                  action={linkAction}
                />
                <FormAturIzin
                  penggunaId={pengguna.id}
                  izin={akses.izin}
                  action={aturIzinAction}
                />
                <FormAturPembatasan
                  penggunaId={pengguna.id}
                  pembatasan={akses.pembatasan}
                  action={aturPembatasanAction}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
