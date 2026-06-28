import { BookOpen, CircleHelp, Home, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  shortLabel: string;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Beranda", icon: Home, shortLabel: "Beranda" },
  {
    href: "/panduan",
    label: "Panduan Penggunaan",
    icon: BookOpen,
    shortLabel: "Panduan",
  },
  { href: "/bantuan", label: "Bantuan", icon: CircleHelp, shortLabel: "Bantuan" },
];
