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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Beban Mengajar Saya
        </h2>
        <DaftarBebanMengajar
          beban={beban}
          bolehKelola={false}
          // No destructive action in the guru context — read-only view.
          hapusAction={() => {}}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Wali Kelas Saya
        </h2>
        <DaftarWaliKelas
          wali={wali}
          bolehKelola={false}
          hapusAction={() => {}}
        />
      </div>
    </div>
  );
}
