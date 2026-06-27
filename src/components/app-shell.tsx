import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { DesktopNav, MobileTabBar } from "@/components/main-nav";
import { NavAuth } from "@/components/nav-auth";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-foreground focus:shadow-warm"
      >
        Langsung ke konten
      </a>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-md font-display text-base leading-tight tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Beranda EduAdmin Pro Premium"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-warm transition-transform group-hover:-rotate-3"
              aria-hidden="true"
            >
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="hidden sm:inline">
              EduAdmin{" "}
              <span className="text-accent">Pro Premium</span>
            </span>
            <span className="sm:hidden">EduAdmin</span>
          </Link>

          <DesktopNav />

          <div className="ml-auto flex items-center gap-2">
            <NavAuth />
          </div>
        </div>
      </header>

      <main
        id="konten-utama"
        className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-8 sm:px-6 md:pb-12 md:pt-12"
      >
        {children}
      </main>

      <footer className="hidden border-t border-border/60 py-6 text-sm text-muted-foreground md:block">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
          <p>
            © {new Date().getFullYear()} EduAdmin{" "}
            <span className="text-accent">Pro Premium</span>. Dibuat untuk Guru
            dan Satuan Pendidikan di Indonesia.
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.18em]">
            v0.1.0
          </p>
        </div>
      </footer>

      <MobileTabBar />
    </div>
  );
}
