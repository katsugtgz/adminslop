import type { BarisBebanMengajar } from "./daftar-beban-mengajar";
import { DaftarBebanMengajar } from "./daftar-beban-mengajar";
import type { BarisWaliKelas } from "./daftar-wali-kelas";
import { DaftarWaliKelas } from "./daftar-wali-kelas";

/**
 * AC#4 guru context — read-only "my" view. A guru with a linked PTK sees ONLY
 * their own Beban Mengajar ("Beban Mengajar Saya") + the Rombongan Belajar they
 * are the wali of ("Wali Kelas Saya") for the active period. NO management
 * forms: the data is sourced via `getBebanMengajarSaya` / `getWaliKelasSaya`
 * (ptkId-scoped) and rendered read-only. The T5 actions remain the
 * authoritative authorization boundary (identity doc §12).
 *
 * `beban` / `wali` are enriched view rows (display names already resolved by the
 * page) so this component never touches tenant ids or the active period.
 */
export function KonteksGuru({
  beban,
  wali,
}: {
  beban: readonly BarisBebanMengajar[];
  wali: readonly BarisWaliKelas[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            01 — Beban Saya
          </p>
          <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
            Beban Mengajar Saya
          </h2>
        </div>
        <DaftarBebanMengajar
          beban={beban}
          bolehKelola={false}
          // No destructive action in the guru context — read-only view.
          hapusAction={() => {}}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            02 — Wali Kelas Saya
          </p>
          <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
            Wali Kelas Saya
          </h2>
        </div>
        <DaftarWaliKelas
          wali={wali}
          bolehKelola={false}
          hapusAction={() => {}}
        />
      </div>
    </div>
  );
}
