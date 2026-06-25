import { Building2, ChevronRight } from "lucide-react";

import { pilihSatuanPendidikanAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import type { Membership } from "@/lib/auth/server";

/**
 * Chooser shown when a Pengguna has multiple Keanggotaan and has not yet picked
 * an active Satuan Pendidikan. Each choice posts to a server action that
 * re-validates membership before binding the tenant.
 */
export function PilihSatuanPendidikan({
  memberships,
}: {
  memberships: Membership[];
}) {
  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight">Pilih Satuan Pendidikan</h1>
        <p className="text-sm text-muted-foreground">
          Anda memiliki lebih dari satu Keanggotaan. Pilih satu Satuan
          Pendidikan Aktif untuk mulai bekerja.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {memberships.map((membership) => (
          <li key={membership.orgId}>
            <form action={pilihSatuanPendidikanAction}>
              <input type="hidden" name="orgId" value={membership.orgId} />
              <Button
                type="submit"
                variant="outline"
                className="flex h-auto w-full items-center justify-between py-4"
              >
                <span className="flex items-center gap-3 text-left">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"
                    aria-hidden="true"
                  >
                    <Building2 className="h-5 w-5" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">
                      {membership.orgName}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      Peran: {membership.roleSlug}
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
