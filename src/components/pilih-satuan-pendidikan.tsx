import { Building2, ChevronRight } from "lucide-react";

import { pilihSatuanPendidikanAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { CardHover, PageReveal } from "@/components/motion";
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
    <section className="mx-auto flex w-full max-w-md flex-col gap-6">
      <PageReveal as="header" className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent">
          Keanggotaan
        </p>
        <h1 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">
          Pilih Satuan Pendidikan
        </h1>
        <p className="text-sm text-muted-foreground">
          Anda memiliki lebih dari satu Keanggotaan. Pilih satu Satuan
          Pendidikan Aktif untuk mulai bekerja.
        </p>
      </PageReveal>

      <PageReveal delay={2} className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3">
          {memberships.map((membership) => (
            <li key={membership.orgId}>
              <form
                action={pilihSatuanPendidikanAction}
                aria-label={`Pilih ${membership.orgName} sebagai Satuan Pendidikan aktif`}
              >
                <input type="hidden" name="orgId" value={membership.orgId} />
                <CardHover className="group overflow-hidden rounded-2xl border border-border bg-card shadow-warm transition-colors hover:border-accent/40 hover:shadow-warm-lg">
                  <Button
                    type="submit"
                    variant="ghost"
                    className="flex h-auto w-full items-center justify-between rounded-2xl bg-transparent py-4 pl-4 pr-4 hover:bg-transparent"
                    aria-label={`Pilih ${membership.orgName} (Peran: ${membership.roleSlug})`}
                  >
                    <span className="flex items-center gap-3 text-left">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
                        aria-hidden="true"
                      >
                        <Building2 className="h-5 w-5" />
                      </span>
                      <span className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">
                          {membership.orgName}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          Peran: {membership.roleSlug}
                        </span>
                      </span>
                    </span>
                    <ChevronRight
                      className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-accent"
                      aria-hidden="true"
                    />
                  </Button>
                </CardHover>
              </form>
            </li>
          ))}
        </ul>
      </PageReveal>
    </section>
  );
}
