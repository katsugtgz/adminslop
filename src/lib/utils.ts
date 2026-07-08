import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { CSSProperties } from "react";

/** Tailwind class merge helper (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** CSSProperties with CSS custom property support (React 19 removed the index signature). */
export type StyleWithVars = CSSProperties & Record<`--${string}`, string | number | undefined>;
