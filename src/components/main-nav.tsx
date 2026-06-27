"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PRIMARY_NAV } from "@/components/main-nav-items";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DesktopNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Navigasi utama"
      className="ml-6 hidden flex-1 items-center gap-1 md:flex"
    >
      {PRIMARY_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group relative inline-flex h-11 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "text-foreground"
                : "text-foreground/70 hover:bg-accent/10 hover:text-accent"
            }`}
          >
            {item.label}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent transition-transform duration-200 ${
                active
                  ? "scale-x-100"
                  : "scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileTabBar() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Navigasi bawah"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {PRIMARY_NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              active
                ? "text-accent"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0 h-0.5 w-8 rounded-full bg-accent transition-transform duration-200 ${
                active ? "scale-x-100" : "scale-x-0"
              }`}
            />
            <Icon className="h-5 w-5" aria-hidden="true" />
            {item.shortLabel}
          </Link>
        );
      })}
    </nav>
  );
}
