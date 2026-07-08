import { Sparkles } from "lucide-react";

import { FormSatuanPendidikanBaru } from "@/components/onboarding/form-satuan-pendidikan-baru";
import { PageReveal } from "@/components/motion";
import { getAuthenticatedUserId } from "@/lib/auth/server";
import { listMembershipsForUser } from "@/lib/auth/membership";
import { type StyleWithVars } from "@/lib/utils";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Onboarding route (identity doc §14, Phase 2). Shown to an authenticated
 * Pengguna with NO Keanggotaan — they create their first Satuan Pendidikan
 * here. A Pengguna who already belongs to at least one org is redirected to
 * `/dashboard` (onboarding is a one-time provisioning step, not a second
 * org-creation surface).
 */
export default async function OnboardingPage() {
  const userId = await getAuthenticatedUserId();

  // No session → the AuthKit middleware redirects to sign-in before this
  // renders in production; the guard is defense-in-depth for direct invocation.
  if (!userId) {
    redirect("/dashboard");
  }

  const memberships = await listMembershipsForUser(userId);
  if (memberships.length > 0) {
    redirect("/dashboard");
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-8 md:gap-10">
      <PageReveal
        as="header"
        className="bg-grain relative isolate overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div
          aria-hidden="true"
          className="hero-glow pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={
            { "--glow-opacity": 0.35, "--glow-extent": "70%" } as StyleWithVars
          }
        />
        <div className="relative flex flex-col gap-3">
          <p className="inline-flex items-center gap-2 eyebrow-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Selamat Datang
          </p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            Buat Satuan Pendidikan
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Mulai dengan membuat Satuan Pendidikan pertama Anda. Anda akan
            menjadi Admin Satuan Pendidikan dan dapat mengelola seluruh data
            sekolah setelahnya.
          </p>
        </div>
      </PageReveal>

      <PageReveal
        delay={2}
        className="flex flex-col gap-5 rounded-2xl border border-border/60 bg-card p-6 text-card-foreground shadow-warm md:p-8"
      >
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
            01 — Identitas
          </p>
          <h2 className="font-display text-xl tracking-tight text-foreground sm:text-2xl">
            Data Satuan Pendidikan
          </h2>
        </div>
        <FormSatuanPendidikanBaru />
      </PageReveal>
    </section>
  );
}
