import Link from "next/link";
import {
  BookOpen,
  CircleHelp,
  GraduationCap,
  Home,
  type LucideIcon,
} from "lucide-react";

import { NavAuth } from "@/components/nav-auth";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/panduan", label: "Panduan Penggunaan", icon: BookOpen },
  { href: "/bantuan", label: "Bantuan", icon: CircleHelp },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Langsung ke konten
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Beranda EduAdmin Pro Premium"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="text-base leading-tight">
              EduAdmin <span className="text-muted-foreground">Pro Premium</span>
            </span>
          </Link>

          <nav
            aria-label="Navigasi utama"
            className="ml-4 hidden flex-1 items-center gap-1 md:flex"
          >
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <NavAuth />
          </div>
        </div>
      </header>

      <main
        id="konten-utama"
        className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:pb-10"
      >
        {children}
      </main>

      <footer className="hidden border-t border-border py-6 text-sm text-muted-foreground md:block">
        <div className="mx-auto w-full max-w-6xl px-4">
          <p>
            © {new Date().getFullYear()} EduAdmin Pro Premium. Dibuat untuk Guru
            dan Satuan Pendidikan di Indonesia.
          </p>
        </div>
      </footer>

      <nav
        aria-label="Navigasi bawah"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-background md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
